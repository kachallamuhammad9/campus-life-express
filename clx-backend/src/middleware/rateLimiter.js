/**
 * Rate Limiter Middleware
 * Protects sensitive endpoints (auth, orders, payments) against brute force and volumetric abuse.
 */

const { rateLimit } = require('express-rate-limit');
const config = require('../config/env');
const { formatErrorResponse } = require('./errorHandler');

/**
 * Creates an express-rate-limit middleware instance with standard CLX error formatting.
 *
 * @param {Object} options
 * @param {number} [options.windowMs] - Time window in milliseconds
 * @param {number} [options.max] - Max requests allowed in the window (default in prod/dev)
 * @param {number} [options.testMax] - Max requests allowed in test environment
 * @param {string} [options.errorCode] - Application error code
 * @param {string} [options.message] - Client-safe error message
 * @param {Object} [options.extraOptions] - Additional express-rate-limit options
 * @returns {import('express').RequestHandler}
 */
const createRateLimiter = (options = {}) => {
  const isTest = config.isTest();
  // Production-safe rate limiting: the disable flag is honored only outside
  // production so RATE_LIMIT_DISABLED=true can never silently weaken prod security.
  const isDisabled = process.env.RATE_LIMIT_DISABLED === 'true' && !config.isProduction();

  const defaultWindowMs = options.windowMs || 15 * 60 * 1000;
  const defaultMax = options.max !== undefined ? options.max : 100;
  const limit = isTest ? (options.testMax !== undefined ? options.testMax : 1000) : defaultMax;

  return rateLimit({
    windowMs: options.windowMs || defaultWindowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
    skip: () => isDisabled,
    handler: (req, res) => {
      return res.status(429).json(
        formatErrorResponse(false, {
          code: options.errorCode || 'TOO_MANY_REQUESTS',
          message: options.message || 'Too many requests, please try again later.',
        })
      );
    },
    ...options.extraOptions,
  });
};

// 1. Auth Rate Limiter (/api/v1/auth/*)
const authLimiter = createRateLimiter({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
  testMax: 1000,
  errorCode: 'AUTH_RATE_LIMIT_EXCEEDED',
  message: 'Too many authentication attempts. Please try again later.',
});

// 2. Order Submission Rate Limiter (/api/v1/orders checkout)
const orderLimiter = createRateLimiter({
  windowMs: config.orderRateLimitWindowMs,
  max: config.orderRateLimitMax,
  testMax: 1000,
  errorCode: 'ORDER_RATE_LIMIT_EXCEEDED',
  message: 'Too many order submissions. Please wait a moment before trying again.',
});

// 3. Payment Checkout Rate Limiter (/api/v1/payments checkout/initialization)
const paymentLimiter = createRateLimiter({
  windowMs: config.paymentRateLimitWindowMs,
  max: config.paymentRateLimitMax,
  testMax: 1000,
  errorCode: 'PAYMENT_RATE_LIMIT_EXCEEDED',
  message: 'Too many payment requests. Please wait a moment before trying again.',
});

module.exports = {
  createRateLimiter,
  authLimiter,
  orderLimiter,
  paymentLimiter,
};
