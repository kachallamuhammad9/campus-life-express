const authService = require('../services/authService');
const { sendSuccess } = require('../utils/response');
const { AppError } = require('../utils/AppError');

/**
 * Auth Controller
 * Handles authentication status, session token issuance, and user profile endpoints
 */

const getMe = async (req, res) => {
  const user = await authService.getCurrentUser(req.user.id, req.user.email);
  return sendSuccess(res, user);
};

const login = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', 'Email and password are required');
  }

  const cleanEmail = email.trim().toLowerCase();
  const authenticatedUser = await authService.authenticateCredentials(cleanEmail, password);
  const currentUser = await authService.getCurrentUser(authenticatedUser.id, authenticatedUser.email);
  const token = authService.generateToken({
    sub: authenticatedUser.id,
    email: authenticatedUser.email,
    fullName: currentUser.profile?.full_name,
  });

  return sendSuccess(res, {
    token,
    user: currentUser,
  });
};

const register = async (req, res) => {
  const { email, password, fullName, phoneNumber, campusId } = req.body || {};
  const account = await authService.registerAccount({ email, password, fullName, phoneNumber, campusId });
  const currentUser = await authService.getCurrentUser(account.id, account.email);
  const token = authService.generateToken({
    sub: account.id,
    email: account.email,
    fullName: currentUser.profile?.full_name,
  });

  return sendSuccess(res, {
    token,
    user: currentUser,
  }, 201);
};

const demoSession = async (req, res) => {
  const role = (req.body?.role || req.query?.role || 'CUSTOMER').toUpperCase();
  let userId = '5689167a-10a2-4dd4-92b0-3901922e901a';
  let email = 'e2e.test.user@campuslife.express';

  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    userId = role === 'SUPER_ADMIN'
      ? 'd538e58d-ea27-4240-9ac9-0251563f7296'
      : 'c427e58d-ea27-4240-9ac9-0251563f7295';
    email = role === 'SUPER_ADMIN'
      ? 'e2e.superadmin@campuslife.express'
      : 'e2e.admin@campuslife.express';
  } else if (role === 'VENDOR') {
    userId = '00000000-0000-4000-8000-000000000010';
    email = 'vendor@unimaid.edu.ng';
  } else if (role === 'RIDER') {
    userId = '00000000-0000-4000-8000-000000000030';
    email = 'rider@unimaid.edu.ng';
  }

  const token = authService.generateToken({
    sub: userId,
    email,
    role: 'authenticated',
  });

  return sendSuccess(res, {
    token,
    user: {
      id: userId,
      email,
      role: role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : role === 'ADMIN' ? 'ADMIN' : role === 'VENDOR' ? 'VENDOR' : role === 'RIDER' ? 'RIDER' : 'CUSTOMER',
      roles: [role],
    },
  });
};

module.exports = {
  getMe,
  login,
  register,
  demoSession,
};
