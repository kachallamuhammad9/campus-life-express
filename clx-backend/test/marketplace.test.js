const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const marketplaceRepository = require('../src/repositories/marketplaceRepository');
const { getAuthHeader } = require('./helpers/authHelper');

const mockListing = {
  id: '00000000-0000-4000-8000-000000000601',
  legacy_key: 'used-calculus-textbook-stewart',
  slug: 'used-calculus-textbook-stewart',
  seller_user_id: '00000000-0000-4000-8000-000000000088',
  campus_id: '00000000-0000-4000-8000-000000000001',
  category_id: '00000000-0000-4000-8000-000000000005',
  subcategory_id: null,
  title: 'Stewart Calculus 8th Edition',
  description: 'Clean textbook, few pencil highlights in Chapter 3',
  price_kobo: 350000,
  original_price_kobo: 600000,
  condition: 'GOOD',
  status: 'PUBLISHED',
  seller_department: 'Mathematics & Statistics',
  seller_contact_phone: '+2348012345678',
  date_listed: '2026-01-10T10:00:00.000Z',
  date_sold: null,
  created_at: '2026-01-10T10:00:00.000Z',
  updated_at: '2026-01-10T10:00:00.000Z',
  deleted_at: null,
  campus_name: 'University of Maiduguri',
  campus_slug: 'unimaid',
  campus_is_active: true,
  category_name: 'Used Textbooks',
  category_slug: 'marketplace-used-textbooks',
  seller_name: 'Fatima Ali',
  seller_avatar_url: 'https://example.com/avatars/fatima.jpg',
  primary_image_url: 'https://example.com/marketplace/calculus_cover.jpg',
};

const mockImages = [
  {
    id: '00000000-0000-4000-8000-000000000701',
    listing_id: mockListing.id,
    image_url: 'https://example.com/marketplace/calculus_cover.jpg',
    alt_text: 'Front Cover',
    sort_order: 0,
    is_primary: true,
    created_at: '2026-01-10T10:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000702',
    listing_id: mockListing.id,
    image_url: 'https://example.com/marketplace/calculus_inside.jpg',
    alt_text: 'Sample Page',
    sort_order: 1,
    is_primary: false,
    created_at: '2026-01-10T10:00:00.000Z',
  },
];

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

const withRepositoryStub = async (stub, callback) => {
  const originals = {
    listListings: marketplaceRepository.listListings,
    getListingByIdentifier: marketplaceRepository.getListingByIdentifier,
    getListingImages: marketplaceRepository.getListingImages,
    createListing: marketplaceRepository.createListing,
    createListingImages: marketplaceRepository.createListingImages,
    updateListing: marketplaceRepository.updateListing,
    softDeleteListing: marketplaceRepository.softDeleteListing,
  };

  Object.assign(marketplaceRepository, stub);
  try {
    return await callback();
  } finally {
    Object.assign(marketplaceRepository, originals);
  }
};

test('1. GET /api/v1/marketplace returns public listings', async () => {
  const result = await withRepositoryStub({
    listListings: async () => [mockListing],
  }, () => request('/api/v1/marketplace'));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.data, [mockListing]);
});

test('2. Campus filtering passes campusId to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listListings: async (options) => {
      capturedOptions = options;
      return [mockListing];
    },
  }, () => request('/api/v1/marketplace?campusId=unimaid'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.campusId, 'unimaid');
});

test('3. Category filtering passes categoryId to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listListings: async (options) => {
      capturedOptions = options;
      return [mockListing];
    },
  }, () => request('/api/v1/marketplace?categoryId=marketplace-used-textbooks'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.categoryId, 'marketplace-used-textbooks');
});

test('4. Search filtering passes search string to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listListings: async (options) => {
      capturedOptions = options;
      return [mockListing];
    },
  }, () => request('/api/v1/marketplace?search=calculus'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.search, 'calculus');
});

test('5. Minimum price filtering passes minPrice to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listListings: async (options) => {
      capturedOptions = options;
      return [mockListing];
    },
  }, () => request('/api/v1/marketplace?minPrice=200000'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.minPrice, 200000);
});

