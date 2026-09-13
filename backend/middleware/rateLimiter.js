const rateLimit = require('express-rate-limit');

// general API limiter - applies to all routes.
// raised from 100 to 400 after hitting the original limit during normal dev
// usage - a single board load fires several requests at once (board +
// one per column + one per column's cards), and React StrictMode
// double-invokes effects in development, so real usage approaches 100
// faster than expected. 400 still meaningfully caps abuse while giving
// normal use real headroom.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// stricter limiter specifically for auth routes - signup/login are common
// brute-force targets, so they get a tighter limit than general API usage.
// raised from 10 to 30 - same reasoning as the general limiter: heavy manual
// testing during development legitimately exceeds a limit meant for
// production brute-force protection. Still meaningfully restrictive.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many auth attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { apiLimiter, authLimiter };
