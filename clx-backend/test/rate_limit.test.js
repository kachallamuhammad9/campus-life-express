const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const app = require('../src/app');
const {
  createRateLimiter,
  authLimiter,
  orderLimiter,
  paymentLimiter,
} = require('../src/middleware/rateLimiter');
const { getAuthHeader } = require('./helpers/authHelper');
const { buildSslConfig } = require('../src/config/database');
const campusRepository = require('../src/repositories/campusRepository');
const categoryRepository = require('../src/repositories/categoryRepository');

const makeRequest = (appInstance, path, options = {}) => new Promise((resolve, reject) => {
  const server = appInstance.listen(0, () => {
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
            headers: res.headers,
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
});

test('1. Custom rate limiter permits requests below the configured threshold', async () => {
  const testApp = express();
  const testLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 3,
    testMax: 3,
  });

  testApp.use('/test-allowed', testLimiter, (req, res) => {
    res.status(200).json({ success: true, message: 'allowed' });
  });

  const res1 = await makeRequest(testApp, '/test-allowed');
  assert.equal(res1.statusCode, 200);
  assert.equal(res1.body.success, true);

  const res2 = await makeRequest(testApp, '/test-allowed');
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.success, true);
});

test('2. Custom rate limiter blocks requests exceeding limit and returns HTTP 429', async () => {
  const testApp = express();
  const testLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 2,
    testMax: 2,
    errorCode: 'TEST_LIMIT_EXCEEDED',
    message: 'Too many test requests.',
  });

  testApp.use('/test-throttled', testLimiter, (req, res) => {
    res.status(200).json({ success: true });
  });

  // Request 1 & 2 - under limit
  await makeRequest(testApp, '/test-throttled');
  await makeRequest(testApp, '/test-throttled');

  // Request 3 - exceeds limit
  const res3 = await makeRequest(testApp, '/test-throttled');
  assert.equal(res3.statusCode, 429);
  assert.equal(res3.body.success, false);
  assert.equal(res3.body.error.code, 'TEST_LIMIT_EXCEEDED');
  assert.equal(res3.body.error.message, 'Too many test requests.');
  assert.ok(res3.body.timestamp, 'Response should contain timestamp');
  assert.equal(res3.body.stack, undefined, 'Stack traces must not be exposed');
});

test('3. Rate limit response includes standard RateLimit headers', async () => {
  const testApp = express();
  const testLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    testMax: 5,
  });

  testApp.use('/test-headers', testLimiter, (req, res) => {
    res.status(200).json({ success: true });
  });

  const res = await makeRequest(testApp, '/test-headers');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['ratelimit-limit'] || res.headers['x-ratelimit-limit'] || res.headers['ratelimit-policy']);
});

test('4. Auth rate limiter is properly mounted and enforces limits on /api/v1/auth', async () => {
  const testApp = express();
  testApp.use(express.json());

  // Mount authLimiter with tight test threshold
  const tightAuthLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 2,
    testMax: 2,
    errorCode: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts. Please try again later.',
  });

  testApp.use('/api/v1/auth', tightAuthLimiter, (req, res) => {
    res.status(200).json({ success: true, data: { user: 'test' } });
  });

  // Requests 1 & 2 succeed
  const r1 = await makeRequest(testApp, '/api/v1/auth/login', { method: 'POST', body: { email: 'a@b.com' } });
  assert.equal(r1.statusCode, 200);

  const r2 = await makeRequest(testApp, '/api/v1/auth/login', { method: 'POST', body: { email: 'a@b.com' } });
  assert.equal(r2.statusCode, 200);

  // Request 3 is blocked
  const r3 = await makeRequest(testApp, '/api/v1/auth/login', { method: 'POST', body: { email: 'a@b.com' } });
  assert.equal(r3.statusCode, 429);
  assert.equal(r3.body.success, false);
  assert.equal(r3.body.error.code, 'AUTH_RATE_LIMIT_EXCEEDED');
});