test('6. Maximum price filtering passes maxPrice to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listListings: async (options) => {
      capturedOptions = options;
      return [mockListing];
    },
  }, () => request('/api/v1/marketplace?maxPrice=500000'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.maxPrice, 500000);
});

test('7. Condition filtering validates and passes condition to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listListings: async (options) => {
      capturedOptions = options;
      return [mockListing];
    },
  }, () => request('/api/v1/marketplace?condition=GOOD'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.condition, 'GOOD');
});

test('8. Pagination parameters limit and offset are respected', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listListings: async (options) => {
      capturedOptions = options;
      return [mockListing];
    },
  }, () => request('/api/v1/marketplace?limit=15&offset=30'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.limit, 15);
  assert.equal(capturedOptions.offset, 30);
});

test('9. Invalid pagination normalization applies safe defaults', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listListings: async (options) => {
      capturedOptions = options;
      return [];
    },
  }, () => request('/api/v1/marketplace?limit=-10&offset=invalid'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.limit, 20);
  assert.equal(capturedOptions.offset, 0);
});

test('10. Listing lookup by UUID returns single listing with images', async () => {
  const result = await withRepositoryStub({
    getListingByIdentifier: async (id) => {
      assert.equal(id, mockListing.id);
      return mockListing;
    },
    getListingImages: async () => mockImages,
  }, () => request(`/api/v1/marketplace/${mockListing.id}`));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.id, mockListing.id);
  assert.equal(result.body.data.images.length, 2);
});

test('11. Listing lookup by slug retrieves listing', async () => {
  const result = await withRepositoryStub({
    getListingByIdentifier: async (slug) => {
      assert.equal(slug, 'used-calculus-textbook-stewart');
      return mockListing;
    },
    getListingImages: async () => mockImages,
  }, () => request('/api/v1/marketplace/used-calculus-textbook-stewart'));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.slug, 'used-calculus-textbook-stewart');
});

test('12. Listing lookup by legacy key retrieves listing', async () => {
  const result = await withRepositoryStub({
    getListingByIdentifier: async (key) => {
      assert.equal(key, 'used-calculus-textbook-stewart');
      return mockListing;
    },
    getListingImages: async () => [],
  }, () => request('/api/v1/marketplace/used-calculus-textbook-stewart'));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.legacy_key, 'used-calculus-textbook-stewart');
});

test('13. Missing listing returns 404 MARKETPLACE_LISTING_NOT_FOUND', async () => {
  const result = await withRepositoryStub({
    getListingByIdentifier: async () => null,
  }, () => request('/api/v1/marketplace/non-existent-listing'));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'MARKETPLACE_LISTING_NOT_FOUND');
});

test('14. Hidden or unapproved listing returns 404 for public GET', async () => {
  const hiddenListing = {
    ...mockListing,
    status: 'PENDING_REVIEW',
  };

  const result = await withRepositoryStub({
    getListingByIdentifier: async () => hiddenListing,
  }, () => request(`/api/v1/marketplace/${hiddenListing.id}`));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error.code, 'MARKETPLACE_LISTING_NOT_FOUND');
});

test('15. Listing images retrieval attaches image records with order and primary flag', async () => {
  const result = await withRepositoryStub({
    getListingByIdentifier: async () => mockListing,
    getListingImages: async () => mockImages,
  }, () => request(`/api/v1/marketplace/${mockListing.id}`));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.images[0].is_primary, true);
  assert.equal(result.body.data.images[1].alt_text, 'Sample Page');
});

test('16. Public seller information exposes safe fields and omits sensitive profile data', async () => {
  const result = await withRepositoryStub({
    getListingByIdentifier: async () => mockListing,
    getListingImages: async () => [],
  }, () => request(`/api/v1/marketplace/${mockListing.id}`));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.seller_name, 'Fatima Ali');
  assert.equal(result.body.data.seller_avatar_url, 'https://example.com/avatars/fatima.jpg');
  assert.equal(result.body.data.password, undefined);
  assert.equal(result.body.data.student_id, undefined);
});

