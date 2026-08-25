const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const config = require('../src/config/env');
const authService = require('../src/services/authService');
const { requireRole, optionalAuth } = require('../src/middleware/auth');
const userRepository = require('../src/repositories/userRepository');
const {
  TEST_USER_ID,
  TEST_ADMIN_ID,
  TEST_VENDOR_USER_ID,
  generateTestToken,
  getAuthHeader,
} = require('./helpers/authHelper');

const request = (path, options = {}) => new Promise((resolve, reject) => {
  const server = app.listen(0, () => {
    const { port } = server.address();
    const method = options.method || 'GET';
    const payload = options.body ? JSON.stringify(options.body) : null;

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        ...(options.headers || {}),
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        } : {}),
      },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        server.close(() => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          resolve({
            statusCode: res.statusCode,
            body: parsed,
          });
        });
      });
    });

    req.on('error', (error) => server.close(() => reject(error)));

    if (payload) {
      req.write(payload);
    }
    req.end();
  });

  server.on('error', reject);
});

const withUserRepoStub = async (stubs, callback) => {
  const originals = {
    getUserProfileById: userRepository.getUserProfileById,
    getUserRoles: userRepository.getUserRoles,
  };

  Object.assign(userRepository, stubs);
  try {
    return await callback();
  } finally {
    Object.assign(userRepository, originals);
  }
};

test('1. GET /api/v1/auth/me returns authenticated user profile and roles', async () => {
  const mockProfile = {
    id: TEST_USER_ID,
    email: 'student@unimaid.edu.ng',
    full_name: 'Amina Abubakar',
    avatar_url: 'https://example.com/amina.jpg',
    phone: '+2348011223344',
    campus_id: '00000000-0000-4000-8000-000000000001',
    campus_name: 'University of Maiduguri',
    campus_slug: 'unimaid',
    is_active: true,
  };

  const result = await withUserRepoStub({
    getUserProfileById: async (id) => (id === TEST_USER_ID ? mockProfile : null),
    getUserRoles: async () => ['CUSTOMER'],
  }, () => request('/api/v1/auth/me', {
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID, email: 'student@unimaid.edu.ng' }) },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.id, TEST_USER_ID);
  assert.equal(result.body.data.email, 'student@unimaid.edu.ng');
  assert.equal(result.body.data.role, 'CUSTOMER');
  assert.deepEqual(result.body.data.roles, ['CUSTOMER']);
  assert.equal(result.body.data.profile.full_name, 'Amina Abubakar');
});

test('2. GET /api/v1/auth/me without Authorization header returns 401 UNAUTHORIZED', async () => {
  const result = await request('/api/v1/auth/me');

  assert.equal(result.statusCode, 401);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'UNAUTHORIZED');
  assert.match(result.body.error.message, /Authentication token is required/i);
});

test('3. GET /api/v1/auth/me with malformed Authorization header returns 401', async () => {
  const result = await request('/api/v1/auth/me', {
    headers: { Authorization: 'Basic dXNlcjpwYXNz' },
  });

  assert.equal(result.statusCode, 401);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'UNAUTHORIZED');
  assert.match(result.body.error.message, /invalid authorization header format/i);
});

test('4. GET /api/v1/auth/me with forged token signature returns 401 UNAUTHORIZED', async () => {
  const forgedToken = generateTestToken({ sub: TEST_USER_ID }, 'completely-wrong-secret-key-signature');

  const result = await request('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${forgedToken}` },
  });

  assert.equal(result.statusCode, 401);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'UNAUTHORIZED');
  assert.match(result.body.error.message, /invalid authentication token/i);
});

test('5. GET /api/v1/auth/me with expired token returns 401 UNAUTHORIZED', async () => {
  const expiredToken = generateTestToken({
    sub: TEST_USER_ID,
    exp: Math.floor(Date.now() / 1000) - 60, // expired 1 minute ago
    iat: Math.floor(Date.now() / 1000) - 3600,
  });

  const result = await request('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });

  assert.equal(result.statusCode, 401);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'UNAUTHORIZED');
  assert.match(result.body.error.message, /token has expired/i);
});

test('6. GET /api/v1/auth/me for deactivated user account returns 403 FORBIDDEN', async () => {
  const deactivatedProfile = {
    id: TEST_USER_ID,
    email: 'suspended@unimaid.edu.ng',
    is_active: false,
  };

  const result = await withUserRepoStub({
    getUserProfileById: async () => deactivatedProfile,
    getUserRoles: async () => ['CUSTOMER'],
  }, () => request('/api/v1/auth/me', {
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
  }));

  assert.equal(result.statusCode, 403);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'FORBIDDEN');
  assert.match(result.body.error.message, /deactivated/i);
});

