/**
 * Error Handler Middleware
 * Centralized error handling for the Express application
 */

const config = require('../config/env');
const { AppError } = require('../utils/AppError');

/**
 * Error response format
 * @param {boolean} success - Operation success status
 * @param {object} error - Error object with code and message
 * @param {*} data - Response data
 * @returns {object}
 */
const formatErrorResponse = (success, error, data = null) => {
  return {
    success,
    error,
    ...(data && { data }),
    timestamp: new Date().toISOString(),
  };
};

/**
 * Main error handler middleware
 * Must be the LAST middleware defined in app
 */
const errorHandler = (err, req, res, next) => {
  // Log error
  console.error('[ERROR]', {
    message: err.message,
    stack: config.isDevelopment() ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Default error response
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let errorMessage = 'An unexpected error occurred';

  // Handle specific error types
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code || 'APPLICATION_ERROR';
    errorMessage = err.clientMessage || err.message || 'An error occurred';
  }

  // In production, don't expose stack traces or detailed errors
  if (config.isProduction()) {
    errorMessage = statusCode === 500 ? 'Internal server error' : errorMessage;
  }

  return res.status(statusCode).json(
    formatErrorResponse(false, {
      code: errorCode,
      message: errorMessage,
    })
  );
};

module.exports = {
  errorHandler,
  formatErrorResponse,
};
