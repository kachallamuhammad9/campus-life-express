const authService = require('../services/authService');
const { AppError } = require('../utils/AppError');

/**
 * Authentication Middleware
 * Enforces valid Bearer JWT and resolves the user's verified identity and roles.
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication token is required');
    }

    const trimmed = authHeader.trim();
    if (!trimmed.startsWith('Bearer ') && !trimmed.startsWith('bearer ')) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Invalid authorization header format. Expected Bearer <token>'
      );
    }

    const token = trimmed.substring(7).trim();
    if (!token) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Invalid authorization header format. Missing token'
      );
    }

    // Verify token cryptographic signature and expiration
    const decoded = authService.verifyToken(token);

    // Resolve user context from verified database records
    const userContext = await authService.resolveUserContext(decoded);

    // Attach to request
    req.user = userContext;

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Optional Authentication Middleware
 * Attaches user context if a valid token is provided, but does not reject unauthenticated requests.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      req.user = null;
      return next();
    }

    const trimmed = authHeader.trim();
    if (!trimmed.startsWith('Bearer ') && !trimmed.startsWith('bearer ')) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Invalid authorization header format. Expected Bearer <token>'
      );
    }

    const token = trimmed.substring(7).trim();
    if (!token) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Invalid authorization header format. Missing token'
      );
    }

    const decoded = authService.verifyToken(token);
    const userContext = await authService.resolveUserContext(decoded);
    req.user = userContext;

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Authorization Middleware Factory
 * Restricts route access to users with specified application roles.
 * Returns 403 FORBIDDEN if the user does not possess at least one permitted role.
 *
 * @param  {...string|string[]} allowedRoles - Roles allowed to access the route
 */
const requireRole = (...allowedRoles) => {
  const flattenedRoles = allowedRoles
    .flat()
    .map((r) => String(r).trim().toUpperCase())
    .filter(Boolean);

  const allowedSet = new Set(flattenedRoles);

  return (req, res, next) => {
    if (!req.user || !req.user.id) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Authentication is required'));
    }

    const userRole = (req.user.role || '').toUpperCase();
    const userRoles = (req.user.roles || []).map((r) => String(r).toUpperCase());

    // Super Admin inherits admin privileges
    if (userRole === 'SUPER_ADMIN' || userRoles.includes('SUPER_ADMIN')) {
      return next();
    }

    const hasRole = allowedSet.has(userRole) || userRoles.some((r) => allowedSet.has(r));

    if (!hasRole) {
      return next(
        new AppError(403, 'FORBIDDEN', 'Insufficient permissions to access this resource')
      );
    }

    next();
  };
};

module.exports = {
  requireAuth,
  optionalAuth,
  requireRole,
};
