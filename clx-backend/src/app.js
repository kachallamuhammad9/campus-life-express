/**
 * Express Application Setup
 * Configures the Express app with middleware and routes
 */

const express = require('express');
const { randomUUID } = require('node:crypto');
const helmet = require('helmet');
const morgan = require('morgan');
const corsMiddleware = require('./middleware/cors');
const { notFound } = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');
const config = require('./config/env');

// Create Express app
const app = express();

// Trust reverse proxy headers (e.g. Cloud Run, Nginx, load balancers)
app.set('trust proxy', 1);

// ====================================
// SECURITY & LOGGING MIDDLEWARE
// ====================================

// Helmet: Security headers
app.use(helmet());

// Morgan: Request logging
const morganFormat = config.isDevelopment() ? 'dev' : 'combined';
app.use(morgan(morganFormat));

// ====================================
// CORS & BODY PARSING MIDDLEWARE
// ====================================

// CORS configuration
app.use(corsMiddleware);

// Retain the raw JSON bytes for provider webhook signature verification.
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  },
}));

// Parse URL-encoded request bodies
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ====================================
// REQUEST ID MIDDLEWARE
// ====================================

// Add request ID for tracking
app.use((req, res, next) => {
  req.id = randomUUID();
  if (config.isDevelopment()) {
    console.log(`[${req.id}] ${req.method} ${req.path}`);
  }
  next();
});

// ====================================
// ROUTES
// ====================================

app.use(routes);

// Handle unknown routes with the shared application error format.
app.use(notFound);

// ====================================
// ERROR HANDLING MIDDLEWARE
// ====================================

// Must be last middleware
app.use(errorHandler);

module.exports = app;
