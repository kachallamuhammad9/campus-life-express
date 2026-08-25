const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const productRepository = require('../src/repositories/productRepository');
const productService = require('../src/services/productService');

const mockProduct = {
  id: '00000000-0000-4000-8000-000000000201',
  legacy_key: 'suya-platter-large',
  slug: 'suya-platter-large',
  vendor_id: '00000000-0000-4000-8000-000000000010',
  campus_id: '00000000-0000-4000-8000-000000000001',
  category_id: '00000000-0000-4000-8000-000000000002',
  subcategory_id: null,
  name: 'Spicy Beef Suya Platter',
  description: 'Charcoal grilled spicy beef suya with fresh onions and peppers',
  price_kobo: 250000,
  original_price_kobo: 300000,
  image_url: 'https://example.com/products/suya.jpg',
  rating: 4.9,
  review_count: 32,
  is_popular: true,
  is_in_stock: true,
  stock_quantity: 40,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  vendor_name: 'Mama Put Special',
  vendor_slug: 'mama-put-special',
  campus_name: 'University of Maiduguri',
  campus_slug: 'unimaid',
  category_name: 'Food & Meals',
  category_slug: 'food-meals',
};

const mockProductImage = {
  id: '00000000-0000-4000-8000-000000000250',
  product_id: mockProduct.id,
  image_url: 'https://example.com/products/suya-detail.jpg',
  alt_text: 'Close up of freshly spiced suya',
  sort_order: 0,
  is_primary: true,
  created_at: '2026-01-01T00:00:00.000Z',
};

const mockProductReview = {
  id: '00000000-0000-4000-8000-000000000350',
  product_id: mockProduct.id,
  reviewer_user_id: '00000000-0000-4000-8000-000000000098',
  order_id: '00000000-0000-4000-8000-000000000450',
  rating: 5,
  comment: 'Best suya on campus! Perfectly seasoned.',
  reviewer_name: 'Ibrahim Musa',
  reviewer_avatar_url: 'https://example.com/avatars/ibrahim.jpg',
  created_at: '2026-01-02T12:00:00.000Z',
  updated_at: '2026-01-02T12:00:00.000Z',
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
    listProducts: productRepository.listProducts,
    getProductByIdentifier: productRepository.getProductByIdentifier,
    getProductImages: productRepository.getProductImages,
    getProductReviews: productRepository.getProductReviews,
  };

  Object.assign(productRepository, stub);
  try {
    return await callback();
  } finally {
    Object.assign(productRepository, originals);
  }
};

test('1. GET /api/v1/products returns list of public products', async () => {
  const result = await withRepositoryStub({
    listProducts: async () => [mockProduct],
  }, () => request('/api/v1/products'));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.data, [mockProduct]);
});

test('2. GET /api/v1/products passes campusId filter to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listProducts: async (options) => {
      capturedOptions = options;
      return [mockProduct];
    },
  }, () => request('/api/v1/products?campusId=unimaid'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.campusId, 'unimaid');
  assert.deepEqual(result.body.data, [mockProduct]);
});

test('3. GET /api/v1/products passes vendorId filter to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listProducts: async (options) => {
      capturedOptions = options;
      return [mockProduct];
    },
  }, () => request('/api/v1/products?vendorId=mama-put-special'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.vendorId, 'mama-put-special');
  assert.deepEqual(result.body.data, [mockProduct]);
});

test('4. GET /api/v1/products passes categoryId filter to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listProducts: async (options) => {
      capturedOptions = options;
      return [mockProduct];
    },
  }, () => request('/api/v1/products?categoryId=food-meals'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.categoryId, 'food-meals');
  assert.deepEqual(result.body.data, [mockProduct]);
});

test('5. GET /api/v1/products passes search query to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listProducts: async (options) => {
      capturedOptions = options;
      return [mockProduct];
    },
  }, () => request('/api/v1/products?search=suya'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.search, 'suya');
  assert.deepEqual(result.body.data, [mockProduct]);
});

test('6. GET /api/v1/products passes minPrice filter in kobo', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listProducts: async (options) => {
      capturedOptions = options;
      return [mockProduct];
    },
  }, () => request('/api/v1/products?minPrice=100000'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.minPrice, 100000);
});

test('7. GET /api/v1/products passes maxPrice filter in kobo', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listProducts: async (options) => {
      capturedOptions = options;
      return [mockProduct];
    },
  }, () => request('/api/v1/products?maxPrice=500000'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.maxPrice, 500000);
});