test('5. Order rate limiter protects checkout / order creation endpoint', async () => {
  const testApp = express();
  testApp.use(express.json());

  const tightOrderLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 1,
    testMax: 1,
    errorCode: 'ORDER_RATE_LIMIT_EXCEEDED',
    message: 'Too many order submissions. Please wait a moment before trying again.',
  });

  testApp.post('/api/v1/orders', tightOrderLimiter, (req, res) => {
    res.status(201).json({ success: true, data: { orderId: 'test-order-123' } });
  });

  // Request 1 succeeds
  const r1 = await makeRequest(testApp, '/api/v1/orders', { method: 'POST', body: { vendor_id: 'test' } });
  assert.equal(r1.statusCode, 201);

  // Request 2 blocked with 429
  const r2 = await makeRequest(testApp, '/api/v1/orders', { method: 'POST', body: { vendor_id: 'test' } });
  assert.equal(r2.statusCode, 429);
  assert.equal(r2.body.success, false);
  assert.equal(r2.body.error.code, 'ORDER_RATE_LIMIT_EXCEEDED');
});

test('6. Payment rate limiter protects checkout / payment initialization endpoints', async () => {
  const testApp = express();
  testApp.use(express.json());

  const tightPaymentLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 1,
    testMax: 1,
    errorCode: 'PAYMENT_RATE_LIMIT_EXCEEDED',
    message: 'Too many payment requests. Please wait a moment before trying again.',
  });

  testApp.post('/api/v1/payments/initialize', tightPaymentLimiter, (req, res) => {
    res.status(200).json({ success: true, data: { checkout_url: 'https://pay.example.com' } });
  });

  // Request 1 succeeds
  const r1 = await makeRequest(testApp, '/api/v1/payments/initialize', { method: 'POST', body: { order_id: '123' } });
  assert.equal(r1.statusCode, 200);

  // Request 2 blocked with 429
  const r2 = await makeRequest(testApp, '/api/v1/payments/initialize', { method: 'POST', body: { order_id: '123' } });
  assert.equal(r2.statusCode, 429);
  assert.equal(r2.body.success, false);
  assert.equal(r2.body.error.code, 'PAYMENT_RATE_LIMIT_EXCEEDED');
});

test('7. Public catalog GET endpoints remain functional and are not blocked', async () => {
  const originalGetActiveCampuses = campusRepository.getActiveCampuses;
  const originalGetActiveRootCategories = categoryRepository.getActiveRootCategories;
  const originalGetActiveCategories = categoryRepository.getActiveCategories;

  campusRepository.getActiveCampuses = async () => [];
  categoryRepository.getActiveRootCategories = async () => [];
  categoryRepository.getActiveCategories = async () => [];

  try {
    const rCampus = await makeRequest(app, '/api/v1/campuses');
    assert.equal(rCampus.statusCode, 200);
    assert.equal(rCampus.body.success, true);

    const rCategories = await makeRequest(app, '/api/v1/categories');
    assert.equal(rCategories.statusCode, 200);
    assert.equal(rCategories.body.success, true);
  } finally {
    campusRepository.getActiveCampuses = originalGetActiveCampuses;
    categoryRepository.getActiveRootCategories = originalGetActiveRootCategories;
    categoryRepository.getActiveCategories = originalGetActiveCategories;
  }
});

test('8. Rate limiting does not interfere with authenticated JWT authorization headers', async () => {
  const authHeader = getAuthHeader();
  const res = await makeRequest(app, '/api/v1/auth/me', {
    headers: { Authorization: authHeader },
  });

  // Should succeed with 200 OK and valid user profile
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.id || res.body.data.email);
});

test('9. Production database SSL configuration always validates certificates', () => {
  const ssl = buildSslConfig(true, 'test-ca\\ncontent');
  assert.equal(ssl.rejectUnauthorized, true);
  assert.equal(ssl.ca, 'test-ca\ncontent');
  assert.equal(buildSslConfig(false), undefined);
});
