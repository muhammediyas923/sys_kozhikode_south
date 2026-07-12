const { ObjectId } = require('mongodb');
const collections = require('../config/collections');
const db = require('../config/connection');
const path = require('path');
const fs = require('fs');

function normalize(val) {
  return typeof val === 'string' ? val.trim() : '';
}

async function getAllPrograms() {
  const database = db.getDb();
  return database
    .collection(collections.PROGRAMS_COLLECTION)
    .find()
    .sort({ createdAt: -1 })
    .toArray();
}

async function getPublishedPrograms() {
  const database = db.getDb();
  return database
    .collection(collections.PROGRAMS_COLLECTION)
    .find({ published: true })
    .sort({ createdAt: -1 })
    .toArray();
}

async function getProgramById(id) {
  const database = db.getDb();
  return database
    .collection(collections.PROGRAMS_COLLECTION)
    .findOne({ _id: new ObjectId(id) });
}

async function createProgram(data, files) {
  const database = db.getDb();
  const attachments = [];
  if (files && files.length) {
    files.forEach((f) => {
      attachments.push({
        originalName: f.originalname,
        filename: f.filename,
        mimetype: f.mimetype,
        size: f.size,
        url: `/uploads/programs/${f.filename}`,
      });
    });
  }
  const result = await database.collection(collections.PROGRAMS_COLLECTION).insertOne({
    title: normalize(data.title),
    description: normalize(data.description),
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    attachments,
    published: false,
    createdBy: normalize(data.createdBy),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return result.insertedId;
}

async function updateProgram(id, data, files) {
  const database = db.getDb();
  const update = {
    $set: {
      title: normalize(data.title),
      description: normalize(data.description),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      updatedAt: new Date(),
    },
  };
  if (files && files.length) {
    const newAttachments = files.map((f) => ({
      originalName: f.originalname,
      filename: f.filename,
      mimetype: f.mimetype,
      size: f.size,
      url: `/uploads/programs/${f.filename}`,
    }));
    update.$push = { attachments: { $each: newAttachments } };
  }
  const result = await database
    .collection(collections.PROGRAMS_COLLECTION)
    .updateOne({ _id: new ObjectId(id) }, update);
  return result.modifiedCount > 0;
}

async function publishProgram(id) {
  const database = db.getDb();
  const result = await database
    .collection(collections.PROGRAMS_COLLECTION)
    .updateOne({ _id: new ObjectId(id) }, { $set: { published: true, publishedAt: new Date(), updatedAt: new Date() } });
  return result.modifiedCount > 0;
}

async function unpublishProgram(id) {
  const database = db.getDb();
  const result = await database
    .collection(collections.PROGRAMS_COLLECTION)
    .updateOne({ _id: new ObjectId(id) }, { $set: { published: false, updatedAt: new Date() } });
  return result.modifiedCount > 0;
}

async function deleteProgram(id) {
  const database = db.getDb();
  // Delete associated attachments from disk
  const program = await getProgramById(id);
  if (program && program.attachments) {
    program.attachments.forEach((att) => {
      const filePath = path.join(__dirname, '..', 'public', 'uploads', 'programs', att.filename);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
      }
    });
  }
  // Delete completions for this program
  await database
    .collection(collections.PROGRAM_COMPLETIONS_COLLECTION)
    .deleteMany({ programId: new ObjectId(id) });
  const result = await database
    .collection(collections.PROGRAMS_COLLECTION)
    .deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

async function markCompletion(programId, userId, unitData) {
  const database = db.getDb();
  const existing = await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION).findOne({
    programId: new ObjectId(programId),
    userId: normalize(userId),
  });
  if (existing) {
    // Toggle: if already completed, uncomplete
    const newStatus = !existing.completed;
    await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION).updateOne(
      { _id: existing._id },
      { $set: { completed: newStatus, updatedAt: new Date(), completedAt: newStatus ? new Date() : null } }
    );
    return { completed: newStatus };
  }
  // New completion record
  const completedAt = new Date();
  await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION).insertOne({
    programId: new ObjectId(programId),
    userId: normalize(userId),
    zone: normalize(unitData.zone),
    circle: normalize(unitData.circle),
    unitName: normalize(unitData.unitName),
    username: normalize(unitData.username),
    completed: true,
    completedAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { completed: true };
}

async function setCompletion(programId, userId, completed) {
  const database = db.getDb();
  const existing = await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION).findOne({
    programId: new ObjectId(programId),
    userId: normalize(userId),
  });
  const now = new Date();
  if (existing) {
    await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION).updateOne(
      { _id: existing._id },
      { $set: { completed: Boolean(completed), updatedAt: now, completedAt: completed ? now : null } }
    );
  } else if (completed) {
    throw new Error('Completion record not found.');
  }
  return true;
}

