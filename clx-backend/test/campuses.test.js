const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const database = require('../src/config/database');

const campus = {
  id: '00000000-0000-4000-8000-000000000001',
  legacy_key: 'unimaid',
  slug: 'unimaid',
  name: 'University of Maiduguri',
  short_name: 'UNIMAID',
  is_active: true,
};

const zone = {
  id: '00000000-0000-4000-8000-000000000002',
  campus_id: campus.id,
  name: 'Hostel A-D',
  is_active: true,
};

const request = (path) => new Promise((resolve, reject) => {
  const server = app.listen(0, () => {
    const { port } = server.address();
    const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        server.close(() => resolve({
          statusCode: res.statusCode,
          body: JSON.parse(body),
        }));
      });
    });
    req.on('error', (error) => server.close(() => reject(error)));
  });
  server.on('error', reject);
});

const withDatabaseStub = async (stub, callback) => {
  const originalQuery = database.query;
  database.query = stub;
  try {
    return await callback();
  } finally {
    database.query = originalQuery;
  }
};

test('GET /api/v1/campuses returns active campuses', async () => {
  const result = await withDatabaseStub(
    async () => ({ rows: [campus] }),
    () => request('/api/v1/campuses')
  );

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, [campus]);
});

test('GET /api/v1/campuses/:campusId supports UUID, slug, and legacy key', async () => {
  for (const identifier of [campus.id, campus.slug, campus.legacy_key]) {
    const result = await withDatabaseStub(
      async (query, params) => {
        assert.match(query, /id::text = \$1 OR slug = \$1 OR legacy_key = \$1/);
        assert.deepEqual(params, [identifier]);
        return { rows: [campus] };
      },
      () => request(`/api/v1/campuses/${identifier}`)
    );

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body.data, campus);
  }
});

test('GET /api/v1/campuses/:campusId returns CAMPUS_NOT_FOUND', async () => {
  const result = await withDatabaseStub(
    async () => ({ rows: [] }),
    () => request('/api/v1/campuses/unknown-campus')
  );

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error.code, 'CAMPUS_NOT_FOUND');
});

test('GET /api/v1/campuses/:campusId/delivery-zones returns active zones', async () => {
  const result = await withDatabaseStub(
    async (query) => query.includes('FROM public.campuses')
      ? { rows: [campus] }
      : { rows: [zone] },
    () => request('/api/v1/campuses/unimaid/delivery-zones')
  );

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, [zone]);
});

test('delivery zones return CAMPUS_NOT_FOUND for an unknown campus', async () => {
  const result = await withDatabaseStub(
    async () => ({ rows: [] }),
    () => request('/api/v1/campuses/missing/delivery-zones')
  );

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error.code, 'CAMPUS_NOT_FOUND');
});

test('delivery zones return an empty array for a valid campus with no zones', async () => {
  const result = await withDatabaseStub(
    async (query) => query.includes('FROM public.campuses')
      ? { rows: [campus] }
      : { rows: [] },
    () => request('/api/v1/campuses/unimaid/delivery-zones')
  );

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, []);
});

test('repository errors reach the application error pipeline', async () => {
  const result = await withDatabaseStub(
    async () => { throw new Error('database failure'); },
    () => request('/api/v1/campuses')
  );

  assert.equal(result.statusCode, 500);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'INTERNAL_SERVER_ERROR');
  assert.equal(result.body.error.message, 'An unexpected error occurred');
});
