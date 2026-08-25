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
  if (!email || typeof email !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', 'Valid email address is required');
  }

  const cleanEmail = email.trim().toLowerCase();
  const token = authService.generateToken({
    sub: '00000000-0000-4000-8000-000000000088',
    email: cleanEmail,
  });

  return sendSuccess(res, {
    token,
    user: {
      id: '00000000-0000-4000-8000-000000000088',
      email: cleanEmail,
      role: 'CUSTOMER',
      roles: ['CUSTOMER'],
    },
  });
};

const register = async (req, res) => {
  const { email, fullName, phoneNumber, campusId } = req.body || {};
  if (!email || typeof email !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', 'Valid email address is required');
  }

  const cleanEmail = email.trim().toLowerCase();
  const token = authService.generateToken({
    sub: '00000000-0000-4000-8000-000000000088',
    email: cleanEmail,
    fullName: fullName || 'Student User',
  });

  return sendSuccess(res, {
    token,
    user: {
      id: '00000000-0000-4000-8000-000000000088',
      email: cleanEmail,
      fullName: fullName || 'Student User',
      phoneNumber: phoneNumber || null,
      campusId: campusId || 'unimaid',
      role: 'CUSTOMER',
      roles: ['CUSTOMER'],
    },
  }, 201);
};

const demoSession = async (req, res) => {
  const role = (req.body?.role || req.query?.role || 'CUSTOMER').toUpperCase();
  let userId = '00000000-0000-4000-8000-000000000088';
  let email = 'student@unimaid.edu.ng';

  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    userId = '00000000-0000-4000-8000-000000000001';
    email = 'admin@campuslife.express';
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
