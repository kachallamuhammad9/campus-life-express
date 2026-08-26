/**
 * CLX Backend Server Entry Point
 * Starts the Express server and manages lifecycle
 */

const app = require('./app');
const config = require('./config/env');
const database = require('./config/database');

const PORT = config.port;
let server = null;

const startServer = async () => {
  const missingConfig = config.validateProductionConfig();
  if (missingConfig.length > 0) {
    throw new Error(`Missing required production configuration: ${missingConfig.join(', ')}`);
  }

  if (config.isProduction() && !(await database.testConnection())) {
    throw new Error('Production database connectivity check failed');
  }

  return new Promise((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`CLX API listening on port ${PORT} (${config.nodeEnv})`);
      resolve(server);
    });
  });
};

// ====================================
// GRACEFUL SHUTDOWN
// ====================================

const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  if (!server) {
    await database.closePool();
    process.exit(0);
  }

  server.close(async () => {
    console.log('Server closed');

    // Close database connection
    await database.closePool();

    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ====================================
// UNHANDLED ERRORS
// ====================================

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer().catch((error) => {
  console.error('CLX API failed to start:', error.message);
  process.exit(1);
});

module.exports = { startServer };
