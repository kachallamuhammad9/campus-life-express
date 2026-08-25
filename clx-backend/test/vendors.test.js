const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const vendorRepository = require('../src/repositories/vendorRepository');
const vendorService = require('../src/services/vendorService');

const mockVendor = {
  id: '00000000-0000-4000-8000-000000000010',
  legacy_key: 'mama-put-unimaid',
  owner_user_id: '00000000-0000-4000-8000-000000000099',
  name: 'Mama Put Special',
  slug: 'mama-put-special',
  category_id: '00000000-0000-4000-8000-000000000001',
  location: 'Commercial Center, UNIMAID',
  phone_number: '+2348012345678',
  email: 'mamaput@example.com',
  description: 'Authentic campus meals and delicacies',
  image_url: 'https://example.com/vendors/mama-put.jpg',
  status: 'ACTIVE',
  is_verified: true,
  rating: 4.8,
  review_count: 24,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const mockCampus = {
  vendor_id: mockVendor.id,
  campus_id: '00000000-0000-4000-8000-000000000001',
  location: 'Commercial Center',
  is_active: true,
  campus_name: 'University of Maiduguri',
  campus_slug: 'unimaid',
  campus_short_name: 'UNIMAID',
};

const mockOperatingHours = [
  {
    id: '00000000-0000-4000-8000-000000000100',
    vendor_id: mockVendor.id,
    campus_id: mockCampus.campus_id,
    day_of_week: 1, // Monday
    opens_at: '08:00:00',
    closes_at: '20:00:00',
    is_closed: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000101',
    vendor_id: mockVendor.id,
    campus_id: mockCampus.campus_id,
    day_of_week: 0, // Sunday
    opens_at: null,
    closes_at: null,
    is_closed: true,
  },
];

const mockProduct = {
  id: '00000000-0000-4000-8000-000000000200',
  legacy_key: 'jollof-rice-chicken',
  slug: 'jollof-rice-with-chicken',
  vendor_id: mockVendor.id,
  campus_id: mockCampus.campus_id,
  category_id: mockVendor.category_id,
  subcategory_id: null,
  name: 'Jollof Rice with Fried Chicken',
  description: 'Smoky jollof rice served with seasoned chicken',
  price_kobo: 180000,
  original_price_kobo: 200000,
  image_url: 'https://example.com/products/jollof.jpg',
  rating: 4.9,
  review_count: 15,
  is_popular: true,
  is_in_stock: true,
  stock_quantity: 50,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const mockReview = {
  id: '00000000-0000-4000-8000-000000000300',
  vendor_id: mockVendor.id,
  reviewer_user_id: '00000000-0000-4000-8000-000000000098',
  order_id: '00000000-0000-4000-8000-000000000400',
  rating: 5,
  comment: 'Amazing food and fast delivery!',
  reviewer_name: 'Fatima Ahmed',
  reviewer_avatar_url: 'https://example.com/avatars/fatima.jpg',
  created_at: '2026-01-02T10:00:00.000Z',
  updated_at: '2026-01-02T10:00:00.000Z',
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
    listVendors: vendorRepository.listVendors,
    getVendorByIdentifier: vendorRepository.getVendorByIdentifier,
    getVendorCampuses: vendorRepository.getVendorCampuses,
    getVendorOperatingHours: vendorRepository.getVendorOperatingHours,
    getVendorProducts: vendorRepository.getVendorProducts,
    getVendorReviews: vendorRepository.getVendorReviews,
  };

  Object.assign(vendorRepository, stub);
  try {
    return await callback();
  } finally {
    Object.assign(vendorRepository, originals);
  }
};

test('1. GET /api/v1/vendors returns list of active vendors', async () => {
  const result = await withRepositoryStub({
    listVendors: async () => [mockVendor],
  }, () => request('/api/v1/vendors'));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.data, [mockVendor]);
});

