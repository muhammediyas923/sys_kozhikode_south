const collections = require('../config/collections');
const db = require('../config/connection');

function buildDefaultLocations() {
  const zones = [];
  let circleIndex = 1;
  let unitIndex = 1;
  const zoneCircleCounts = [5, 5, 5, 5, 5, 5, 5, 5, 5, 4];
  let extraUnits = 8;

  for (let zoneNumber = 1; zoneNumber <= 10; zoneNumber += 1) {
    const circleCount = zoneCircleCounts[zoneNumber - 1];
    const circles = [];
    for (let circleNumber = 1; circleNumber <= circleCount; circleNumber += 1) {
      const units = [];
      const unitsCount = 10 + (extraUnits > 0 ? 1 : 0);
      if (extraUnits > 0) {
        extraUnits -= 1;
      }
      for (let unitNumber = 1; unitNumber <= unitsCount; unitNumber += 1) {
        units.push(`Unit ${unitIndex}`);
        unitIndex += 1;
      }
      circles.push({
        name: `Circle ${circleIndex}`,
        units,
      });
      circleIndex += 1;
    }
    zones.push({
      name: `Zone ${zoneNumber}`,
      circles,
    });
  }

  return {
    type: 'default',
    totalZones: 10,
    totalCircles: 49,
    totalUnits: 498,
    zones,
  };
}

async function seedDefaultLocations() {
  const database = db.getDb();
  const existing = await database.collection(collections.LOCATION_COLLECTION).findOne({ type: 'default' });
  if (!existing) {
    const defaultLocations = buildDefaultLocations();
    await database.collection(collections.LOCATION_COLLECTION).insertOne(defaultLocations);
  }
}

async function getLocations() {
  const database = db.getDb();
  const locations = await database.collection(collections.LOCATION_COLLECTION).findOne({ type: 'default' });
  if (locations) {
    return locations;
  }
  const fallback = buildDefaultLocations();
  return fallback;
}

module.exports = {
  seedDefaultLocations,
  getLocations,
};