test('17. Empty listing result returns 200 with empty array', async () => {
  const result = await withRepositoryStub({
    listListings: async () => [],
  }, () => request('/api/v1/marketplace'));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, []);
});

test('18. Repository failure returns safe 500 error envelope', async () => {
  const result = await withRepositoryStub({
    listListings: async () => { throw new Error('database connection loss'); },
  }, () => request('/api/v1/marketplace'));

  assert.equal(result.statusCode, 500);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'INTERNAL_SERVER_ERROR');
});

test('19. Create listing validation rejects missing required fields', async () => {
  const resMissingTitle = await request('/api/v1/marketplace', {
    method: 'POST',
    headers: { Authorization: getAuthHeader() },
    body: {
      campusId: '00000000-0000-4000-8000-000000000001',
      categoryId: '00000000-0000-4000-8000-000000000005',
      priceKobo: 50000,
      condition: 'GOOD',
    },
  });

  assert.equal(resMissingTitle.statusCode, 400);
  assert.equal(resMissingTitle.body.error.code, 'VALIDATION_ERROR');

  const resInvalidCondition = await request('/api/v1/marketplace', {
    method: 'POST',
    headers: { Authorization: getAuthHeader() },
    body: {
      title: 'Valid Title Here',
      campusId: '00000000-0000-4000-8000-000000000001',
      categoryId: '00000000-0000-4000-8000-000000000005',
      priceKobo: 50000,
      condition: 'BRAND_SPANKING_NEW',
    },
  });

  assert.equal(resInvalidCondition.statusCode, 400);
  assert.equal(resInvalidCondition.body.error.code, 'VALIDATION_ERROR');
});

test('20. Protected owner identity handling prevents unauthenticated listing creation', async () => {
  const result = await request('/api/v1/marketplace', {
    method: 'POST',
    body: {
      title: 'Hostel Mattress',
      campusId: '00000000-0000-4000-8000-000000000001',
      categoryId: '00000000-0000-4000-8000-000000000005',
      priceKobo: 120000,
      condition: 'GOOD',
    },
  });

  assert.equal(result.statusCode, 401);
  assert.equal(result.body.error.code, 'UNAUTHORIZED');
});

test('21. Protected status handling forces PENDING_REVIEW on creation', async () => {
  let capturedInsert;
  const result = await withRepositoryStub({
    createListing: async (params) => {
      capturedInsert = params;
      return {
        ...mockListing,
        ...params,
        status: 'PENDING_REVIEW',
      };
    },
    createListingImages: async () => [],
  }, () => request('/api/v1/marketplace', {
    method: 'POST',
    headers: { Authorization: getAuthHeader({ sub: '00000000-0000-4000-8000-000000000088' }) },
    body: {
      title: 'Organic Chemistry Model Kit',
      campusId: '00000000-0000-4000-8000-000000000001',
      categoryId: '00000000-0000-4000-8000-000000000005',
      priceKobo: 80000,
      condition: 'LIKE_NEW',
      status: 'PUBLISHED', // Attempt to bypass review
    },
  }));

  assert.equal(result.statusCode, 201);
  assert.equal(capturedInsert.status, 'PENDING_REVIEW');
  assert.equal(result.body.data.status, 'PENDING_REVIEW');
});

