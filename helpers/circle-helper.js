const { ObjectId } = require('mongodb');
const collections = require('../config/collections');
const db = require('../config/connection');
const bcrypt = require('bcrypt');

function normalize(val) {
  return typeof val === 'string' ? val.trim() : '';
}

async function seedDefaultCircles() {
  const database = db.getDb();
  const count = await database.collection(collections.CIRCLES_COLLECTION).countDocuments();
  if (count > 0) return;

  const zones = await database.collection(collections.ZONES_COLLECTION).find().toArray();
  const zoneCircleCounts = [5, 5, 5, 5, 5, 5, 5, 5, 5, 4];
  let circleIndex = 1;
  let unitIndex = 1;
  let extraUnits = 8;

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const circleCount = zoneCircleCounts[i] || 5;
    for (let c = 0; c < circleCount; c++) {
      const unitsCount = 10 + (extraUnits > 0 ? 1 : 0);
      if (extraUnits > 0) extraUnits--;
      const units = [];
      for (let u = 0; u < unitsCount; u++) {
        units.push(`Unit ${unitIndex}`);
        unitIndex++;
      }
      await database.collection(collections.CIRCLES_COLLECTION).insertOne({
        name: `Circle ${circleIndex}`,
        code: '',
        username: '',
        password: '',
        status: 'Active',
        zoneName: zone.name,
        zoneId: zone._id,
        units,
        createdAt: new Date(),
      });
      circleIndex++;
    }
  }
  console.log('Default circles seeded.');
}

async function getAllCircles() {
  const database = db.getDb();
  return database
    .collection(collections.CIRCLES_COLLECTION)
    .find()
    .sort({ zoneName: 1, name: 1 })
    .toArray();
}

async function getCirclesByZone(zoneId) {
  const database = db.getDb();
  return database
    .collection(collections.CIRCLES_COLLECTION)
    .find({ zoneId: new ObjectId(zoneId) })
    .sort({ name: 1 })
    .toArray();
}

async function getCirclesByZoneName(zoneName) {
  const database = db.getDb();
  return database
    .collection(collections.CIRCLES_COLLECTION)
    .find({ zoneName: normalize(zoneName) })
    .sort({ name: 1 })
    .toArray();
}

async function getCircleById(id) {
  const database = db.getDb();
  return database
    .collection(collections.CIRCLES_COLLECTION)
    .findOne({ _id: new ObjectId(id) });
}

async function createCircle(data) {
  const database = db.getDb();
  const cleanName = normalize(data.name);
  const cleanUsername = normalize(data.username);

  if (cleanUsername) {
    const existingUser = await database.collection(collections.CIRCLES_COLLECTION).findOne({ username: cleanUsername });
    if (existingUser) throw new Error('Username already exists in Circles.');
  }

  let hashed = '';
  if (data.password) {
    hashed = await bcrypt.hash(normalize(data.password), 10);
  }

  const result = await database.collection(collections.CIRCLES_COLLECTION).insertOne({
    name: cleanName,
    code: normalize(data.code),
    username: cleanUsername,
    password: hashed,
    status: data.status || 'Active',
    zoneName: normalize(data.zoneName),
    zoneId: new ObjectId(data.zoneId),
    units: [],
    createdAt: new Date(),
  });
  return result.insertedId;
}

async function updateCircle(id, data) {
  const database = db.getDb();
  const updateDoc = {
    $set: {
      name: normalize(data.name),
      code: normalize(data.code),
      status: data.status || 'Active',
      updatedAt: new Date(),
    },
  };

  if (data.zoneId) {
    updateDoc.$set.zoneId = new ObjectId(data.zoneId);
    updateDoc.$set.zoneName = normalize(data.zoneName);
  }

  const cleanUsername = normalize(data.username);
  if (cleanUsername) {
    const existing = await database.collection(collections.CIRCLES_COLLECTION).findOne({ username: cleanUsername, _id: { $ne: new ObjectId(id) } });
    if (existing) throw new Error('Username already exists in Circles.');
    updateDoc.$set.username = cleanUsername;
  }

  if (data.password && normalize(data.password)) {
    updateDoc.$set.password = await bcrypt.hash(normalize(data.password), 10);
  }

  const result = await database
    .collection(collections.CIRCLES_COLLECTION)
    .updateOne({ _id: new ObjectId(id) }, updateDoc);
  return result.modifiedCount > 0;
}

async function deleteCircle(id) {
  const database = db.getDb();
  const result = await database
    .collection(collections.CIRCLES_COLLECTION)
    .deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

async function getUnitsByCircle(circleId) {
  const database = db.getDb();
  const circle = await getCircleById(circleId);
  return circle ? circle.units || [] : [];
}

async function getUnitsByCircleName(zoneName, circleName) {
  const database = db.getDb();
  const circle = await database.collection(collections.CIRCLES_COLLECTION).findOne({
    zoneName: normalize(zoneName),
    name: normalize(circleName),
  });
  return circle ? circle.units || [] : [];
}

async function doCircleLogin({ zoneId, username, password }) {
  const database = db.getDb();
  const uname = normalize(username);
  const pwd = normalize(password);

  if (!zoneId || !uname || !pwd) {
    return { status: false, message: 'Zone, username, and password are required.' };
  }

  const user = await database.collection(collections.CIRCLES_COLLECTION).findOne({ 
    zoneId: new ObjectId(zoneId),
    username: uname 
  });

  if (!user) {
    return { status: false, message: 'Invalid credentials.' };
  }
  if (user.status !== 'Active') {
    return { status: false, message: 'Your circle account is inactive.' };
  }

  const match = await bcrypt.compare(pwd, user.password || '');
  if (!match) {
    return { status: false, message: 'Invalid credentials.' };
  }

  return {
    status: true,
    user: {
      _id: user._id.toString(),
      unitName: user.name, // Mapping circle name to unitName for dashboard compatibility
      username: user.username,
      role: 'CircleUser',
      zone: user.zoneName,
      zoneId: user.zoneId.toString(),
      circle: user.name,
      circleId: user._id.toString(),
      status: user.status,
    },
  };
}

module.exports = {
  seedDefaultCircles,
  getAllCircles,
  getCirclesByZone,
  getCirclesByZoneName,
  getCircleById,
  createCircle,
  updateCircle,
  deleteCircle,
  getUnitsByCircle,
  getUnitsByCircleName,
  doCircleLogin
};
