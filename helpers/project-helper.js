const { ObjectId } = require('mongodb');
const collections = require('../config/collections');
const db = require('../config/connection');

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function createProject(projectData) {
  const database = db.getDb();
  const project = {
    name: normalizeString(projectData.name),
    description: normalizeString(projectData.description),
    zone: normalizeString(projectData.zone),
    circle: normalizeString(projectData.circle),
    unit: normalizeString(projectData.unit),
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await database.collection(collections.PROJECT_COLLECTION).insertOne(project);
  return result.insertedId;
}

async function getProjectById(id) {
  const database = db.getDb();
  const projectId = typeof id === 'string' ? new ObjectId(id) : id;
  return database.collection(collections.PROJECT_COLLECTION).findOne({ _id: projectId });
}

async function getAllProjects() {
  const database = db.getDb();
  return database.collection(collections.PROJECT_COLLECTION).find().sort({ updatedAt: -1 }).toArray();
}

async function getProjectsBySelection(zone, circle, unit) {
  const database = db.getDb();
  const query = {};
  if (zone) query.zone = normalizeString(zone);
  if (circle) query.circle = normalizeString(circle);
  if (unit) query.unit = normalizeString(unit);
  return database.collection(collections.PROJECT_COLLECTION).find(query).sort({ name: 1 }).toArray();
}

async function getUnitProjectCompletions(zone, circle, unit) {
  const database = db.getDb();
  const query = {
    zone: normalizeString(zone),
    circle: normalizeString(circle),
    unit: normalizeString(unit),
  };
  return database.collection(collections.PROJECT_STATUS_COLLECTION).find(query).toArray();
}

async function setUnitProjectCompletion(projectId, zone, circle, unit, completed) {
  const database = db.getDb();
  const projectObjectId = typeof projectId === 'string' ? new ObjectId(projectId) : projectId;
  const query = {
    projectId: projectObjectId,
    zone: normalizeString(zone),
    circle: normalizeString(circle),
    unit: normalizeString(unit),
  };
  const update = {
    $set: {
      completed: Boolean(completed),
      updatedAt: new Date(),
    },
  };
  const options = { upsert: true };
  const result = await database.collection(collections.PROJECT_STATUS_COLLECTION).updateOne(query, update, options);
  return result.modifiedCount > 0 || result.upsertedCount > 0;
}

async function updateProject(id, projectData) {
  const database = db.getDb();
  const projectId = typeof id === 'string' ? new ObjectId(id) : id;
  const update = {
    $set: {
      name: normalizeString(projectData.name),
      description: normalizeString(projectData.description),
      zone: normalizeString(projectData.zone),
      circle: normalizeString(projectData.circle),
      unit: normalizeString(projectData.unit),
      updatedAt: new Date(),
    },
  };
  const result = await database.collection(collections.PROJECT_COLLECTION).updateOne({ _id: projectId }, update);
  return result.modifiedCount > 0;
}

async function setProjectCompletion(id, completed) {
  const database = db.getDb();
  const projectId = typeof id === 'string' ? new ObjectId(id) : id;
  const result = await database.collection(collections.PROJECT_COLLECTION).updateOne(
    { _id: projectId },
    { $set: { completed: Boolean(completed), updatedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

async function deleteProject(id) {
  const database = db.getDb();
  const projectId = typeof id === 'string' ? new ObjectId(id) : id;
  const result = await database.collection(collections.PROJECT_COLLECTION).deleteOne({ _id: projectId });
  return result.deletedCount > 0;
}

async function getProjectCount() {
  const database = db.getDb();
  return database.collection(collections.PROJECT_COLLECTION).countDocuments();
}

async function getProjectProgressSummary() {
  const database = db.getDb();
  const progress = await database
    .collection(collections.PROJECT_COLLECTION)
    .aggregate([
      {
        $group: {
          _id: { zone: '$zone', circle: '$circle', unit: '$unit' },
          totalProjects: { $sum: 1 },
          completedProjects: { $sum: { $cond: ['$completed', 1, 0] } },
          projects: { $push: '$name' },
        },
      },
      {
        $project: {
          _id: 0,
          zone: '$_id.zone',
          circle: '$_id.circle',
          unit: '$_id.unit',
          totalProjects: 1,
          completedProjects: 1,
          projects: 1,
          completionRate: {
            $cond: [
              { $eq: ['$totalProjects', 0] },
              0,
              { $round: [{ $multiply: [{ $divide: ['$completedProjects', '$totalProjects'] }, 100] }, 0] },
            ],
          },
        },
      },
      { $sort: { zone: 1, circle: 1, unit: 1 } },
    ])
    .toArray();
  return progress;
}

async function getProjectMonitoring() {
  const database = db.getDb();
  // load all projects
  const projects = await database.collection(collections.PROJECT_COLLECTION).find().toArray();
  // load all location units
  const locationsDoc = await database.collection(collections.LOCATION_COLLECTION).findOne({ type: 'default' });
  const units = [];
  if (locationsDoc && Array.isArray(locationsDoc.zones)) {
    locationsDoc.zones.forEach((z) => {
      const zname = z.name;
      (z.circles || []).forEach((c) => {
        const cname = c.name;
        (c.units || []).forEach((u) => {
          units.push({ zone: zname, circle: cname, unit: u });
        });
      });
    });
  }

  // load all project status entries
  const statuses = await database.collection(collections.PROJECT_STATUS_COLLECTION).find().toArray();

  // map statuses by projectId and location key
  const statusMap = new Map();
  statuses.forEach((s) => {
    const pid = s.projectId ? s.projectId.toString() : '';
    const key = `${pid}||${s.zone}||${s.circle}||${s.unit}`;
    statusMap.set(key, Boolean(s.completed));
  });

  const monitoring = projects.map((p) => {
    const pid = p._id.toString();
    const completeUnits = [];

    units.forEach((loc) => {
      const key = `${pid}||${loc.zone}||${loc.circle}||${loc.unit}`;
      if (statusMap.has(key) && statusMap.get(key)) {
        completeUnits.push(`${loc.zone} > ${loc.circle} > ${loc.unit}`);
      }
    });

    const notCompleteCount = units.length - completeUnits.length;

    return {
      projectId: pid,
      name: p.name,
      completeUnits,
      notCompleteCount,
    };
  });

  return monitoring;
}

module.exports = {
  createProject,
  getProjectById,
  getAllProjects,
  getProjectsBySelection,
  getUnitProjectCompletions,
  setUnitProjectCompletion,
  updateProject,
  deleteProject,
  setProjectCompletion,
  getProjectCount,
  getProjectProgressSummary,
  getProjectMonitoring,
};
