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
    requiredCount: data.requiredCount ? parseInt(data.requiredCount, 10) || 1 : 1,
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
      requiredCount: data.requiredCount ? parseInt(data.requiredCount, 10) || 1 : 1,
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

async function setCompletion(programId, userId, completed, unitData) {
  const database = db.getDb();

  // Retrieve user details if not provided or incomplete
  let details = unitData || {};
  if (!details.zone || !details.circle || !details.unitName || !details.username) {
    const user = await database.collection(collections.USERS_COLLECTION).findOne({
      $or: [
        { _id: new ObjectId(userId) },
        { _id: userId }
      ]
    });
    if (user) {
      details = {
        zone: user.zone,
        circle: user.circle,
        unitName: user.unitName,
        username: user.username,
      };
    }
  }

  const existing = await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION).findOne({
    programId: new ObjectId(programId),
    userId: normalize(userId),
  });

  const now = new Date();
  if (existing) {
    await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION).updateOne(
      { _id: existing._id },
      {
        $set: {
          completed: Boolean(completed),
          updatedAt: now,
          completedAt: completed ? now : null,
          zone: normalize(details.zone || existing.zone),
          circle: normalize(details.circle || existing.circle),
          unitName: normalize(details.unitName || existing.unitName),
          username: normalize(details.username || existing.username)
        }
      }
    );
    return { completed: Boolean(completed) };
  }

  if (completed) {
    await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION).insertOne({
      programId: new ObjectId(programId),
      userId: normalize(userId),
      zone: normalize(details.zone),
      circle: normalize(details.circle),
      unitName: normalize(details.unitName),
      username: normalize(details.username),
      completed: true,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { completed: true };
  }

  return { completed: false };
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
    const requiredCount = p.requiredCount || 1;
    const completionCount = completion ? (completion.completionCount || 0) : 0;
    // Always calculate progress from actual count vs target
    const progressPct = requiredCount > 0
      ? Math.min(100, Math.round((completionCount / requiredCount) * 100))
      : 0;
    // Auto-derive completed status from target
    const isCompleted = completionCount >= requiredCount;
    return {
      ...p,
      completed: isCompleted,
      completedAt: completion ? completion.completedAt : null,
      completionCount,
      completionDate: completion ? (completion.completionDate || null) : null,
      participantsCount: completion ? (completion.participantsCount || 0) : 0,
      notes: completion ? (completion.notes || '') : '',
      images: completion ? (completion.images || []) : [],
      requiredCount,
      progressPct,
    };
  });
}

// Submit a structured completion (from the modal form)
// Additive: creates a new update record and recalculates totals
async function submitCompletion(programId, userId, unitData, { completionCount, participantsCount, completionDate, notes, images }) {
  const database = db.getDb();

  let details = unitData || {};
  if (!details.zone || !details.circle || !details.unitName || !details.username) {
    const user = await database.collection(collections.USERS_COLLECTION).findOne({
      $or: [{ _id: new ObjectId(userId) }, { _id: userId }],
    });
    if (user) {
      details = { zone: user.zone, circle: user.circle, unitName: user.unitName, username: user.username };
    }
  }

  const compDate = completionDate ? new Date(completionDate) : new Date();
  const now = new Date();

  // Create update record
  await database.collection(collections.PROGRAM_UPDATES_COLLECTION).insertOne({
    programId: new ObjectId(programId),
    userId: normalize(userId),
    zone: normalize(details.zone),
    circle: normalize(details.circle),
    unitName: normalize(details.unitName),
    username: normalize(details.username),
    completionCount: parseInt(completionCount, 10) || 1,
    participantsCount: parseInt(participantsCount, 10) || 0,
    completionDate: compDate,
    notes: normalize(notes),
    images: images || [],
    createdAt: now,
    updatedAt: now,
  });

  return await recalculateCompletions(programId, userId, details);
}

