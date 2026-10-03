const collections = require('../config/collections');
const db = require('../config/connection');
const bcrypt = require('bcrypt');
const { ObjectId } = require('mongodb');

function normalize(val) {
  return typeof val === 'string' ? val.trim() : '';
}

async function seedDefaultZones() {
  // Automatic zone creation permanently disabled.
  // Zones must only be created manually by Super Admin.
  return;
}

async function getAllZones() {
  const database = db.getDb();
  return database
    .collection(collections.ZONES_COLLECTION)
    .find()
    .sort({ name: 1 })
    .toArray();
}

async function getZoneById(id) {
  const database = db.getDb();
  return database
    .collection(collections.ZONES_COLLECTION)
    .findOne({ _id: new ObjectId(id) });
}

async function createZone(data) {
  const database = db.getDb();
  const cleanName = normalize(data.name);
  const cleanUsername = normalize(data.username);
  
  if (cleanUsername) {
    const existingUser = await database.collection(collections.ZONES_COLLECTION).findOne({ username: cleanUsername });
    if (existingUser) throw new Error('Username already exists in Zones.');
  }

  let hashed = '';
  if (data.password) {
    hashed = await bcrypt.hash(normalize(data.password), 10);
  }

  const result = await database.collection(collections.ZONES_COLLECTION).insertOne({
    name: cleanName,
    code: normalize(data.code),
    username: cleanUsername,
    password: hashed,
    status: data.status || 'Active',
    createdAt: new Date()
  });
  return result.insertedId;
}

async function updateZone(id, data) {
  const database = db.getDb();
  
  const updateDoc = {
    $set: {
      name: normalize(data.name),
      code: normalize(data.code),
      status: data.status || 'Active',
      updatedAt: new Date()
    }
  };

  const cleanUsername = normalize(data.username);
  if (cleanUsername) {
    const existing = await database.collection(collections.ZONES_COLLECTION).findOne({ username: cleanUsername, _id: { $ne: new ObjectId(id) } });
    if (existing) throw new Error('Username already exists in Zones.');
    updateDoc.$set.username = cleanUsername;
  }

  if (data.password && normalize(data.password)) {
    updateDoc.$set.password = await bcrypt.hash(normalize(data.password), 10);
  }

  const result = await database
    .collection(collections.ZONES_COLLECTION)
    .updateOne({ _id: new ObjectId(id) }, updateDoc);
  return result.modifiedCount > 0;
}

async function deleteZone(id) {
  const database = db.getDb();
  const zone = await getZoneById(id);
  if (!zone) return false;

  // Cascade delete circles under this zone
  await database.collection(collections.CIRCLES_COLLECTION).deleteMany({ zoneId: new ObjectId(id) });

  const result = await database
    .collection(collections.ZONES_COLLECTION)
    .deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

async function doZoneLogin({ username, password }) {
  const database = db.getDb();
  const uname = normalize(username);
  const pwd = normalize(password);

  if (!uname || !pwd) {
    return { status: false, message: 'Username and password are required.' };
  }

  const user = await database.collection(collections.ZONES_COLLECTION).findOne({ username: uname });
  if (!user) {
    return { status: false, message: 'Invalid credentials.' };
  }
  if (user.status !== 'Active') {
    return { status: false, message: 'Your zone account is inactive.' };
  }

  const match = await bcrypt.compare(pwd, user.password || '');
  if (!match) {
    return { status: false, message: 'Invalid credentials.' };
  }

  return {
    status: true,
    user: {
      _id: user._id.toString(),
      unitName: user.name, // Mapping zone name to unitName for dashboard compatibility
      username: user.username,
      role: 'ZoneUser',
      zone: user.name,
      zoneId: user._id.toString(),
      circle: 'All Circles',
      status: user.status,
    },
  };
}

module.exports = {
  seedDefaultZones,
  getAllZones,
  getZoneById,
  createZone,
  updateZone,
  deleteZone,
  doZoneLogin
};