async function getUserCompletions(userId) {
  const database = db.getDb();
  return database
    .collection(collections.PROGRAM_COMPLETIONS_COLLECTION)
    .find({ userId: normalize(userId) })
    .toArray();
}

async function getProgramsWithCompletion(userId, options = {}) {
  const database = db.getDb();
  const programs = options.publishedOnly ? await getPublishedPrograms() : await getAllPrograms();
  const completions = await getUserCompletions(userId);
  const completionMap = new Map(
    completions.map((c) => [c.programId.toString(), c])
  );
  return programs.map((p) => {
    const completion = completionMap.get(p._id.toString());
    return {
      ...p,
      completed: completion ? completion.completed : false,
      completedAt: completion ? completion.completedAt : null,
    };
  });
}

async function getDashboardAnalytics() {
  const database = db.getDb();
  const totalZones = await database.collection(collections.ZONES_COLLECTION).countDocuments();
  const totalCircles = await database.collection(collections.CIRCLES_COLLECTION).countDocuments();
  const totalUnits = await database
    .collection(collections.USERS_COLLECTION)
    .countDocuments({ role: 'UnitUser' });
  const activeUsers = await database
    .collection(collections.USERS_COLLECTION)
    .countDocuments({ role: 'UnitUser', status: 'Active' });
  const totalPrograms = await database
    .collection(collections.PROGRAMS_COLLECTION)
    .countDocuments();
  const publishedPrograms = await database
    .collection(collections.PROGRAMS_COLLECTION)
    .countDocuments({ published: true });
  const completedCount = await database
    .collection(collections.PROGRAM_COMPLETIONS_COLLECTION)
    .countDocuments({ completed: true });

  // Zone-wise completion aggregation
  const zoneWiseData = await database
    .collection(collections.PROGRAM_COMPLETIONS_COLLECTION)
    .aggregate([
      { $match: { completed: true } },
      { $group: { _id: '$zone', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  // Recent completions (last 10)
  const recentCompletions = await database
    .collection(collections.PROGRAM_COMPLETIONS_COLLECTION)
    .find({ completed: true })
    .sort({ completedAt: -1 })
    .limit(10)
    .toArray();

  // Enrich recent completions with program titles
  const programIds = [...new Set(recentCompletions.map((c) => c.programId.toString()))];
  const programDocs = await database
    .collection(collections.PROGRAMS_COLLECTION)
    .find({ _id: { $in: programIds.map((id) => new ObjectId(id)) } })
    .toArray();
  const programMap = new Map(programDocs.map((p) => [p._id.toString(), p.title]));
  const enrichedCompletions = recentCompletions.map((c) => ({
    ...c,
    programTitle: programMap.get(c.programId.toString()) || 'Unknown Program',
  }));

  const totalPossibleCompletions = totalUnits * publishedPrograms;
  const completionPercentage =
    totalPossibleCompletions > 0
      ? Math.round((completedCount / totalPossibleCompletions) * 100)
      : 0;

  return {
    totalZones,
    totalCircles,
    totalUnits,
    activeUsers,
    inactiveUsers: totalUnits - activeUsers,
    totalPrograms,
    publishedPrograms,
    completedPrograms: completedCount,
    pendingPrograms: totalPossibleCompletions - completedCount,
    completionPercentage,
    zoneWiseData,
    recentCompletions: enrichedCompletions,
  };
}

async function getCompletionReport(filters = {}) {
  const database = db.getDb();
  const query = {};
  if (filters.zone) query.zone = filters.zone;
  if (filters.circle) query.circle = filters.circle;
  if (filters.unitName) query.unitName = { $regex: filters.unitName, $options: 'i' };
  if (filters.status === 'completed') query.completed = true;
  if (filters.status === 'pending') query.completed = false;
  if (filters.programId) query.programId = new ObjectId(filters.programId);

  const completions = await database
    .collection(collections.PROGRAM_COMPLETIONS_COLLECTION)
    .find(query)
    .sort({ completedAt: -1 })
    .toArray();

  // Enrich with program title
  const programIds = [...new Set(completions.map((c) => c.programId.toString()))];
  const programDocs = await database
    .collection(collections.PROGRAMS_COLLECTION)
    .find({ _id: { $in: programIds.map((id) => new ObjectId(id)) } })
    .toArray();
  const programMap = new Map(programDocs.map((p) => [p._id.toString(), p.title]));

  return completions.map((c) => ({
    ...c,
    programTitle: programMap.get(c.programId.toString()) || 'Unknown Program',
  }));
}

module.exports = {
  getAllPrograms,
  getPublishedPrograms,
  getProgramById,
  createProgram,
  updateProgram,
  publishProgram,
  unpublishProgram,
  deleteProgram,
  markCompletion,
  setCompletion,
  getUserCompletions,
  getProgramsWithCompletion,
  getDashboardAnalytics,
  getCompletionReport,
};
