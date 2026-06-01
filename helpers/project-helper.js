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

module.exports = {
  createProject,
  getProjectById,
  getAllProjects,
  getProjectsBySelection,
  updateProject,
  deleteProject,
  setProjectCompletion,
  getProjectCount,
  getProjectProgressSummary,
};
