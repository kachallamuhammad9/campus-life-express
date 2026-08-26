const jwt = require('jsonwebtoken');
const config = require('../config/env');
const userRepository = require('../repositories/userRepository');
const { AppError } = require('../utils/AppError');

const ROLE_HIERARCHY = ['SUPER_ADMIN', 'ADMIN', 'VENDOR', 'RIDER', 'CUSTOMER'];
const VALID_ROLES = new Set(ROLE_HIERARCHY);

/**
 * Resolves the single primary application role from an array of roles.
 * Follows the hierarchy: SUPER_ADMIN > ADMIN > VENDOR > RIDER > CUSTOMER.
 * Defaults safely to CUSTOMER if no role is found.
 */
const resolvePrimaryRole = (roles = []) => {
  if (!Array.isArray(roles) || roles.length === 0) {
    return 'CUSTOMER';
  }

  for (const role of ROLE_HIERARCHY) {
    if (roles.includes(role)) {
      return role;
    }
  }

  return 'CUSTOMER';
};

/**
 * Verifies a Supabase / Application JWT
 * Throws 401 UNAUTHORIZED for invalid or expired tokens
 */
const verifyToken = (token) => {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication token is required');
  }

  const secret = config.jwtSecret;
  if (!secret) {
    throw new AppError(500, 'CONFIGURATION_ERROR', 'Authentication secret is not configured');
  }

  try {
    const decoded = jwt.verify(token.trim(), secret);
    const userId = decoded.sub || decoded.id;

    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid authentication token: missing user subject');
    }

    return decoded;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    if (err.name === 'TokenExpiredError') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication token has expired');
    }
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid authentication token');
  }
};

/**
 * Generates an application JWT for authentication
 */
const generateToken = (payload = {}, customExpiresIn = '7d') => {
  const secret = config.jwtSecret || 'clx-dev-test-jwt-secret-key-32-chars-dandalin';
  const defaultPayload = {
    sub: payload.userId || payload.sub || '00000000-0000-4000-8000-000000000088',
    email: payload.email || 'student@unimaid.edu.ng',
    role: 'authenticated',
    app_metadata: { provider: 'email' },
    user_metadata: { full_name: payload.fullName || 'Student User' },
  };

  return jwt.sign({ ...defaultPayload, ...payload }, secret, { expiresIn: customExpiresIn });
};

/**
 * Resolves the authenticated user context from database profiles and user_roles.
 * Ensures client-supplied roles and metadata are not blindly trusted.
 */
const resolveUserContext = async (decodedToken) => {
  const userId = (decodedToken.sub || decodedToken.id || '').trim();

  // Fetch verified roles and profile from database
  let roles = [];
  let profile = null;

  try {
    const [dbProfile, dbRoles] = await Promise.all([
      userRepository.getUserProfileById(userId),
      userRepository.getUserRoles(userId),
    ]);
    profile = dbProfile;
    roles = dbRoles || [];
  } catch (err) {
    // If database lookup throws an operational AppError, propagate it
    if (err instanceof AppError) throw err;
    if (config.isTest() || config.isDevelopment()) {
      profile = null;
      roles = [];
    } else {
      throw new AppError(500, 'DATABASE_ERROR', 'Failed to resolve user authorization context');
    }
  }

  // Deactivated accounts cannot proceed
  if (profile && profile.is_active === false) {
    throw new AppError(403, 'FORBIDDEN', 'User account is deactivated');
  }

  const resolvedRole = resolvePrimaryRole(roles);
  const resolvedRoles = roles.length > 0 ? roles : ['CUSTOMER'];
  const email = profile?.email || decodedToken.email || null;

  return {
    id: userId,
    email,
    role: resolvedRole,
    roles: resolvedRoles,
    profile: profile || null,
    claims: decodedToken,
  };
};

/**
 * Retrieves the full profile and roles for the /auth/me endpoint
 */
const getCurrentUser = async (userId, fallbackEmail = null) => {
  if (!userId || typeof userId !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const cleanUserId = userId.trim();
  let profile = null;
  let roles = [];

  try {
    const [dbProfile, dbRoles] = await Promise.all([
      userRepository.getUserProfileById(cleanUserId),
      userRepository.getUserRoles(cleanUserId),
    ]);
    profile = dbProfile;
    roles = dbRoles || [];
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (config.isTest() || config.isDevelopment()) {
      profile = null;
      roles = [];
    } else {
      throw new AppError(500, 'DATABASE_ERROR', 'Failed to retrieve user profile');
    }
  }

  if (profile && profile.is_active === false) {
    throw new AppError(403, 'FORBIDDEN', 'User account is deactivated');
  }

  const resolvedRole = resolvePrimaryRole(roles || []);
  const resolvedRoles = (roles && roles.length > 0) ? roles : ['CUSTOMER'];
  const email = profile?.email || fallbackEmail || null;

  return {
    id: cleanUserId,
    email,
    profile: profile || null,
    role: resolvedRole,
    roles: resolvedRoles,
  };
};

const authenticateCredentials = async (email, password) => {
  const user = await userRepository.getUserByCredentials(email, password);
  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  return user;
};

const registerAccount = async ({ email, password, fullName, phoneNumber, campusId }) => {
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', 'Email and password are required');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new AppError(400, 'INVALID_INPUT', 'Valid email address is required');
  }
  if (password.length < 8) {
    throw new AppError(400, 'INVALID_INPUT', 'Password must be at least 8 characters long');
  }
  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    throw new AppError(400, 'INVALID_INPUT', 'Full name must be at least 2 characters long');
  }

  try {
    return await userRepository.createUserAccount({
      email: email.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
      phoneNumber,
      campusId,
    });
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError(409, 'ACCOUNT_UNAVAILABLE', 'Unable to create this account');
    }
    if (error.code === 'INVALID_CAMPUS') {
      throw new AppError(400, 'INVALID_CAMPUS', 'Selected campus is not available');
    }
    throw error;
  }
};

module.exports = {
  ROLE_HIERARCHY,
  VALID_ROLES,
  resolvePrimaryRole,
  verifyToken,
  generateToken,
  resolveUserContext,
  getCurrentUser,
  authenticateCredentials,
  registerAccount,
};
