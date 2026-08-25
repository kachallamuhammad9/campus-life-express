/**
 * Health Check Endpoint
 * Verifies backend server and database connectivity
 */

const express = require('express');
const database = require('../config/database');
const config = require('../config/env');
const { sendSuccess } = require('../utils/response');

const router = express.Router();

/**
 * GET /api/v1/health
 * Health check endpoint
 * Returns server status and database connection status
 */
router.get('/health', async (req, res) => {
  try {
    const dbConnected = await database.testConnection();

    // Return 200 if database is connected, 503 if not
    const statusCode = dbConnected ? 200 : 503;
    return sendSuccess(res, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      database: dbConnected ? 'connected' : 'disconnected',
    }, statusCode);
  } catch (error) {
    console.error('[HEALTH] Error during health check:', error.message);

    return res.status(503).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: 'Health check failed',
      },
      data: {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        database: 'error',
      },
    });
  }
});

module.exports = router;
