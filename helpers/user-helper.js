const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const collections = require('../config/collections');
const db = require('../config/connection');

function normalize(val) {
  return typeof val === 'string' ? val.trim() : '';
}

async function seedSuperAdmin() {
  const database = db.getDb();
  const existing = await database
    .collection(collections.USERS_COLLECTION)
    .findOne({ role: 'SuperAdmin' });
  if (!existing) {
    const password = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@1234';
    const hashed = await bcrypt.hash(password, 10);
    await database.collection(collections.USERS_COLLECTION).insertOne({
      unitName: 'Super Admin',
      username: process.env.SUPER_ADMIN_USERNAME || 'superadmin',
      password: hashed,
      role: 'SuperAdmin',
      status: 'Active',
      zoneId: null,
      circleName: null,
      createdAt: new Date(),
    });
    console.log('Super Admin account seeded.');
  }
}

async function doLogin({ zone = '', circle = '', username, password, isAdminLogin = false }) {
  const database = db.getDb();
  const uname = normalize(username);
  const pwd = normalize(password);

  if (!uname || !pwd) {
    return { status: false, message: 'Username and password are required.' };
  }

  let user;

  // First, check if the username belongs to a SuperAdmin in the database
  const superAdmin = await database
    .collection(collections.USERS_COLLECTION)
    .findOne({ username: uname, role: 'SuperAdmin' });

  if (superAdmin) {
    // Super Admin login — username only (no zone/circle required)
    user = superAdmin;
  } else {
    if (isAdminLogin) {
      return { status: false, message: 'Invalid credentials.' };
    }
    // Unit user — must match zone, circle, username
    if (!zone || !circle) {
      return { status: false, message: 'Zone and Circle are required.' };
    }
    user = await database.collection(collections.USERS_COLLECTION).findOne({
      username: uname,
      zone: normalize(zone),
      circle: normalize(circle),
      role: 'UnitUser',
    });
  }

  if (!user) {
    return { status: false, message: 'Invalid credentials.' };
  }

  if (user.status !== 'Active') {
    return { status: false, message: 'Your account is inactive. Contact the administrator.' };
  }

  const match = await bcrypt.compare(pwd, user.password);
  if (!match) {
    return { status: false, message: 'Invalid credentials.' };
  }

  return {
    status: true,
    user: {
      _id: user._id.toString(),
      unitName: user.unitName,
      username: user.username,
      role: user.role,
      zone: user.zone || null,
      circle: user.circle || null,
      status: user.status,
    },
  };
}

async function getAllUsers(filters = {}) {
  const database = db.getDb();
  const query = { role: 'UnitUser' };
  if (filters.zone) query.zone = filters.zone;
  if (filters.circle) query.circle = filters.circle;
  if (filters.status) query.status = filters.status;
  if (filters.search) {
    query.$or = [
      { unitName: { $regex: filters.search, $options: 'i' } },
      { username: { $regex: filters.search, $options: 'i' } },
    ];
  }
  return database
    .collection(collections.USERS_COLLECTION)
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();
}

async function getUserById(id) {
  const database = db.getDb();
  return database
    .collection(collections.USERS_COLLECTION)
    .findOne({ _id: new ObjectId(id) });
}

async function isUsernameTaken(username, excludeId = null) {
  const database = db.getDb();
  const query = { username: normalize(username) };
  if (excludeId) {
    query._id = { $ne: new ObjectId(excludeId) };
  }
  const result = await database.collection(collections.USERS_COLLECTION).findOne(query);
  return result != null;
}

async function updateUsername(id, username) {
  const database = db.getDb();
  const result = await database
    .collection(collections.USERS_COLLECTION)
    .updateOne(
      { _id: new ObjectId(id) },
      { $set: { username: normalize(username), updatedAt: new Date() } }
    );
  return result.modifiedCount > 0;
}

async function verifyPassword(id, password) {
  const user = await getUserById(id);
  if (!user || !user.password) return false;
  return bcrypt.compare(normalize(password), user.password);
}

async function createUser(data) {
  const database = db.getDb();
  const existing = await database
    .collection(collections.USERS_COLLECTION)
    .findOne({ username: normalize(data.username) });
  if (existing) {
    throw new Error('Username already exists.');
  }
  const hashed = await bcrypt.hash(normalize(data.password), 10);
  const result = await database.collection(collections.USERS_COLLECTION).insertOne({
    unitName: normalize(data.unitName),
    code: normalize(data.code),
    username: normalize(data.username),
    password: hashed,
    role: 'UnitUser',
    zone: normalize(data.zone),
    zoneId: data.zoneId ? new ObjectId(data.zoneId) : null,
    circle: normalize(data.circle),
    circleId: data.circleId ? new ObjectId(data.circleId) : null,
    status: 'Active',
    createdAt: new Date(),
  });
  return result.insertedId;
}

async function updateUser(id, data) {
  const database = db.getDb();
  const update = {
    $set: {
      unitName: normalize(data.unitName),
      code: normalize(data.code),
      username: normalize(data.username),
      zone: normalize(data.zone),
      circle: normalize(data.circle),
      updatedAt: new Date(),
    },
  };
  if (data.zoneId) update.$set.zoneId = new ObjectId(data.zoneId);
  if (data.circleId) update.$set.circleId = new ObjectId(data.circleId);

  const result = await database
    .collection(collections.USERS_COLLECTION)
    .updateOne({ _id: new ObjectId(id) }, update);
  return result.modifiedCount > 0;
}

async function deleteUser(id) {
  const database = db.getDb();
  const result = await database
    .collection(collections.USERS_COLLECTION)
    .deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

async function setUserStatus(id, status) {
  const database = db.getDb();
  const result = await database
    .collection(collections.USERS_COLLECTION)
    .updateOne({ _id: new ObjectId(id) }, { $set: { status, updatedAt: new Date() } });
  return result.modifiedCount > 0;
}

async function resetPassword(id, newPassword) {
  const database = db.getDb();
  const hashed = await bcrypt.hash(normalize(newPassword), 10);
  const result = await database
    .collection(collections.USERS_COLLECTION)
    .updateOne({ _id: new ObjectId(id) }, { $set: { password: hashed, updatedAt: new Date() } });
  return result.modifiedCount > 0;
}

async function countUsers() {
  const database = db.getDb();
  const total = await database
    .collection(collections.USERS_COLLECTION)
    .countDocuments({ role: 'UnitUser' });
  const active = await database
    .collection(collections.USERS_COLLECTION)
    .countDocuments({ role: 'UnitUser', status: 'Active' });
  return { total, active, inactive: total - active };
}

module.exports = {
  seedSuperAdmin,
  doLogin,
  getAllUsers,
  getUserById,
  isUsernameTaken,
  createUser,
  updateUser,
  updateUsername,
  verifyPassword,
  deleteUser,
  setUserStatus,
  resetPassword,
  countUsers,
};