test('7. Role hierarchy resolves primary role correctly for multiple roles', () => {
  assert.equal(authService.resolvePrimaryRole(['CUSTOMER', 'SUPER_ADMIN', 'VENDOR']), 'SUPER_ADMIN');
  assert.equal(authService.resolvePrimaryRole(['RIDER', 'ADMIN', 'CUSTOMER']), 'ADMIN');
  assert.equal(authService.resolvePrimaryRole(['CUSTOMER', 'VENDOR']), 'VENDOR');
  assert.equal(authService.resolvePrimaryRole(['CUSTOMER', 'RIDER']), 'RIDER');
  assert.equal(authService.resolvePrimaryRole(['CUSTOMER']), 'CUSTOMER');
  assert.equal(authService.resolvePrimaryRole([]), 'CUSTOMER');
  assert.equal(authService.resolvePrimaryRole(null), 'CUSTOMER');
});

test('8. requireRole middleware grants access to matching role', async () => {
  const middleware = requireRole('VENDOR');
  let nextCalled = false;
  const mockReq = {
    user: {
      id: TEST_VENDOR_USER_ID,
      role: 'VENDOR',
      roles: ['VENDOR', 'CUSTOMER'],
    },
  };
  const mockRes = {};
  const mockNext = (err) => {
    assert.ifError(err);
    nextCalled = true;
  };

  await middleware(mockReq, mockRes, mockNext);
  assert.equal(nextCalled, true);
});

test('9. requireRole middleware grants access through SUPER_ADMIN inheritance', async () => {
  const middleware = requireRole('VENDOR');
  let nextCalled = false;
  const mockReq = {
    user: {
      id: TEST_ADMIN_ID,
      role: 'SUPER_ADMIN',
      roles: ['SUPER_ADMIN'],
    },
  };
  const mockRes = {};
  const mockNext = (err) => {
    assert.ifError(err);
    nextCalled = true;
  };

  await middleware(mockReq, mockRes, mockNext);
  assert.equal(nextCalled, true);
});

test('10. requireRole middleware rejects insufficient role with 403 FORBIDDEN', async () => {
  const middleware = requireRole('ADMIN');
  let errorCaught = null;
  const mockReq = {
    user: {
      id: TEST_USER_ID,
      role: 'CUSTOMER',
      roles: ['CUSTOMER'],
    },
  };
  const mockRes = {};
  const mockNext = (err) => {
    errorCaught = err;
  };

  await middleware(mockReq, mockRes, mockNext);
  assert.ok(errorCaught);
  assert.equal(errorCaught.statusCode, 403);
  assert.equal(errorCaught.code, 'FORBIDDEN');
  assert.match(errorCaught.message, /insufficient permissions/i);
});

test('11. optionalAuth populates req.user when valid token is provided', async () => {
  const validToken = generateTestToken({ sub: TEST_USER_ID, email: 'optional@unimaid.edu.ng' });
  const mockReq = {
    headers: { authorization: `Bearer ${validToken}` },
  };
  const mockRes = {};
  let nextCalled = false;

  await withUserRepoStub({
    getUserProfileById: async () => ({ id: TEST_USER_ID, email: 'optional@unimaid.edu.ng', is_active: true }),
    getUserRoles: async () => ['CUSTOMER'],
  }, async () => {
    await optionalAuth(mockReq, mockRes, (err) => {
      assert.ifError(err);
      nextCalled = true;
    });
  });

  assert.equal(nextCalled, true);
  assert.ok(mockReq.user);
  assert.equal(mockReq.user.id, TEST_USER_ID);
  assert.equal(mockReq.user.email, 'optional@unimaid.edu.ng');
});

test('12. optionalAuth passes through as null user when no token is present', async () => {
  const mockReq = { headers: {} };
  const mockRes = {};
  let nextCalled = false;

  await optionalAuth(mockReq, mockRes, (err) => {
    assert.ifError(err);
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(mockReq.user, null);
});

test('13. optionalAuth rejects invalid token format with 401 UNAUTHORIZED', async () => {
  const mockReq = { headers: { authorization: 'Bearer invalid-garbage-token' } };
  const mockRes = {};
  let errorCaught = null;

  await optionalAuth(mockReq, mockRes, (err) => {
    errorCaught = err;
  });

  assert.ok(errorCaught);
  assert.equal(errorCaught.statusCode, 401);
  assert.equal(errorCaught.code, 'UNAUTHORIZED');
});
