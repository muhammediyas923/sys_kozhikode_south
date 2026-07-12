const { ObjectId } = require('mongodb');
const collections = require('../config/collections');
const db = require('../config/connection');

function normalize(val) {
  return typeof val === 'string' ? val.trim() : '';
}

async function createNotification(userId, type, message, meta = {}) {
  const database = db.getDb();
  await database.collection(collections.NOTIFICATIONS_COLLECTION).insertOne({
    userId: normalize(userId), // 'all' for broadcast, or specific userId
    type,                       // 'program_published', 'program_updated', 'due_date', 'unit_completed', etc.
    message,
    meta,
    read: false,
    createdAt: new Date(),
  });
}

async function broadcastToAllUnits(type, message, meta = {}) {
  const database = db.getDb();
  await database.collection(collections.NOTIFICATIONS_COLLECTION).insertOne({
    userId: 'all',
    type,
    message,
    meta,
    read: false,
    createdAt: new Date(),
  });
}

async function getNotificationsForUser(userId) {
  const database = db.getDb();
  // Get notifications addressed to this user OR broadcast to 'all'
  return database
    .collection(collections.NOTIFICATIONS_COLLECTION)
    .find({ $or: [{ userId: normalize(userId) }, { userId: 'all' }] })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
}

async function getNotificationsForAdmin() {
  const database = db.getDb();
  return database
    .collection(collections.NOTIFICATIONS_COLLECTION)
    .find({ $or: [{ userId: 'superadmin' }, { userId: 'admin' }] })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
}

async function getUnreadCount(userId) {
  const database = db.getDb();
  return database
    .collection(collections.NOTIFICATIONS_COLLECTION)
    .countDocuments({
      $or: [{ userId: normalize(userId) }, { userId: 'all' }],
      read: false,
    });
}

async function markAsRead(notificationId) {
  const database = db.getDb();
  const result = await database
    .collection(collections.NOTIFICATIONS_COLLECTION)
    .updateOne({ _id: new ObjectId(notificationId) }, { $set: { read: true } });
  return result.modifiedCount > 0;
}

async function markAllAsRead(userId) {
  const database = db.getDb();
  await database
    .collection(collections.NOTIFICATIONS_COLLECTION)
    .updateMany(
      { $or: [{ userId: normalize(userId) }, { userId: 'all' }] },
      { $set: { read: true } }
    );
}

module.exports = {
  createNotification,
  broadcastToAllUnits,
  getNotificationsForUser,
  getNotificationsForAdmin,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
