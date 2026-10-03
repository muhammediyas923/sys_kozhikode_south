const { ObjectId } = require('mongodb');
const collections = require('../config/collections');
const db = require('../config/connection');
const path = require('path');
const fs = require('fs');

function normalize(val) {
  return typeof val === 'string' ? val.trim() : '';
}

function escapeRegex(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getAllPrograms() {
  const database = db.getDb();
  const programs = await database
    .collection(collections.PROGRAMS_COLLECTION)
    .find()
    .sort({ createdAt: -1 })
    .toArray();

  const completions = await database
    .collection(collections.PROGRAM_COMPLETIONS_COLLECTION)
    .find({}, { projection: { programId: 1, participantsCount: 1 } })
    .toArray();

  const participantCounts = {};
  completions.forEach(c => {
    const pid = c.programId.toString();
    participantCounts[pid] = (participantCounts[pid] || 0) + (c.participantsCount || 0);
  });

  return programs.map(p => ({
    ...p,
    totalParticipants: participantCounts[p._id.toString()] || 0
  }));
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
        originalName: path.basename(f.originalname).replace(/[^a-zA-Z0-9._-]/g, '_'),
        filename: f.filename,
        mimetype: f.mimetype,
        size: f.size,
        url: `/uploads/programs/${f.filename}`,
      });
    });
  }

  let assignTo = [];
  if (Array.isArray(data.assignTo)) {
    assignTo = data.assignTo;
  } else if (typeof data.assignTo === 'string') {
    assignTo = [data.assignTo];
  } else {
    assignTo = ['UnitUser'];
  }

  const result = await database.collection(collections.PROGRAMS_COLLECTION).insertOne({
    title: normalize(data.title),
    description: normalize(data.description),
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    attachments,
    published: false,
    createdBy: normalize(data.createdBy),
    requiredCount: data.requiredCount ? parseInt(data.requiredCount, 10) || 1 : 1,
    assignTo,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return result.insertedId;
}

async function updateProgram(id, data, files) {
  const database = db.getDb();

  let assignTo = [];
  if (Array.isArray(data.assignTo)) {
    assignTo = data.assignTo;
  } else if (typeof data.assignTo === 'string') {
    assignTo = [data.assignTo];
  }

  const update = {
    $set: {
      title: normalize(data.title),
      description: normalize(data.description),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      requiredCount: data.requiredCount ? parseInt(data.requiredCount, 10) || 1 : 1,
      updatedAt: new Date(),
    },
  };

  if (assignTo.length > 0) {
    const existingProg = await database.collection(collections.PROGRAMS_COLLECTION).findOne({ _id: new ObjectId(id) });
    if (existingProg && existingProg.assignTo) {
      const existingAssign = Array.isArray(existingProg.assignTo) ? existingProg.assignTo[0] : existingProg.assignTo;
      const newAssign = assignTo[0];
      if (existingAssign && existingAssign !== newAssign) {
        const compCount = await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION).countDocuments({ programId: new ObjectId(id) });
        const updCount = await database.collection(collections.PROGRAM_UPDATES_COLLECTION).countDocuments({ programId: new ObjectId(id) });
        if (compCount > 0 || updCount > 0) {
          throw new Error('Cannot change assigned user type because completion records already exist for this program.');
        }
      }
    }
    update.$set.assignTo = assignTo;
  }

  if (files && files.length) {
    const newAttachments = files.map((f) => ({
      originalName: path.basename(f.originalname).replace(/[^a-zA-Z0-9._-]/g, '_'),
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
  let programs = options.publishedOnly ? await getPublishedPrograms() : await getAllPrograms();

  if (options.userRole) {
    programs = programs.filter(p => {
      if (!p.assignTo || p.assignTo.length === 0) return false;
      if (Array.isArray(p.assignTo)) {
        return p.assignTo.includes(options.userRole);
      }
      return p.assignTo === options.userRole;
    });
  }

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

async function getAggregatePrograms(userRole, userDetails) {
  const database = db.getDb();
  let programs = await getPublishedPrograms();

  if (userRole) {
    programs = programs.filter(p => {
      if (!p.assignTo || p.assignTo.length === 0) return false;
      if (Array.isArray(p.assignTo)) {
        return p.assignTo.includes(userRole);
      }
      return p.assignTo === userRole;
    });
  }

  // Find all units in the scope to calculate the target correctly.
  const unitQuery = { role: 'UnitUser' };
  if (userRole === 'ZoneUser') {
    unitQuery.zone = userDetails.zone;
  } else if (userRole === 'CircleUser') {
    unitQuery.zone = userDetails.zone;
    unitQuery.circle = userDetails.circle;
  }
  const unitsCount = await database.collection(collections.USERS_COLLECTION).countDocuments(unitQuery);

  const matchQuery = {};
  if (userRole === 'ZoneUser') {
    matchQuery.zone = userDetails.zone;
  } else if (userRole === 'CircleUser') {
    matchQuery.zone = userDetails.zone;
    matchQuery.circle = userDetails.circle;
  }

  // Aggregate completions for each program in the scope
  const aggregations = await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION)
    .aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$programId",
          totalCompletionCount: { $sum: "$completionCount" },
          totalParticipantsCount: { $sum: "$participantsCount" }
        }
      }
    ]).toArray();

  const aggMap = new Map(aggregations.map(a => [a._id.toString(), a]));

  return programs.map((p) => {
    const agg = aggMap.get(p._id.toString());
    const requiredCountPerUnit = p.requiredCount || 1;
    const requiredCount = unitsCount * requiredCountPerUnit;
    const completionCount = agg ? (agg.totalCompletionCount || 0) : 0;

    const progressPct = requiredCount > 0
      ? Math.min(100, Math.round((completionCount / requiredCount) * 100))
      : (unitsCount === 0 ? 0 : 100);

    const isCompleted = requiredCount > 0 && completionCount >= requiredCount;

    return {
      ...p,
      completed: isCompleted,
      completionCount,
      participantsCount: agg ? (agg.totalParticipantsCount || 0) : 0,
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
  if (!ObjectId.isValid(updateId) || !ObjectId.isValid(programId) || !ObjectId.isValid(userId)) {
    return false;
  }
  const database = db.getDb();
  // IDOR Protection: Enforce that update record belongs to the requesting user
  const updateObj = await database.collection(collections.PROGRAM_UPDATES_COLLECTION).findOne({
    _id: new ObjectId(updateId),
    userId: normalize(userId),
    programId: new ObjectId(programId),
  });
  if (!updateObj) return false;

  await database.collection(collections.PROGRAM_UPDATES_COLLECTION).deleteOne({
    _id: new ObjectId(updateId),
    userId: normalize(userId),
  });

  // Need unitData to recalculate
  const user = await database.collection(collections.USERS_COLLECTION).findOne({ _id: new ObjectId(userId) });
  const details = user ? { zone: user.zone, circle: user.circle, unitName: user.unitName, username: user.username } : {};

  await recalculateCompletions(programId, userId, details);
  return true;
}

async function editProgramUpdate(updateId, programId, userId, updateData) {
  if (!ObjectId.isValid(updateId) || !ObjectId.isValid(programId) || !ObjectId.isValid(userId)) {
    return false;
  }
  const database = db.getDb();
  // IDOR Protection: Enforce that update record belongs to the requesting user
  const updateObj = await database.collection(collections.PROGRAM_UPDATES_COLLECTION).findOne({
    _id: new ObjectId(updateId),
    userId: normalize(userId),
    programId: new ObjectId(programId),
  });
  if (!updateObj) return false;

  await database.collection(collections.PROGRAM_UPDATES_COLLECTION).updateOne(
    { _id: new ObjectId(updateId), userId: normalize(userId) },
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

// Get completion stats grouped by assigned user roles for a specific program
async function getGroupedCompletionStats(programId) {
  const database = db.getDb();
  const program = await getProgramById(programId);
  if (!program) return null;

  const assignTo = program.assignTo && program.assignTo.length > 0 ? program.assignTo : ['UnitUser'];
  const stats = {};

  for (const role of assignTo) {
    const usersInRole = await database.collection(collections.USERS_COLLECTION)
      .find({ role, status: 'Active' })
      .project({ _id: 1 })
      .toArray();

    const usersCount = usersInRole.length;
    const userIds = usersInRole.map(u => u._id.toString());

    const requiredCount = (program.requiredCount || 1) * usersCount;

    const completions = await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION)
      .find({ programId: new ObjectId(programId) })
      .toArray();

    let roleCompletionCount = 0;
    for (const c of completions) {
      if (userIds.includes(c.userId.toString())) {
        roleCompletionCount += (c.completionCount || 0);
      }
    }

    const progressPct = requiredCount > 0
      ? Math.min(100, Math.round((roleCompletionCount / requiredCount) * 100))
      : (usersCount === 0 ? 0 : 100);

    stats[role] = {
      target: requiredCount,
      completed: roleCompletionCount,
      remaining: Math.max(0, requiredCount - roleCompletionCount),
      progress: progressPct,
      status: (requiredCount > 0 && roleCompletionCount >= requiredCount) ? 'Completed' : 'Pending'
    };
  }

  return stats;
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
  if (typeof filters.zone === 'string' && filters.zone) userQuery.zone = filters.zone;
  if (typeof filters.circle === 'string' && filters.circle) userQuery.circle = filters.circle;
  if (typeof filters.unitName === 'string' && filters.unitName.trim()) {
    userQuery.unitName = { $regex: escapeRegex(filters.unitName.trim()), $options: 'i' };
  }

  const users = await database
    .collection(collections.USERS_COLLECTION)
    .find(userQuery)
    .toArray();

  // 2. Fetch matching programs
  const programQuery = {};
  if (filters.programId && ObjectId.isValid(filters.programId)) {
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
  getAggregatePrograms,
  getMonthlyCompletionReports,
};

async function getMonthlyCompletionReports(filters = {}) {
  const database = db.getDb();

  // 1. Fetch options for filter dropdowns
  const zonesDocs = await database.collection(collections.ZONES_COLLECTION).find().sort({ name: 1 }).toArray();
  const circlesDocs = await database.collection(collections.CIRCLES_COLLECTION).find().sort({ name: 1 }).toArray();
  const programsDocs = await database.collection(collections.PROGRAMS_COLLECTION).find({ published: true }).sort({ title: 1 }).toArray();

  const zoneNames = zonesDocs.map(z => z.name).filter(Boolean);
  const circleOptions = circlesDocs.map(c => ({ name: c.name, zoneName: c.zoneName || '' }));
  const programOptions = programsDocs.map(p => ({ id: p._id.toString(), title: p.title }));

  // Collect distinct years from programs, completions, updates
  const yearSet = new Set([new Date().getFullYear(), 2026, 2027, 2028]);

  // 2. Fetch Users of all types
  const unitUsers = await database.collection(collections.USERS_COLLECTION).find({ role: 'UnitUser' }).toArray();
  
  // Circle users from circles collection + users collection
  const circleUsers = [];
  const existingCircleUsernames = new Set();
  circlesDocs.forEach(c => {
    if (c.username) {
      existingCircleUsernames.add(c.username);
      circleUsers.push({
        _id: c._id.toString(),
        username: c.username,
        name: c.name,
        unitName: c.name,
        role: 'CircleUser',
        zone: c.zoneName || '',
        circle: c.name,
        status: c.status || 'Active'
      });
    }
  });

  const dbCircleUsers = await database.collection(collections.USERS_COLLECTION).find({ role: 'CircleUser' }).toArray();
  dbCircleUsers.forEach(u => {
    if (!existingCircleUsernames.has(u.username)) {
      circleUsers.push(u);
    }
  });

  // Zone users from zones collection + users collection
  const zoneUsers = [];
  const existingZoneUsernames = new Set();
  zonesDocs.forEach(z => {
    if (z.username) {
      existingZoneUsernames.add(z.username);
      zoneUsers.push({
        _id: z._id.toString(),
        username: z.username,
        name: z.name,
        unitName: z.name,
        role: 'ZoneUser',
        zone: z.name,
        circle: 'All Circles',
        status: z.status || 'Active'
      });
    }
  });

  const dbZoneUsers = await database.collection(collections.USERS_COLLECTION).find({ role: 'ZoneUser' }).toArray();
  dbZoneUsers.forEach(u => {
    if (!existingZoneUsernames.has(u.username)) {
      zoneUsers.push(u);
    }
  });

  const allUsers = [...unitUsers, ...circleUsers, ...zoneUsers];

  // 3. Fetch completions & updates
  const rawCompletions = await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION).find().toArray();
  const rawUpdates = await database.collection(collections.PROGRAM_UPDATES_COLLECTION).find().sort({ createdAt: 1 }).toArray();

  // Maps for fast lookup
  const completionMap = new Map(rawCompletions.map(c => [`${c.userId}_${c.programId.toString()}`, c]));

  const updatesMap = new Map();
  rawUpdates.forEach(upd => {
    const key = `${upd.userId}_${upd.programId.toString()}`;
    if (!updatesMap.has(key)) updatesMap.set(key, []);
    updatesMap.get(key).push(upd);

    if (upd.createdAt) {
      yearSet.add(new Date(upd.createdAt).getFullYear());
    }
  });

  rawCompletions.forEach(c => {
    if (c.completedAt) yearSet.add(new Date(c.completedAt).getFullYear());
    if (c.completionDate) yearSet.add(new Date(c.completionDate).getFullYear());
  });

  const yearOptions = Array.from(yearSet).sort((a, b) => b - a);

  // 4. Construct unified report rows
  const allReportRows = [];
  const globalGallery = [];

  allUsers.forEach(user => {
    const userRole = user.role || 'UnitUser';
    const userIdStr = user._id.toString();

    // Check which programs apply to this user
    const eligiblePrograms = programsDocs.filter(p => {
      if (!p.assignTo || p.assignTo.length === 0) return true;
      return p.assignTo.includes(userRole);
    });

    eligiblePrograms.forEach(prog => {
      const progIdStr = prog._id.toString();
      const key = `${userIdStr}_${progIdStr}`;
      const completion = completionMap.get(key);
      const updates = updatesMap.get(key) || [];

      const target = prog.requiredCount || 1;
      let completionCount = 0;
      let participantsCount = 0;
      let lastUpdated = completion ? (completion.updatedAt || completion.completedAt) : null;
      let completionDate = completion ? completion.completionDate : null;
      const notesList = [];
      const itemImages = [];
      const timelineEvents = [
        {
          title: 'Program Published',
          timestamp: prog.publishedAt || prog.createdAt || new Date(),
          description: `Target requirement: ${target} time(s).`
        }
      ];

      // Process updates
      updates.forEach((upd, idx) => {
        completionCount += (upd.completionCount || 1);
        participantsCount += (upd.participantsCount || 0);
        if (upd.notes) notesList.push(upd.notes);
        if (!lastUpdated || new Date(upd.createdAt) > new Date(lastUpdated)) {
          lastUpdated = upd.createdAt;
        }
        if (!completionDate || new Date(upd.completionDate) > new Date(completionDate)) {
          completionDate = upd.completionDate;
        }

        // Timeline event
        timelineEvents.push({
          title: `Update #${idx + 1} Submitted`,
          timestamp: upd.createdAt || upd.completionDate || new Date(),
          description: `Logged ${upd.completionCount || 1} completion(s) & ${upd.participantsCount || 0} participant(s). ${upd.notes ? 'Remarks: ' + upd.notes : ''}`
        });

        // Image details
        if (upd.images && upd.images.length) {
          upd.images.forEach(img => {
            const imgDateObj = upd.createdAt ? new Date(upd.createdAt) : new Date();
            const photoMeta = {
              url: img.url,
              filename: img.filename || img.originalName || 'Photo',
              uploadedBy: user.unitName || user.circle || user.zone || user.name || user.username,
              username: user.username,
              userType: userRole === 'UnitUser' ? 'Unit User' : (userRole === 'CircleUser' ? 'Circle User' : 'Zone User'),
              zone: user.zone || completion?.zone || '-',
              circle: user.circle || completion?.circle || '-',
              unit: user.unitName || completion?.unitName || '-',
              programTitle: prog.title,
              programId: progIdStr,
              uploadDate: imgDateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
              uploadTime: imgDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              rawDate: imgDateObj
            };
            itemImages.push(photoMeta);
          });
        }
      });

      // If completion record exists without separate updates array
      if (updates.length === 0 && completion) {
        completionCount = completion.completionCount || (completion.completed ? target : 0);
        participantsCount = completion.participantsCount || 0;
        if (completion.notes) notesList.push(completion.notes);
        if (completion.images && completion.images.length) {
          completion.images.forEach(img => {
            const imgDateObj = completion.completedAt ? new Date(completion.completedAt) : new Date();
            itemImages.push({
              url: img.url,
              filename: img.filename || 'Photo',
              uploadedBy: user.unitName || user.circle || user.zone || user.name || user.username,
              username: user.username,
              userType: userRole === 'UnitUser' ? 'Unit User' : (userRole === 'CircleUser' ? 'Circle User' : 'Zone User'),
              zone: user.zone || completion.zone || '-',
              circle: user.circle || completion.circle || '-',
              unit: user.unitName || completion.unitName || '-',
              programTitle: prog.title,
              programId: progIdStr,
              uploadDate: imgDateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
              uploadTime: imgDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              rawDate: imgDateObj
            });
          });
        }
      }

      const isCompleted = target > 0 && completionCount >= target;
      const remaining = Math.max(0, target - completionCount);
      const progressPct = target > 0 ? Math.min(100, Math.round((completionCount / target) * 100)) : 0;

      if (isCompleted) {
        timelineEvents.push({
          title: 'Program Completed',
          timestamp: completion?.completedAt || lastUpdated || new Date(),
          description: 'Program completion target fully achieved!'
        });
      }

      const row = {
        _id: key,
        programId: progIdStr,
        programTitle: prog.title,
        programDescription: prog.description || '',
        dueDate: prog.dueDate,
        requiredCount: target,
        target,
        completionCount,
        remaining,
        progressPct,
        completed: isCompleted,
        completedBy: user.unitName || user.circle || user.zone || user.name || user.username,
        username: user.username,
        userType: userRole === 'UnitUser' ? 'Unit User' : (userRole === 'CircleUser' ? 'Circle User' : 'Zone User'),
        userRole,
        zone: user.zone || completion?.zone || '',
        circle: user.circle || completion?.circle || '',
        unit: user.unitName || completion?.unitName || '',
        participantsCount,
        completionDate: completionDate || lastUpdated,
        lastUpdated: lastUpdated || prog.createdAt,
        imagesCount: itemImages.length,
        notes: notesList.join(' | '),
        images: itemImages,
        timeline: timelineEvents
      };

      allReportRows.push(row);
      if (itemImages.length > 0) {
        globalGallery.push(...itemImages);
      }
    });
  });

  // 5. Apply filters
  let filteredRows = allReportRows;

  if (filters.month && filters.month !== 'all') {
    const targetMonth = parseInt(filters.month, 10);
    filteredRows = filteredRows.filter(r => {
      const d = r.completionDate || r.lastUpdated;
      return d ? (new Date(d).getMonth() + 1) === targetMonth : false;
    });
  }

  if (filters.year && filters.year !== 'all') {
    const targetYear = parseInt(filters.year, 10);
    filteredRows = filteredRows.filter(r => {
      const d = r.completionDate || r.lastUpdated;
      return d ? new Date(d).getFullYear() === targetYear : false;
    });
  }

  if (filters.zone && filters.zone !== 'all') {
    filteredRows = filteredRows.filter(r => r.zone.toLowerCase() === filters.zone.toLowerCase());
  }

  if (filters.circle && filters.circle !== 'all') {
    filteredRows = filteredRows.filter(r => r.circle.toLowerCase() === filters.circle.toLowerCase());
  }

  if (filters.unit && filters.unit.trim()) {
    const uTerm = filters.unit.trim().toLowerCase();
    filteredRows = filteredRows.filter(r => r.unit.toLowerCase().includes(uTerm) || r.completedBy.toLowerCase().includes(uTerm));
  }

  if (filters.program && filters.program !== 'all') {
    filteredRows = filteredRows.filter(r => r.programId === filters.program);
  }

  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'completed') {
      filteredRows = filteredRows.filter(r => r.completed === true);
    } else if (filters.status === 'pending') {
      filteredRows = filteredRows.filter(r => r.completed === false);
    }
  }

  if (filters.userRole || filters.userType) {
    const targetRole = filters.userRole || filters.userType;
    if (targetRole !== 'all') {
      filteredRows = filteredRows.filter(r => r.userRole === targetRole || r.userType.replace(' ', '') === targetRole);
    }
  }

  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    filteredRows = filteredRows.filter(r =>
      r.programTitle.toLowerCase().includes(q) ||
      r.completedBy.toLowerCase().includes(q) ||
      r.username.toLowerCase().includes(q) ||
      r.zone.toLowerCase().includes(q) ||
      r.circle.toLowerCase().includes(q) ||
      r.unit.toLowerCase().includes(q)
    );
  }

  // 6. Separate by user role
  const unitCompletions = filteredRows.filter(r => r.userRole === 'UnitUser');
  const circleCompletions = filteredRows.filter(r => r.userRole === 'CircleUser');
  const zoneCompletions = filteredRows.filter(r => r.userRole === 'ZoneUser');

  // Filter gallery images corresponding to filtered rows
  const filteredGallery = [];
  filteredRows.forEach(r => {
    if (r.images && r.images.length) {
      filteredGallery.push(...r.images);
    }
  });

  // 7. Calculate Summary Cards
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const totalProgramsCount = programsDocs.length;
  const completedProgramsCount = filteredRows.filter(r => r.completed).length;
  const pendingProgramsCount = filteredRows.filter(r => !r.completed).length;
  const totalParticipantsSum = filteredRows.reduce((acc, r) => acc + (r.participantsCount || 0), 0);
  const totalImagesCount = filteredGallery.length;

  const thisMonthCompletionsCount = filteredRows.filter(r => {
    if (!r.completed || !r.completionDate) return false;
    const d = new Date(r.completionDate);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  // 8. Calculate Monthly Analytics
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyTrendsMap = {};
  monthNames.forEach(m => { monthlyTrendsMap[m] = { month: m, completed: 0, participants: 0 }; });

  filteredRows.forEach(r => {
    if (r.completionDate) {
      const d = new Date(r.completionDate);
      const mName = monthNames[d.getMonth()];
      if (monthlyTrendsMap[mName]) {
        if (r.completed) monthlyTrendsMap[mName].completed += 1;
        monthlyTrendsMap[mName].participants += (r.participantsCount || 0);
      }
    }
  });

  const monthlyTrends = Object.values(monthlyTrendsMap);

  const userTypeAnalytics = [
    { type: 'Unit Users', count: unitCompletions.filter(r => r.completed).length },
    { type: 'Circle Users', count: circleCompletions.filter(r => r.completed).length },
    { type: 'Zone Users', count: zoneCompletions.filter(r => r.completed).length }
  ];

  const zoneMap = {};
  filteredRows.forEach(r => {
    if (r.zone && r.completed) {
      zoneMap[r.zone] = (zoneMap[r.zone] || 0) + 1;
    }
  });
  const zoneAnalytics = Object.keys(zoneMap).map(z => ({ zone: z, completed: zoneMap[z] }));

  const circleMap = {};
  filteredRows.forEach(r => {
    if (r.circle && r.circle !== '-' && r.completed) {
      circleMap[r.circle] = (circleMap[r.circle] || 0) + 1;
    }
  });
  const circleAnalytics = Object.keys(circleMap).map(c => ({ circle: c, completed: circleMap[c] }));

  return {
    success: true,
    summary: {
      totalPrograms: totalProgramsCount,
      completedPrograms: completedProgramsCount,
      pendingPrograms: pendingProgramsCount,
      totalParticipants: totalParticipantsSum,
      totalImagesUploaded: totalImagesCount,
      thisMonthCompletions: thisMonthCompletionsCount
    },
    options: {
      zones: zoneNames,
      circles: circleOptions,
      programs: programOptions,
      years: yearOptions
    },
    unitCompletions,
    circleCompletions,
    zoneCompletions,
    completions: filteredRows,
    gallery: filteredGallery,
    analytics: {
      monthlyTrends,
      userTypeAnalytics,
      zoneAnalytics,
      circleAnalytics
    }
  };
}

async function getGroupedCompletionStats(programId) {
  const database = db.getDb();
  let pid;
  try { pid = new ObjectId(programId); } catch (e) { pid = programId; }

  const completions = await database.collection(collections.PROGRAM_COMPLETIONS_COLLECTION)
    .find({ programId: pid })
    .toArray();

  const unitCompletions = [];
  const circleCompletions = [];
  const zoneCompletions = [];

  for (const c of completions) {
    let u = null;
    if (c.userId) {
      try {
        u = await database.collection(collections.USERS_COLLECTION).findOne({ _id: new ObjectId(c.userId) });
      } catch (e) { /* ignore */ }
    }
    const role = u ? u.role : (c.userType || 'UnitUser');
    const item = {
      ...c,
      username: u ? u.username : c.username,
      unitName: u ? u.unitName : c.unitName,
      circle: u ? u.circle : c.circle,
      zone: u ? u.zone : c.zone,
      userType: role
    };
    if (role === 'ZoneUser') zoneCompletions.push(item);
    else if (role === 'CircleUser') circleCompletions.push(item);
    else unitCompletions.push(item);
  }

  return { unitCompletions, circleCompletions, zoneCompletions };
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
  getGroupedCompletionStats,
  getDashboardAnalytics,
  getCompletionReport,
  getProgramUpdates,
  deleteProgramUpdate,
  editProgramUpdate,
  getAggregatePrograms,
  getMonthlyCompletionReports,
};

