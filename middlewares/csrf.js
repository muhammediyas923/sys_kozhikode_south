/**
 * CSRF Protection Middleware
 * Defends against Cross-Site Request Forgery across all state-changing endpoints
 * Excludes HMAC-verified webhooks (/api/payments/webhook)
 */

const crypto = require('crypto');
const config = require('../config/env');

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function csrfProtection(req, res, next) {
  // Ensure session exists
  if (!req.session) {
    return next();
  }

  // Ensure CSRF token exists in session
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  const token = req.session.csrfToken;
  res.locals.csrfToken = token;

  // Set readable cookie for client-side fetch calls (sameSite lax, secure in prod)
  if (!req.cookies || req.cookies['sys.csrf'] !== token) {
    res.cookie('sys.csrf', token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: config.app.isProduction,
      path: '/'
    });
  }

  // Safe HTTP methods do not mutate state
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Exempt webhooks (e.g. Razorpay payment webhook, verified via HMAC-SHA256 signature)
  if (req.originalUrl === '/api/payments/webhook' || req.baseUrl + req.path === '/api/payments/webhook') {
    return next();
  }

  // Extract token from header or body or query
  const submittedToken =
    req.headers['x-csrf-token'] ||
    req.headers['csrf-token'] ||
    (req.body && req.body._csrf) ||
    (req.body && req.body.csrfToken) ||
    (req.query && req.query._csrf);

  if (!submittedToken || !safeCompare(submittedToken, token)) {
    console.warn(`[CSRF] Blocked ${req.method} ${req.originalUrl} from IP ${req.ip} (missing or invalid token)`);

    // Check if AJAX / API / JSON request
    const isApi = req.originalUrl.startsWith('/api/') ||
                  req.xhr ||
                  (req.headers.accept && req.headers.accept.includes('application/json'));

    if (isApi) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired CSRF token. Please refresh the page.'
      });
    }

    // If it's a login form submission with an expired/missing token, redirect back with error
    if (['/login', '/admin/login', '/circle-login', '/zone-login'].includes(req.path)) {
      req.session.loginError = 'Session expired. Please try submitting again.';
      return res.redirect(req.path);
    }

    return res.status(403).send('Forbidden: Invalid or expired CSRF token. Please refresh the page and try again.');
  }

  next();
}

module.exports = csrfProtection;
