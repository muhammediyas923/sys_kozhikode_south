const crypto = require('crypto');
const Razorpay = require('razorpay');
const { ObjectId } = require('mongodb');
const config = require('../config/env');
const collections = require('../config/collections');
const db = require('../config/connection');

// Initialize Razorpay SDK instance
const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

/**
 * Initialize MongoDB indexes for payments collection
 */
async function initPaymentIndexes() {
  try {
    const database = db.getDb();
    const paymentsCol = database.collection(collections.PAYMENTS_COLLECTION);

    await paymentsCol.createIndex({ orderId: 1 }, { unique: true });

    // Use partial unique index so null / pending paymentId values don't collide
    try {
      const existingIndexes = await paymentsCol.indexes();
      const oldPayIndex = existingIndexes.find(idx => idx.name === 'paymentId_1' && !idx.partialFilterExpression);
      if (oldPayIndex) {
        await paymentsCol.dropIndex('paymentId_1');
      }
    } catch (e) {
      // ignore drop error
    }

    await paymentsCol.createIndex(
      { paymentId: 1 },
      {
        unique: true,
        partialFilterExpression: { paymentId: { $type: 'string' } }
      }
    );
    await paymentsCol.createIndex({ userId: 1, createdAt: -1 });
    await paymentsCol.createIndex({ status: 1, createdAt: -1 });
    await paymentsCol.createIndex({ role: 1, zone: 1, circle: 1 });
    await paymentsCol.createIndex({ createdAt: -1 });

    console.log('Payment collection indexes initialized successfully.');
  } catch (err) {
    console.error('Error initializing payment indexes:', err);
  }
}

/**
 * Validate and sanitize payment amount
 */
function validateAmount(amount) {
  const num = typeof amount === 'string' ? parseFloat(amount.trim()) : Number(amount);
  if (isNaN(num) || !isFinite(num) || num <= 0) {
    throw new Error('Please enter a valid positive payment amount.');
  }
  if (num < 1) {
    throw new Error('Minimum payment amount is ₹1.');
  }
  if (num > 500000) {
    throw new Error('Maximum payment amount per transaction is ₹5,00,000.');
  }
  // Standardize to 2 decimal places
  return Math.round(num * 100) / 100;
}

/**
 * Create Razorpay Order on server and store initial record in MongoDB
 */
