const collections = require('../config/collections');
const db = require('../config/connection');

function normalize(val) {
  return typeof val === 'string' ? val.trim() : '';
}

async function seedDefaultZones() {
  const database = db.getDb();
  const count = await database.collection(collections.ZONES_COLLECTION).countDocuments();
  if (count > 0) return;

  const defaultZones = [
    { name: 'Koduvally' },
    { name: 'Zone 2' },
    { name: 'Zone 3' },
    { name: 'Zone 4' },
    { name: 'Zone 5' },
    { name: 'Zone 6' },
    { name: 'Zone 7' },
    { name: 'Zone 8' },
    { name: 'Zone 9' },
    { name: 'Zone 10' }
  ];

  for (const zone of defaultZones) {
    await database.collection(collections.ZONES_COLLECTION).insertOne({
      name: zone.name,
      createdAt: new Date()
    });
  }
  console.log('Default zones seeded.');
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
  const { ObjectId } = require('mongodb');
  return database
    .collection(collections.ZONES_COLLECTION)
    .findOne({ _id: new ObjectId(id) });
}

async function createZone(name) {
  const database = db.getDb();
  const cleanName = normalize(name);
  const existing = await database
    .collection(collections.ZONES_COLLECTION)
    .findOne({ name: cleanName });
  if (existing) {
    throw new Error('Zone already exists.');
  }
  const result = await database.collection(collections.ZONES_COLLECTION).insertOne({
    name: cleanName,
    createdAt: new Date()
  });
  return result.insertedId;
}

async function updateZone(id, name) {
  const database = db.getDb();
  const { ObjectId } = require('mongodb');
  const result = await database
    .collection(collections.ZONES_COLLECTION)
    .updateOne({ _id: new ObjectId(id) }, { $set: { name: normalize(name), updatedAt: new Date() } });
  return result.modifiedCount > 0;
}

async function deleteZone(id) {
  const database = db.getDb();
  const { ObjectId } = require('mongodb');
  const zone = await getZoneById(id);
  if (!zone) return false;

  // Cascade delete circles under this zone
  await database.collection(collections.CIRCLES_COLLECTION).deleteMany({ zoneId: new ObjectId(id) });

  const result = await database
    .collection(collections.ZONES_COLLECTION)
    .deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

module.exports = {
  seedDefaultZones,
  getAllZones,
  getZoneById,
  createZone,
  updateZone,
  deleteZone
};
