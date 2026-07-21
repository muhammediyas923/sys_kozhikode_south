const { MongoClient } = require('mongodb');

async function migrate() {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db('sys');
  const collection = db.collection('programs');

  // Map existing programFor to new dashboard flags
  const unitRes = await collection.updateMany(
    { programFor: 'UnitUsers' },
    { $set: { showInUnit: true, showInCircle: false, showInZone: false } }
  );
  console.log('Migrated UnitUsers:', unitRes.modifiedCount);

  const circleRes = await collection.updateMany(
    { programFor: 'CircleUsers' },
    { $set: { showInUnit: false, showInCircle: true, showInZone: false } }
  );
  console.log('Migrated CircleUsers:', circleRes.modifiedCount);

  const zoneRes = await collection.updateMany(
    { programFor: 'ZoneUsers' },
    { $set: { showInUnit: false, showInCircle: false, showInZone: true } }
  );
  console.log('Migrated ZoneUsers:', zoneRes.modifiedCount);

  // For any legacy programs with no programFor (older ones), map to UnitUsers
  const legacyRes = await collection.updateMany(
    { programFor: { $exists: false } },
    { $set: { showInUnit: true, showInCircle: false, showInZone: false } }
  );
  console.log('Migrated legacy (no programFor):', legacyRes.modifiedCount);

  // Clean up programFor field
  const cleanupRes = await collection.updateMany(
    {},
    { $unset: { programFor: "" } }
  );
  console.log('Removed programFor field from:', cleanupRes.modifiedCount);

  await client.close();
}
migrate().catch(console.error);