test('22. Update listing ownership behavior allows owner to modify allowed fields', async () => {
  let capturedUpdate;
  const result = await withRepositoryStub({
    getListingByIdentifier: async () => mockListing,
    updateListing: async (id, fields) => {
      capturedUpdate = fields;
      return {
        ...mockListing,
        ...fields,
      };
    },
    getListingImages: async () => mockImages,
  }, () => request(`/api/v1/marketplace/${mockListing.id}`, {
    method: 'PATCH',
    headers: { Authorization: getAuthHeader({ sub: mockListing.seller_user_id }) },
    body: {
      priceKobo: 300000,
      description: 'Price reduced for quick hostel sale',
      status: 'SOLD',
    },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedUpdate.price_kobo, 300000);
  assert.equal(capturedUpdate.status, 'SOLD');
  assert.ok(capturedUpdate.date_sold);
});

test('23. Unauthorized update does not bypass ownership', async () => {
  const result = await withRepositoryStub({
    getListingByIdentifier: async () => mockListing,
  }, () => request(`/api/v1/marketplace/${mockListing.id}`, {
    method: 'PATCH',
    headers: { Authorization: getAuthHeader({ sub: '00000000-0000-4000-8000-000000000999' }) }, // Different user
    body: {
      priceKobo: 1000,
    },
  }));

  assert.equal(result.statusCode, 403);
  assert.equal(result.body.error.code, 'FORBIDDEN');
});

test('24. Delete/deactivate behavior soft-deletes listing for owner', async () => {
  let deletedId;
  const result = await withRepositoryStub({
    getListingByIdentifier: async () => mockListing,
    softDeleteListing: async (id) => {
      deletedId = id;
      return { id, status: 'REMOVED', deleted_at: new Date().toISOString() };
    },
  }, () => request(`/api/v1/marketplace/${mockListing.id}`, {
    method: 'DELETE',
    headers: { Authorization: getAuthHeader({ sub: mockListing.seller_user_id }) },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(deletedId, mockListing.id);
});

test('25. Unauthorized delete does not bypass ownership', async () => {
  const result = await withRepositoryStub({
    getListingByIdentifier: async () => mockListing,
  }, () => request(`/api/v1/marketplace/${mockListing.id}`, {
    method: 'DELETE',
    headers: { Authorization: getAuthHeader({ sub: '00000000-0000-4000-8000-000000000999' }) },
  }));

  assert.equal(result.statusCode, 403);
  assert.equal(result.body.error.code, 'FORBIDDEN');
});

test('26. Invalid price handling rejects negative price or invalid original price', async () => {
  const resNegativePrice = await request('/api/v1/marketplace', {
    method: 'POST',
    headers: { Authorization: getAuthHeader() },
    body: {
      title: 'Hostel Fan',
      campusId: '00000000-0000-4000-8000-000000000001',
      categoryId: '00000000-0000-4000-8000-000000000005',
      priceKobo: -500,
      condition: 'GOOD',
    },
  });

  assert.equal(resNegativePrice.statusCode, 400);
  assert.equal(resNegativePrice.body.error.code, 'VALIDATION_ERROR');

  const resOriginalLowerThanPrice = await request('/api/v1/marketplace', {
    method: 'POST',
    headers: { Authorization: getAuthHeader() },
    body: {
      title: 'Hostel Fan',
      campusId: '00000000-0000-4000-8000-000000000001',
      categoryId: '00000000-0000-4000-8000-000000000005',
      priceKobo: 50000,
      originalPriceKobo: 30000, // Invalid: original must be >= price
      condition: 'GOOD',
    },
  });

  assert.equal(resOriginalLowerThanPrice.statusCode, 400);
  assert.equal(resOriginalLowerThanPrice.body.error.code, 'VALIDATION_ERROR');
});

test('27. Missing campusId or categoryId in listing creation is rejected', async () => {
  const result = await request('/api/v1/marketplace', {
    method: 'POST',
    headers: { Authorization: getAuthHeader() },
    body: {
      title: 'Scientific Calculator',
      priceKobo: 15000,
      condition: 'LIKE_NEW',
    },
  });

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.error.code, 'VALIDATION_ERROR');
});

test('28. No sensitive seller information is exposed in listing endpoints', async () => {
  const result = await withRepositoryStub({
    getListingByIdentifier: async () => ({
      ...mockListing,
      password_hash: 'secret_hash',
      email: 'student@example.com',
      student_id: 'UNIMAID/2021/1234',
    }),
    getListingImages: async () => [],
  }, () => request(`/api/v1/marketplace/${mockListing.id}`));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.password_hash, undefined);
  assert.equal(result.body.data.student_id, undefined);
});