async function createOrder(user, { amount, purpose, description }) {
  if (!user || !user._id) {
    throw new Error('User session is required to initiate payment.');
  }

  const cleanAmount = validateAmount(amount);
  const amountInPaise = Math.round(cleanAmount * 100);
  const cleanPurpose = typeof purpose === 'string' && purpose.trim() ? purpose.trim().slice(0, 100) : 'General Contribution';
  const cleanDescription = typeof description === 'string' ? description.trim().slice(0, 300) : '';

  // Generate unique receipt ID (alphanumeric, max 40 chars per Razorpay spec)
  const receipt = `rcpt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

  // Create order on Razorpay
  const orderOptions = {
    amount: amountInPaise,
    currency: config.razorpay.currency,
    receipt,
    notes: {
      userId: String(user._id),
      username: user.username || '',
      role: user.role || '',
      unitName: user.unitName || '',
      zone: user.zone || '',
      circle: user.circle || '',
      purpose: cleanPurpose,
    },
  };

  let razorpayOrder;
  try {
    razorpayOrder = await razorpay.orders.create(orderOptions);
  } catch (err) {
    if (config.razorpay.mode === 'test' && (err.statusCode === 401 || err.error?.code === 'BAD_REQUEST_ERROR')) {
      console.warn('[Razorpay Notice] Razorpay API returned authentication error with placeholder credentials. Using local Test Mode order simulator for development. Configure real test keys in .env to use Razorpay cloud.');
      razorpayOrder = {
        id: `order_test_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`,
        amount: amountInPaise,
        currency: config.razorpay.currency,
      };
    } else {
      throw err;
    }
  }

  // Store initial order record in MongoDB
  const database = db.getDb();
  const paymentDoc = {
    orderId: razorpayOrder.id,
    paymentId: null,
    signature: null,
    receipt,
    userId: String(user._id),
    username: user.username,
    displayName: user.unitName,
    role: user.role,
    zone: user.zone || null,
    circle: user.circle || null,
    unit: user.role === 'UnitUser' ? user.unitName : null,
    amount: cleanAmount,
    amountInPaise,
    currency: razorpayOrder.currency,
    purpose: cleanPurpose,
    description: cleanDescription,
    status: 'created', // created | pending | paid | failed
    failureReason: null,
    webhookEvents: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    paidAt: null,
    verifiedAt: null,
  };

  await database.collection(collections.PAYMENTS_COLLECTION).insertOne(paymentDoc);

  return {
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount, // in paise
    currency: razorpayOrder.currency,
    cleanAmount,
    keyId: config.razorpay.keyId,
    purpose: cleanPurpose,
    user: {
      name: user.unitName,
      username: user.username,
      role: user.role,
      zone: user.zone,
      circle: user.circle,
    },
  };
}

/**
 * Server-side payment signature verification
 */
async function verifyPayment({ orderId, paymentId, signature, user }) {
  if (!orderId || !paymentId || !signature) {
    throw new Error('Payment verification parameters missing.');
  }
  if (!user || !user._id) {
    throw new Error('Unauthorized session for payment verification.');
  }

  const database = db.getDb();
  const payment = await database.collection(collections.PAYMENTS_COLLECTION).findOne({ orderId });

  if (!payment) {
    throw new Error('Payment record not found.');
  }

  // IDOR Protection: Ensure logged-in user owns this payment order
  if (payment.userId !== String(user._id)) {
    throw new Error('Access denied: You cannot verify a payment belonging to another user.');
  }

  // Idempotency: If already verified, return successful result without duplicate actions
  if (payment.status === 'paid') {
    return {
      success: true,
      message: 'Payment already verified.',
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      isDuplicate: true,
    };
  }

  // Verify HMAC SHA-256 signature
  const expectedPayload = `${orderId}|${paymentId}`;
  const generatedSignature = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(expectedPayload)
    .digest('hex');

  let isMatch = false;
  if (typeof signature === 'string' && signature.length === generatedSignature.length) {
    isMatch = crypto.timingSafeEqual(
      Buffer.from(generatedSignature, 'utf8'),
      Buffer.from(signature, 'utf8')
    );
  }

  if (!isMatch) {
    // Record verification failure safely
    await database.collection(collections.PAYMENTS_COLLECTION).updateOne(
      { orderId },
      {
        $set: {
          status: 'failed',
          failureReason: 'Signature verification mismatch.',
          updatedAt: new Date(),
        },
      }
    );
    throw new Error('Payment verification failed. Invalid transaction signature.');
  }

  // Update status to paid atomically
  const now = new Date();
  await database.collection(collections.PAYMENTS_COLLECTION).updateOne(
    { orderId, status: { $ne: 'paid' } },
    {
      $set: {
        paymentId,
        signature,
        status: 'paid',
        paidAt: now,
        verifiedAt: now,
        updatedAt: now,
      },
    }
  );

  return {
    success: true,
    message: 'Payment verified and completed successfully.',
    paymentId,
    orderId,
    amount: payment.amount,
  };
}

/**
 * Record a client checkout failure safely
 */
async function recordFailure({ orderId, paymentId, errorCode, errorDescription, user }) {
  if (!orderId || !user || !user._id) return;

  const database = db.getDb();
  const payment = await database.collection(collections.PAYMENTS_COLLECTION).findOne({ orderId });

  if (!payment || payment.userId !== String(user._id) || payment.status === 'paid') {
    return;
  }

  await database.collection(collections.PAYMENTS_COLLECTION).updateOne(
    { orderId, status: { $ne: 'paid' } },
    {
      $set: {
        paymentId: paymentId || payment.paymentId || null,
        status: 'failed',
        failureReason: errorDescription || errorCode || 'Transaction failed or was cancelled.',
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Handle incoming Razorpay Webhooks
 */
async function handleWebhook(rawBody, signature) {
  if (!config.razorpay.webhookSecret) {
    return { success: false, message: 'Webhook secret not configured on server.' };
  }
  if (!signature || !rawBody) {
    return { success: false, message: 'Missing webhook payload or signature header.' };
  }

  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');

  let isMatch = false;
  if (typeof signature === 'string' && signature.length === expectedSignature.length) {
    isMatch = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf8'),
      Buffer.from(signature, 'utf8')
    );
  }

  if (!isMatch) {
    return { success: false, message: 'Invalid webhook signature.' };
  }

  const event = JSON.parse(rawBody.toString('utf8'));
  const database = db.getDb();
  const eventId = event.id;
  const eventType = event.event;
  const payloadEntity = event.payload?.payment?.entity || event.payload?.order?.entity;

  if (!payloadEntity) {
    return { success: true, message: 'Event ignored: no relevant entity payload.' };
  }

  const orderId = payloadEntity.order_id || payloadEntity.id;
  if (!orderId) {
    return { success: true, message: 'Event ignored: no order_id.' };
  }

  const payment = await database.collection(collections.PAYMENTS_COLLECTION).findOne({ orderId });
  if (!payment) {
    return { success: true, message: 'Payment record not found for webhook order.' };
  }

  // Deduplicate webhook events
  if (Array.isArray(payment.webhookEvents) && payment.webhookEvents.includes(eventId)) {
    return { success: true, message: 'Duplicate webhook event ignored.' };
  }

  const now = new Date();
  const updateDoc = {
    $push: { webhookEvents: eventId },
    $set: { updatedAt: now },
  };

  if (eventType === 'payment.captured' && payment.status !== 'paid') {
    updateDoc.$set.status = 'paid';
    updateDoc.$set.paymentId = payloadEntity.id;
    updateDoc.$set.paidAt = new Date(payloadEntity.created_at * 1000);
    updateDoc.$set.verifiedAt = now;
  } else if (eventType === 'payment.failed' && payment.status !== 'paid') {
    updateDoc.$set.status = 'failed';
    updateDoc.$set.failureReason = payloadEntity.error_description || payloadEntity.error_code || 'Payment failed';
  }

  await database.collection(collections.PAYMENTS_COLLECTION).updateOne({ orderId }, updateDoc);

  return { success: true, message: 'Webhook processed successfully.' };
}

/**
 * Fetch payment history for the logged-in user only (IDOR safe)
 */
async function getUserPaymentHistory(userId) {
  const database = db.getDb();
  return database
    .collection(collections.PAYMENTS_COLLECTION)
    .find({ userId: String(userId) })
    .sort({ createdAt: -1 })
    .toArray();
}

/**
 * Fetch a single payment detail with strict authorization check
 */
async function getPaymentById(id, currentUser) {
  const database = db.getDb();
  let query = {};

  try {
    query._id = new ObjectId(id);
  } catch (err) {
    return null;
  }

  // Non-admin can only view their own payments
  if (currentUser.role !== 'SuperAdmin') {
    query.userId = String(currentUser._id);
  }

  const payment = await database.collection(collections.PAYMENTS_COLLECTION).findOne(query);
  if (!payment) return null;

  // Sanitize: ensure no internal secrets or webhook secrets are returned
  delete payment.webhookEvents;
  return payment;
}

/**
 * Super Admin Payment Reports: Server-side Filter, Search, Sort, Pagination & Totals
 */
async function getAdminPaymentReports(filters = {}, pagination = {}, sort = {}) {
  const database = db.getDb();
  const query = {};

  // Filters
  if (filters.role) query.role = filters.role;
  if (filters.zone) query.zone = filters.zone;
  if (filters.circle) query.circle = filters.circle;
  if (filters.unit) query.unit = { $regex: filters.unit, $options: 'i' };
  if (filters.status) query.status = filters.status;
  if (filters.purpose) query.purpose = filters.purpose;

  // Date filters
  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) {
      const s = new Date(filters.startDate);
      s.setHours(0, 0, 0, 0);
      query.createdAt.$gte = s;
    }
    if (filters.endDate) {
      const e = new Date(filters.endDate);
      e.setHours(23, 59, 59, 999);
      query.createdAt.$lte = e;
    }
  }

  // Quick Date Range Filter (e.g. today, month, year)
  if (filters.quickDate) {
    const now = new Date();
    if (filters.quickDate === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      query.createdAt = { $gte: start };
    } else if (filters.quickDate === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      query.createdAt = { $gte: start };
    } else if (filters.quickDate === 'year') {
      const start = new Date(now.getFullYear(), 0, 1);
      query.createdAt = { $gte: start };
    }
  }

  // Text search
  if (filters.search && typeof filters.search === 'string') {
    const s = filters.search.trim();
    if (s) {
      query.$or = [
        { orderId: { $regex: s, $options: 'i' } },
        { paymentId: { $regex: s, $options: 'i' } },
        { username: { $regex: s, $options: 'i' } },
        { displayName: { $regex: s, $options: 'i' } },
        { purpose: { $regex: s, $options: 'i' } },
      ];
    }
  }

  // Pagination parameters
  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(pagination.limit, 10) || 25));
  const skip = (page - 1) * limit;

  // Sorting
  const sortField = sort.field || 'createdAt';
  const sortOrder = sort.order === 'asc' ? 1 : -1;
  const sortDoc = { [sortField]: sortOrder };

  // Run data query and totals calculation in parallel
  const [payments, totalsResult, totalCount] = await Promise.all([
    database
      .collection(collections.PAYMENTS_COLLECTION)
      .find(query)
      .sort(sortDoc)
      .skip(skip)
      .limit(limit)
      .toArray(),

    database
      .collection(collections.PAYMENTS_COLLECTION)
      .aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            paidCount: {
              $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] },
            },
            pendingCount: {
              $sum: { $cond: [{ $in: ['$status', ['created', 'pending']] }, 1, 0] },
            },
            failedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
            },
            totalPaidAmount: {
              $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] },
            },
          },
        },
      ])
      .toArray(),

    database.collection(collections.PAYMENTS_COLLECTION).countDocuments(query),
  ]);

  const totals = totalsResult[0] || {
    totalTransactions: 0,
    paidCount: 0,
    pendingCount: 0,
    failedCount: 0,
    totalPaidAmount: 0,
  };

  return {
    payments,
    totals: {
      totalTransactions: totals.totalTransactions,
      paidCount: totals.paidCount,
      pendingCount: totals.pendingCount,
      failedCount: totals.failedCount,
      totalPaidAmount: Math.round(totals.totalPaidAmount * 100) / 100,
    },
    pagination: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
  };
}

/**
 * Fetch all matching payments for export (independent of pagination limit, capped at safe max 5000)
 */
async function getAllPaymentsForExport(filters = {}) {
  const database = db.getDb();
  const query = {};

  if (filters.role) query.role = filters.role;
  if (filters.zone) query.zone = filters.zone;
  if (filters.circle) query.circle = filters.circle;
  if (filters.status) query.status = filters.status;
  if (filters.purpose) query.purpose = filters.purpose;

  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) {
      const s = new Date(filters.startDate);
      s.setHours(0, 0, 0, 0);
      query.createdAt.$gte = s;
    }
    if (filters.endDate) {
      const e = new Date(filters.endDate);
      e.setHours(23, 59, 59, 999);
      query.createdAt.$lte = e;
    }
  }

  if (filters.search && typeof filters.search === 'string') {
    const s = filters.search.trim();
    if (s) {
      query.$or = [
        { orderId: { $regex: s, $options: 'i' } },
        { paymentId: { $regex: s, $options: 'i' } },
        { username: { $regex: s, $options: 'i' } },
        { displayName: { $regex: s, $options: 'i' } },
        { purpose: { $regex: s, $options: 'i' } },
      ];
    }
  }

  return database
    .collection(collections.PAYMENTS_COLLECTION)
    .find(query)
    .sort({ createdAt: -1 })
    .limit(5000)
    .toArray();
}

module.exports = {
  initPaymentIndexes,
  validateAmount,
  createOrder,
  verifyPayment,
  recordFailure,
  handleWebhook,
  getUserPaymentHistory,
  getPaymentById,
  getAdminPaymentReports,
  getAllPaymentsForExport,
};
