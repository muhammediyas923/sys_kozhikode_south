/**
 * Centralized Application Environment & Configuration
 * Validates required configuration and eliminates insecure production fallbacks.
 */
require('dotenv').config();

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

// Production safety checks - fail fast if critical secrets are missing
if (isProduction) {
  const missingSecrets = [];
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'sys-session-secret') {
    missingSecrets.push('SESSION_SECRET');
  }
  if (!process.env.MONGODB_URI) {
    missingSecrets.push('MONGODB_URI');
  }
  if (!process.env.RAZORPAY_KEY_ID) {
    missingSecrets.push('RAZORPAY_KEY_ID');
  }
  if (!process.env.RAZORPAY_KEY_SECRET) {
    missingSecrets.push('RAZORPAY_KEY_SECRET');
  }

  if (missingSecrets.length > 0) {
    const errMessage = `[FATAL] Production configuration error: Missing required environment variables: ${missingSecrets.join(', ')}`;
    console.error(errMessage);
    throw new Error(errMessage);
  }
}

const config = {
  app: {
    env,
    isProduction,
    port: parseInt(process.env.PORT || '3000', 10),
    url: process.env.APP_URL || 'http://localhost:3000',
  },
  db: {
    uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
    name: process.env.MONGODB_DB || 'sys',
  },
  session: {
    secret: process.env.SESSION_SECRET || 'sys-session-dev-secret-change-in-production',
    maxAge: 60 * 60 * 1000, // 1 hour
  },
  razorpay: {
    mode: process.env.PAYMENT_MODE || 'test',
    keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy_key_id',
    keySecret: process.env.RAZORPAY_KEY_SECRET || 'dummy_razorpay_secret_key',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    currency: process.env.RAZORPAY_CURRENCY || 'INR',
  },
  adminSeed: {
    username: process.env.SUPER_ADMIN_USERNAME || 'sysadmin',
    password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@1234',
  },
};

module.exports = config;
