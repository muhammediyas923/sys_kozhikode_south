/**
 * Lightweight, in-memory rate limiter middleware
 * Provides brute-force and resource abuse protection with zero external dependencies
 */

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 15, message = 'Too many requests. Please try again later.' }) {
  const store = new Map();

  // Periodically sweep expired entries to prevent memory growth
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, Math.max(windowMs, 60000));

  // Allow Node to exit cleanly without keeping interval alive
  if (sweepInterval.unref) sweepInterval.unref();

  return function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown-ip';
    const key = `${req.baseUrl || ''}${req.path}:${ip}`;
    const now = Date.now();

    let record = store.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      store.set(key, record);
      return next();
    }

    record.count++;
    if (record.count > max) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));

      if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api')) {
        return res.status(429).json({ success: false, message });
      }

      // If page POST request (e.g. login form), store error in session and redirect back
      if (req.session) {
        req.session.loginError = message;
      }
      return res.status(429).redirect(req.originalUrl || '/');
    }

    next();
  };
}

module.exports = {
  createRateLimiter,
  loginLimiter: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per 15 min per IP
    message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
  }),
  paymentOrderLimiter: createRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 25, // 25 orders per 5 min
    message: 'Too many payment requests initiated. Please wait a moment before trying again.',
  }),
  sensitiveApiLimiter: createRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50,
    message: 'Too many requests. Please slow down.',
  }),
};