test('8. GET /api/v1/products passes price range filters simultaneously', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listProducts: async (options) => {
      capturedOptions = options;
      return [mockProduct];
    },
  }, () => request('/api/v1/products?minPrice=100000&maxPrice=300000'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.minPrice, 100000);
  assert.equal(capturedOptions.maxPrice, 300000);
});

test('9. GET /api/v1/products passes inStock filter to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listProducts: async (options) => {
      capturedOptions = options;
      return [mockProduct];
    },
  }, () => request('/api/v1/products?inStock=true'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.inStock, true);
});

test('10. GET /api/v1/products respects pagination limit and offset', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listProducts: async (options) => {
      capturedOptions = options;
      return [mockProduct];
    },
  }, () => request('/api/v1/products?limit=15&offset=30'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.limit, 15);
  assert.equal(capturedOptions.offset, 30);
});

test('11. GET /api/v1/products/:productId supports lookup by UUID and returns images', async () => {
  const result = await withRepositoryStub({
    getProductByIdentifier: async (id) => {
      assert.equal(id, mockProduct.id);
      return mockProduct;
    },
    getProductImages: async (id) => {
      assert.equal(id, mockProduct.id);
      return [mockProductImage];
    },
  }, () => request(`/api/v1/products/${mockProduct.id}`));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.id, mockProduct.id);
  assert.deepEqual(result.body.data.images, [mockProductImage]);
});

test('12. GET /api/v1/products/:productId returns 404 for missing product', async () => {
  const result = await withRepositoryStub({
    getProductByIdentifier: async () => null,
  }, () => request('/api/v1/products/non-existent-product'));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'PRODUCT_NOT_FOUND');
});

test('13. GET /api/v1/products/:productId returns 404 for unavailable product', async () => {
  const result = await withRepositoryStub({
    getProductByIdentifier: async () => null,
  }, () => request('/api/v1/products/unavailable-product'));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error.code, 'PRODUCT_NOT_FOUND');
});

test('14. GET /api/v1/products/:productId returns empty images array when no extra images exist', async () => {
  const result = await withRepositoryStub({
    getProductByIdentifier: async () => mockProduct,
    getProductImages: async () => [],
  }, () => request(`/api/v1/products/${mockProduct.id}`));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data.images, []);
});

test('15. GET /api/v1/products/:productId/reviews returns reviews list', async () => {
  const result = await withRepositoryStub({
    getProductByIdentifier: async () => mockProduct,
    getProductReviews: async (productId, pagination) => {
      assert.equal(productId, mockProduct.id);
      assert.equal(pagination.limit, 50);
      assert.equal(pagination.offset, 0);
      return [mockProductReview];
    },
  }, () => request(`/api/v1/products/${mockProduct.id}/reviews`));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.data, [mockProductReview]);
});

test('16. GET /api/v1/products/:productId/reviews returns 404 when product does not exist', async () => {
  const result = await withRepositoryStub({
    getProductByIdentifier: async () => null,
  }, () => request('/api/v1/products/missing-product/reviews'));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error.code, 'PRODUCT_NOT_FOUND');
});

test('17. GET /api/v1/products returns empty array when no products match', async () => {
  const result = await withRepositoryStub({
    listProducts: async () => [],
  }, () => request('/api/v1/products'));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, []);
});

test('18. Invalid pagination parameters are safely normalized', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listProducts: async (options) => {
      capturedOptions = options;
      return [];
    },
  }, () => request('/api/v1/products?limit=-10&offset=abc'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.limit, 20);
  assert.equal(capturedOptions.offset, 0);
});

test('19. Invalid price parameters are safely ignored', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listProducts: async (options) => {
      capturedOptions = options;
      return [];
    },
  }, () => request('/api/v1/products?minPrice=-500&maxPrice=invalid'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.minPrice, undefined);
  assert.equal(capturedOptions.maxPrice, undefined);
});

test('20. Repository failure returns safe 500 internal server error', async () => {
  const result = await withRepositoryStub({
    listProducts: async () => { throw new Error('database failure'); },
  }, () => request('/api/v1/products'));

  assert.equal(result.statusCode, 500);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'INTERNAL_SERVER_ERROR');
});

test('21. Rating calculation safely calculates average rating and handles empty review list', () => {
  assert.equal(productService.calculateAverageRating([]), 0);
  assert.equal(productService.calculateAverageRating(null), 0);
  assert.equal(productService.calculateAverageRating([{ rating: 5 }, { rating: 3 }]), 4.0);
  assert.equal(productService.calculateAverageRating([{ rating: 5 }, { rating: 4 }, { rating: 4 }]), 4.3);
});
