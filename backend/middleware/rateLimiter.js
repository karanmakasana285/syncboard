const rateLimit = require('express-rate-limit');

// general API limiter - applies to all routes.
// 100 requests per 15 minutes per IP is a common, reasonable starting point:
// generous enough for normal use, but stops runaway loops or abuse.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes, in milliseconds
  max: 100,
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
