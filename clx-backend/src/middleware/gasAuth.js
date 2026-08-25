const crypto = require('crypto');
const config = require('../config/env');
const authService = require('../services/authService');
const { AppError } = require('../utils/AppError');

/**
 * Timing-safe string comparison to prevent timing side-channel attacks
 */
const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Google Apps Script Integration Authentication Middleware
 * 
 * Allows access if:
 * 1. Request includes valid X-GAS-API-Key / X-Integration-Key header matching configured key
 * 2. OR Request includes valid Bearer JWT of an ADMIN or SUPER_ADMIN user
 */
const requireGasAuth = async (req, res, next) => {
  try {
    const apiKey =
      req.headers['x-gas-api-key'] ||
      req.headers['x-integration-key'] ||
      req.headers['x-api-key'];

    const configuredKey = config.gasIntegrationKey;

    // Check API Key
    if (apiKey && typeof apiKey === 'string') {
      if (configuredKey && safeEqual(apiKey.trim(), configuredKey.trim())) {
        req.gasAuth = {
          type: 'API_KEY',
          authenticated: true,
          caller: 'GOOGLE_APPS_SCRIPT',
        };
        return next();
      }
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Invalid Google Apps Script integration API key'
      );
    }

    // Check Bearer JWT Authorization
    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === 'string') {
      const trimmed = authHeader.trim();
      if (trimmed.startsWith('Bearer ') || trimmed.startsWith('bearer ')) {
        const token = trimmed.substring(7).trim();
        if (token) {
          const decoded = authService.verifyToken(token);
          const userContext = await authService.resolveUserContext(decoded);

          const hasAdminRole =
            userContext &&
            Array.isArray(userContext.roles) &&
            userContext.roles.some((r) =>
              ['ADMIN', 'SUPER_ADMIN'].includes(String(r).toUpperCase())
            );

          if (!hasAdminRole) {
            throw new AppError(
              403,
              'FORBIDDEN',
              'Administrative privileges required for Google Apps Script integration endpoints'
            );
          }

          req.user = userContext;
          req.gasAuth = {
            type: 'JWT_ADMIN',
            authenticated: true,
            caller: userContext.email,
            user: userContext,
          };
          return next();
        }
      }
    }

    // Neither valid API key nor Admin JWT provided
    throw new AppError(
      401,
      'UNAUTHORIZED',
      'Missing or invalid credentials for Google Apps Script integration'
    );
  } catch (err) {
    next(err);
  }
};

module.exports = {
  requireGasAuth,
  safeEqual,
};
