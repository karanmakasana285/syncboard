const rateLimit = require('express-rate-limit');

// general API limiter - applies to all routes.
// 100 requests per 15 minutes per IP is a common, reasonable starting point:
// generous enough for normal use, but stops runaway loops or abuse.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes, in milliseconds
  // raised from 100 to 400 after hitting the original limit during normal dev
  // usage - a single board load fires several requests at once (board +
  // one per column + one per column's cards), and React StrictMode
  // double-invokes effects in development, so real usage approaches 100
  // faster than expected. 400 still meaningfully caps abuse while giving
  // normal use real headroom.
  max: 400,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true, // adds RateLimit-* headers so clients can see their remaining quota
  legacyHeaders: false,
});

// stricter limiter specifically for auth routes - signup/login are common
// brute-force targets, so they get a tighter limit than general API usage
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many auth attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { apiLimiter, authLimiter };
