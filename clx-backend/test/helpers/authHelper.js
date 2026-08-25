const jwt = require('jsonwebtoken');
const config = require('../../src/config/env');
const userRepository = require('../../src/repositories/userRepository');

const TEST_USER_ID = '00000000-0000-4000-8000-000000000088';
const TEST_ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const TEST_VENDOR_USER_ID = '00000000-0000-4000-8000-000000000010';

const generateTestToken = (payload = {}, customSecret = null, customOptions = {}) => {
  const secret = customSecret || config.jwtSecret || 'clx-dev-test-jwt-secret-key-32-chars-dandalin';
  const defaultPayload = {
    sub: TEST_USER_ID,
    email: 'student@unimaid.edu.ng',
    role: 'authenticated',
    app_metadata: { provider: 'email' },
    user_metadata: { full_name: 'Student User' },
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  return jwt.sign({ ...defaultPayload, ...payload }, secret, customOptions);
};

const getAuthHeader = (payload = {}, customSecret = null, customOptions = {}) => {
  const token = generateTestToken(payload, customSecret, customOptions);
  return `Bearer ${token}`;
};

const withUserStub = async (stubs, fn) => {
  const original = {};
  for (const [key, stubFn] of Object.entries(stubs)) {
    original[key] = userRepository[key];
    userRepository[key] = stubFn;
  }

  try {
    return await fn();
  } finally {
    for (const key of Object.keys(stubs)) {
      userRepository[key] = original[key];
    }
  }
};

module.exports = {
  TEST_USER_ID,
  TEST_ADMIN_ID,
  TEST_VENDOR_USER_ID,
  generateTestToken,
  getAuthHeader,
  withUserStub,
};
