/**
 * CLX Backend Server Entry Point
 * Starts the Express server and manages lifecycle
 */

const app = require('./app');
const config = require('./config/env');
const database = require('./config/database');

const PORT = config.port;

// ====================================
// SERVER STARTUP
// ====================================

const server = app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Campus Life Express (CLX) - Backend API Server');
  console.log('  Powered by Dandalin Sauki Ltd');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Status: RUNNING`);
  console.log(`  Environment: ${config.nodeEnv}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/v1/health`);
  console.log(`  Frontend Origin: ${config.frontendUrl}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');
});

// ====================================
// GRACEFUL SHUTDOWN
// ====================================

const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

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
