const { ObjectId } = require('mongodb');
const collections = require('../config/collections');
const db = require('../config/connection');

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

async function createCircle(zoneId, zoneName, name) {
  const database = db.getDb();
  const result = await database.collection(collections.CIRCLES_COLLECTION).insertOne({
    name: normalize(name),
    zoneName: normalize(zoneName),
    zoneId: new ObjectId(zoneId),
    units: [],
    createdAt: new Date(),
  });
  return result.insertedId;
}

async function updateCircle(id, data) {
  const database = db.getDb();
  const update = {
    $set: {
      name: normalize(data.name),
      updatedAt: new Date(),
    },
  };
  if (data.zoneId) {
    update.$set.zoneId = new ObjectId(data.zoneId);
    update.$set.zoneName = normalize(data.zoneName);
  }
  const result = await database
    .collection(collections.CIRCLES_COLLECTION)
    .updateOne({ _id: new ObjectId(id) }, update);
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
};