test('2. GET /api/v1/vendors passes campusId filter to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listVendors: async (options) => {
      capturedOptions = options;
      return [mockVendor];
    },
  }, () => request('/api/v1/vendors?campusId=unimaid'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.campusId, 'unimaid');
  assert.deepEqual(result.body.data, [mockVendor]);
});

test('3. GET /api/v1/vendors passes categoryId filter to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listVendors: async (options) => {
      capturedOptions = options;
      return [mockVendor];
    },
  }, () => request('/api/v1/vendors?categoryId=food'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.categoryId, 'food');
  assert.deepEqual(result.body.data, [mockVendor]);
});

test('4. GET /api/v1/vendors passes search query to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listVendors: async (options) => {
      capturedOptions = options;
      return [mockVendor];
    },
  }, () => request('/api/v1/vendors?search=Mama'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.search, 'Mama');
  assert.deepEqual(result.body.data, [mockVendor]);
});

test('5. GET /api/v1/vendors respects pagination limit and offset', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listVendors: async (options) => {
      capturedOptions = options;
      return [mockVendor];
    },
  }, () => request('/api/v1/vendors?limit=10&offset=20'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.limit, 10);
  assert.equal(capturedOptions.offset, 20);
});

test('6. GET /api/v1/vendors/:vendorId supports lookup by UUID', async () => {
  const result = await withRepositoryStub({
    getVendorByIdentifier: async (id) => {
      assert.equal(id, mockVendor.id);
      return mockVendor;
    },
    getVendorCampuses: async () => [mockCampus],
    getVendorOperatingHours: async () => mockOperatingHours,
  }, () => request(`/api/v1/vendors/${mockVendor.id}`));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.id, mockVendor.id);
  assert.deepEqual(result.body.data.campuses, [mockCampus]);
  assert.deepEqual(result.body.data.operating_hours, mockOperatingHours);
});

test('7. GET /api/v1/vendors/:vendorId supports lookup by slug', async () => {
  const result = await withRepositoryStub({
    getVendorByIdentifier: async (slug) => {
      assert.equal(slug, mockVendor.slug);
      return mockVendor;
    },
    getVendorCampuses: async () => [mockCampus],
    getVendorOperatingHours: async () => mockOperatingHours,
  }, () => request(`/api/v1/vendors/${mockVendor.slug}`));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.slug, mockVendor.slug);
});

test('8. GET /api/v1/vendors/:vendorId returns 404 for missing vendor', async () => {
  const result = await withRepositoryStub({
    getVendorByIdentifier: async () => null,
  }, () => request('/api/v1/vendors/non-existent-vendor'));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'VENDOR_NOT_FOUND');
});

test('9. GET /api/v1/vendors/:vendorId returns 404 for inactive vendor', async () => {
  const result = await withRepositoryStub({
    getVendorByIdentifier: async () => null,
  }, () => request('/api/v1/vendors/inactive-vendor'));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error.code, 'VENDOR_NOT_FOUND');
});

test('10. GET /api/v1/vendors/:vendorId/products returns products list', async () => {
  const result = await withRepositoryStub({
    getVendorByIdentifier: async () => mockVendor,
    getVendorProducts: async (vendorId, pagination) => {
      assert.equal(vendorId, mockVendor.id);
      assert.equal(pagination.limit, 50);
      assert.equal(pagination.offset, 0);
      return [mockProduct];
    },
  }, () => request(`/api/v1/vendors/${mockVendor.id}/products`));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.data, [mockProduct]);
});

test('11. GET /api/v1/vendors/:vendorId/reviews returns reviews list', async () => {
  const result = await withRepositoryStub({
    getVendorByIdentifier: async () => mockVendor,
    getVendorReviews: async (vendorId, pagination) => {
      assert.equal(vendorId, mockVendor.id);
      assert.equal(pagination.limit, 50);
      assert.equal(pagination.offset, 0);
      return [mockReview];
    },
  }, () => request(`/api/v1/vendors/${mockVendor.id}/reviews`));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.data, [mockReview]);
});

