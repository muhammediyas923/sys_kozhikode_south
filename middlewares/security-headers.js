const config = require('../config/env');

/**
 * Security HTTP Headers Middleware
 * Protects against Clickjacking, MIME-sniffing, XSS, and unauthorized framing
 * Fully compatible with Razorpay Checkout, Chart.js, Bootstrap 5, and Phosphor Icons
 */
module.exports = function securityHeaders(req, res, next) {
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Frame protection (allow framing only by same origin, Razorpay opens inside modal iframe)
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Cross-Origin Resource Policy
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // Permissions Policy
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

  // Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://checkout.razorpay.com https://api.razorpay.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com",
    "font-src 'self' data: https://cdn.jsdelivr.net https://unpkg.com https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://via.placeholder.com https://cdn.jsdelivr.net https://*.razorpay.com",
    "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://*.razorpay.com",
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  // Strict-Transport-Security in production
  if (config.app.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
};
