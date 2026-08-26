/**
 * CORS Configuration Middleware
 * Configures Cross-Origin Resource Sharing
 */

const cors = require('cors');
const config = require('../config/env');

/**
 * CORS options configuration
 */
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || origin === config.frontendUrl) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24 hours
};

if (config.isDevelopment()) {
  console.log('[CORS] Configured for:', corsOptions.origin);
}

module.exports = cors(corsOptions);