test('12. GET /api/v1/vendors/:vendorId/products returns 404 when vendor does not exist', async () => {
  const result = await withRepositoryStub({
    getVendorByIdentifier: async () => null,
  }, () => request('/api/v1/vendors/missing-vendor/products'));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error.code, 'VENDOR_NOT_FOUND');
});

test('13. GET /api/v1/vendors/:vendorId/reviews returns 404 when vendor does not exist', async () => {
  const result = await withRepositoryStub({
    getVendorByIdentifier: async () => null,
  }, () => request('/api/v1/vendors/missing-vendor/reviews'));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error.code, 'VENDOR_NOT_FOUND');
});

test('14. GET /api/v1/vendors returns empty array when no vendors match', async () => {
  const result = await withRepositoryStub({
    listVendors: async () => [],
  }, () => request('/api/v1/vendors'));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, []);
});

test('15. Repository failure returns safe 500 internal server error', async () => {
  const result = await withRepositoryStub({
    listVendors: async () => { throw new Error('database connection dropped'); },
  }, () => request('/api/v1/vendors'));

  assert.equal(result.statusCode, 500);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'INTERNAL_SERVER_ERROR');
  assert.equal(result.body.error.message, 'An unexpected error occurred');
});

test('16. Invalid pagination parameters are safely normalized', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listVendors: async (options) => {
      capturedOptions = options;
      return [];
    },
  }, () => request('/api/v1/vendors?limit=-5&offset=invalid'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.limit, 20); // Normalized to default
  assert.equal(capturedOptions.offset, 0);  // Normalized to 0
});

test('17. Rating calculation safely calculates average and handles zero reviews', () => {
  assert.equal(vendorService.calculateAverageRating([]), 0);
  assert.equal(vendorService.calculateAverageRating(null), 0);
  assert.equal(vendorService.calculateAverageRating([{ rating: 5 }, { rating: 4 }]), 4.5);
  assert.equal(vendorService.calculateAverageRating([{ rating: 5 }, { rating: 5 }, { rating: 4 }]), 4.7);
});

test('18. Operating status calculation handles daytime, closed, and overnight windows', () => {
  // Monday 12:00 PM (inside 08:00 - 20:00)
  const mondayNoon = new Date('2026-08-24T12:00:00'); // Monday (getDay() === 1)
  const statusOpen = vendorService.calculateOperatingStatus(mockOperatingHours, mondayNoon);
  assert.equal(statusOpen.is_open, true);

  // Monday 22:00 PM (after 20:00 close)
  const mondayNight = new Date('2026-08-24T22:00:00');
  const statusClosedNight = vendorService.calculateOperatingStatus(mockOperatingHours, mondayNight);
  assert.equal(statusClosedNight.is_open, false);

  // Sunday (closed day)
  const sundayNoon = new Date('2026-08-23T12:00:00'); // Sunday (getDay() === 0)
  const statusSunday = vendorService.calculateOperatingStatus(mockOperatingHours, sundayNoon);
  assert.equal(statusSunday.is_open, false);

  // Overnight hours test (e.g. 20:00 to 04:00)
  const overnightHours = [{
    day_of_week: 1,
    opens_at: '20:00:00',
    closes_at: '04:00:00',
    is_closed: false,
  }];
  const mondayOvernightLate = new Date('2026-08-24T23:30:00');
  assert.equal(vendorService.calculateOperatingStatus(overnightHours, mondayOvernightLate).is_open, true);
  const mondayOvernightEarly = new Date('2026-08-24T02:30:00');
  assert.equal(vendorService.calculateOperatingStatus(overnightHours, mondayOvernightEarly).is_open, true);
  const mondayMidday = new Date('2026-08-24T14:00:00');
  assert.equal(vendorService.calculateOperatingStatus(overnightHours, mondayMidday).is_open, false);
});
