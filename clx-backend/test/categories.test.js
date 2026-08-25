const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const categoryRepository = require('../src/repositories/categoryRepository');

const root = {
  id: '00000000-0000-4000-8000-000000000001',
  legacy_key: 'food',
  parent_id: null,
  slug: 'food',
  name: 'Food',
  sort_order: 1,
  is_active: true,
};

const child = {
  id: '00000000-0000-4000-8000-000000000002',
  legacy_key: 'food-snacks',
  parent_id: root.id,
  slug: 'food-snacks',
  name: 'Snacks',
  sort_order: 2,
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

const withRepositoryStub = async (stub, callback) => {
  const originals = {
    getActiveRootCategories: categoryRepository.getActiveRootCategories,
    getActiveCategories: categoryRepository.getActiveCategories,
    getCategoryByIdentifier: categoryRepository.getCategoryByIdentifier,
  };

  Object.assign(categoryRepository, stub);
  try {
    return await callback();
  } finally {
    Object.assign(categoryRepository, originals);
  }
};

test('GET /api/v1/categories returns active roots with nested subcategories', async () => {
  const result = await withRepositoryStub({
    getActiveRootCategories: async () => [root],
    getActiveCategories: async () => [root, child],
  }, () => request('/api/v1/categories'));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, [{ ...root, subcategories: [child] }]);
});

test('category hierarchy preserves root and child ordering', async () => {
  const secondRoot = { ...root, id: '00000000-0000-4000-8000-000000000003', slug: 'shopping', sort_order: 2 };
  const secondChild = { ...child, id: '00000000-0000-4000-8000-000000000004', parent_id: secondRoot.id, slug: 'shopping-books', sort_order: 1 };
  const result = await withRepositoryStub({
    getActiveRootCategories: async () => [root, secondRoot],
    getActiveCategories: async () => [root, child, secondRoot, secondChild],
  }, () => request('/api/v1/categories'));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data.map((category) => category.slug), ['food', 'shopping']);
  assert.deepEqual(result.body.data[0].subcategories.map((category) => category.slug), ['food-snacks']);
  assert.deepEqual(result.body.data[1].subcategories.map((category) => category.slug), ['shopping-books']);
});

test('category list returns an empty array when no active categories exist', async () => {
  const result = await withRepositoryStub({
    getActiveRootCategories: async () => [],
    getActiveCategories: async () => [],
  }, () => request('/api/v1/categories'));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, []);
});

test('category lookup supports UUID, slug, and legacy key', async () => {
  for (const identifier of [root.id, root.slug, root.legacy_key]) {
    const result = await withRepositoryStub({
      getCategoryByIdentifier: async (value) => {
        assert.equal(value, identifier);
        return root;
      },
    }, () => request(`/api/v1/categories/${identifier}`));

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body.data, root);
  }
});

test('missing category returns CATEGORY_NOT_FOUND', async () => {
  const result = await withRepositoryStub({
    getCategoryByIdentifier: async () => null,
  }, () => request('/api/v1/categories/missing'));

  assert.equal(result.statusCode, 404);
  assert.deepEqual(result.body.error, {
    code: 'CATEGORY_NOT_FOUND',
    message: 'The requested category was not found',
  });
});

test('inactive category returns CATEGORY_NOT_FOUND', async () => {
  const result = await withRepositoryStub({
    getCategoryByIdentifier: async () => null,
  }, () => request('/api/v1/categories/inactive'));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error.code, 'CATEGORY_NOT_FOUND');
});

test('repository failure returns a safe 500 response', async () => {
  const result = await withRepositoryStub({
    getActiveRootCategories: async () => { throw new Error('database failure'); },
    getActiveCategories: async () => [],
  }, () => request('/api/v1/categories'));

  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.body.error, {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
});