async function recalculateCompletions(programId, userId, details) {
  const database = db.getDb();
  
  // 1. Fetch all updates for this user and program
  const updates = await database.collection(collections.PROGRAM_UPDATES_COLLECTION).find({
    programId: new ObjectId(programId),
    userId: normalize(userId)
  }).sort({ createdAt: 1 }).toArray();

  let totalCompletion = 0;
  let totalParticipants = 0;
  let mergedImages = [];
  let latestDate = null;
  
  for (const upd of updates) {
    totalCompletion += upd.completionCount || 0;
    totalParticipants += upd.participantsCount || 0;
    if (upd.images && upd.images.length) mergedImages.push(...upd.images);
    if (!latestDate || new Date(upd.completionDate) > new Date(latestDate)) {
      latestDate = upd.completionDate;
    }
  }

  const program = await database.collection(collections.PROGRAMS_COLLECTION).findOne({
    _id: new ObjectId(programId)
  });
  const requiredCount = program ? (program.requiredCount || 1) : 1;
  const isCompleted = totalCompletion >= requiredCount;

  // 2. Upsert the program_completions aggregate record
  await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION).updateOne(
    { programId: new ObjectId(programId), userId: normalize(userId) },
    {
      $set: {
        completed: isCompleted,
        completionCount: totalCompletion,
        participantsCount: totalParticipants,
        completionDate: latestDate || new Date(),
        images: mergedImages,
        completedAt: isCompleted ? (latestDate || new Date()) : null,
        zone: normalize(details.zone),
        circle: normalize(details.circle),
        unitName: normalize(details.unitName),
        username: normalize(details.username),
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  return { completed: isCompleted, completionCount: totalCompletion, participantsCount: totalParticipants };
}

async function getProgramUpdates(programId, userId) {
  const database = db.getDb();
  return await database.collection(collections.PROGRAM_UPDATES_COLLECTION)
    .find({ programId: new ObjectId(programId), userId: normalize(userId) })
    .sort({ createdAt: -1 })
    .toArray();
}

async function deleteProgramUpdate(updateId, programId, userId) {
  const database = db.getDb();
  const updateObj = await database.collection(collections.PROGRAM_UPDATES_COLLECTION).findOne({ _id: new ObjectId(updateId) });
  if (!updateObj) return false;
  
  await database.collection(collections.PROGRAM_UPDATES_COLLECTION).deleteOne({ _id: new ObjectId(updateId) });
  
  // Need unitData to recalculate
  const user = await database.collection(collections.USERS_COLLECTION).findOne({ _id: new ObjectId(userId) });
  const details = user ? { zone: user.zone, circle: user.circle, unitName: user.unitName, username: user.username } : {};
  
  await recalculateCompletions(programId, userId, details);
  return true;
}

async function editProgramUpdate(updateId, programId, userId, updateData) {
  const database = db.getDb();
  await database.collection(collections.PROGRAM_UPDATES_COLLECTION).updateOne(
    { _id: new ObjectId(updateId) },
    { $set: updateData }
  );
  
  const user = await database.collection(collections.USERS_COLLECTION).findOne({ _id: new ObjectId(userId) });
  const details = user ? { zone: user.zone, circle: user.circle, unitName: user.unitName, username: user.username } : {};
  
  await recalculateCompletions(programId, userId, details);
  return true;
}


// Get all user completions for a specific program (admin detail view)
async function getProgramCompletionDetails(programId) {
  const database = db.getDb();
  const completions = await database
    .collection(collections.PROGRAM_COMPLETIONS_COLLECTION)
    .find({ programId: new ObjectId(programId) })
    .sort({ updatedAt: -1 })
    .toArray();
  return completions;
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

  // 1. Fetch matching users (units)
  const userQuery = { role: 'UnitUser' };
  if (filters.zone) userQuery.zone = filters.zone;
  if (filters.circle) userQuery.circle = filters.circle;
  if (filters.unitName) userQuery.unitName = { $regex: filters.unitName, $options: 'i' };

  const users = await database
    .collection(collections.USERS_COLLECTION)
    .find(userQuery)
    .toArray();

  // 2. Fetch matching programs
  const programQuery = {};
  if (filters.programId) {
    programQuery._id = new ObjectId(filters.programId);
  } else {
    // If no program filter, report on published programs
    programQuery.published = true;
  }

  const programs = await database
    .collection(collections.PROGRAMS_COLLECTION)
    .find(programQuery)
    .toArray();

  const programMap = new Map(programs.map(p => [p._id.toString(), p.title]));
  const programIds = programs.map(p => p._id);
  const userIds = users.map(u => u._id.toString());

  // 3. Fetch completion records
  const completions = await database
    .collection(collections.PROGRAM_COMPLETIONS_COLLECTION)
    .find({
      programId: { $in: programIds },
      userId: { $in: userIds }
    })
    .toArray();

  // Create a mapping key: "userId_programId" -> completion record
  const completionMap = new Map(
    completions.map(c => [`${c.userId}_${c.programId.toString()}`, c])
  );

  // 4. Generate report rows
  const reportRows = [];
  for (const user of users) {
    for (const prog of programs) {
      const key = `${user._id.toString()}_${prog._id.toString()}`;
      const completion = completionMap.get(key);
      const isCompleted = completion ? completion.completed : false;

      reportRows.push({
        _id: completion ? completion._id : null,
        programId: prog._id,
        userId: user._id.toString(),
        zone: user.zone || '',
        circle: user.circle || '',
        unitName: user.unitName || '',
        username: user.username || '',
        completed: isCompleted,
        completedAt: completion && isCompleted ? completion.completedAt : null,
        createdAt: completion ? completion.createdAt : null,
        updatedAt: completion ? completion.updatedAt : null,
        programTitle: prog.title
      });
    }
  }

  // 5. Filter by completion status if requested
  let filteredRows = reportRows;
  if (filters.status === 'completed') {
    filteredRows = reportRows.filter(r => r.completed === true);
  } else if (filters.status === 'pending') {
    filteredRows = reportRows.filter(r => r.completed === false);
  }

  // Sort by completedAt (completed first, then pending) or username
  filteredRows.sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? -1 : 1; // Completed first
    }
    if (a.completedAt && b.completedAt) {
      return new Date(b.completedAt) - new Date(a.completedAt); // Most recent completion first
    }
    return a.unitName.localeCompare(b.unitName);
  });

  return filteredRows;
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
  submitCompletion,
  getUserCompletions,
  getProgramsWithCompletion,
  getProgramCompletionDetails,
  getDashboardAnalytics,
  getCompletionReport,
  getProgramUpdates,
  deleteProgramUpdate,
  editProgramUpdate,
};
