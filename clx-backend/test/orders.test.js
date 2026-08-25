const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const database = require('../src/config/database');
const orderRepository = require('../src/repositories/orderRepository');
const cartRepository = require('../src/repositories/cartRepository');
const productRepository = require('../src/repositories/productRepository');
const userRepository = require('../src/repositories/userRepository');
const orderService = require('../src/services/orderService');
const {
  TEST_USER_ID,
  getAuthHeader,
} = require('./helpers/authHelper');

const OTHER_USER_ID = '00000000-0000-4000-8000-000000000099';
const VENDOR_ID = '00000000-0000-4000-8000-000000000010';
const CAMPUS_ID = '00000000-0000-4000-8000-000000000001';
const ZONE_ID = '00000000-0000-4000-8000-000000000030';
const ORDER_ID_1 = '00000000-0000-4000-8000-000000000501';
const ORDER_ID_OTHER = '00000000-0000-4000-8000-000000000599';

const SAMPLE_PRODUCT_1 = {
  id: '00000000-0000-4000-8000-000000000201',
  slug: 'jollof-rice-special',
  name: 'Jollof Rice Special',
  vendor_id: VENDOR_ID,
  campus_id: CAMPUS_ID,
  price_kobo: 250000, // 2,500 NGN
  image_url: 'https://example.com/jollof.jpg',
  is_in_stock: true,
  stock_quantity: 50,
  vendor_name: 'Mama Put Special',
  vendor_slug: 'mama-put-special',
  vendor_status: 'ACTIVE',
  campus_name: 'University of Maiduguri',
  campus_slug: 'unimaid',
  campus_is_active: true,
};

const SAMPLE_PRODUCT_2 = {
  id: '00000000-0000-4000-8000-000000000202',
  slug: 'fried-chicken-portion',
  name: 'Fried Chicken Portion',
  vendor_id: VENDOR_ID,
  campus_id: CAMPUS_ID,
  price_kobo: 120000, // 1,200 NGN
  image_url: 'https://example.com/chicken.jpg',
  is_in_stock: true,
  stock_quantity: 30,
  vendor_name: 'Mama Put Special',
  vendor_slug: 'mama-put-special',
  vendor_status: 'ACTIVE',
  campus_name: 'University of Maiduguri',
  campus_slug: 'unimaid',
  campus_is_active: true,
};

const SAMPLE_ZONE = {
  id: ZONE_ID,
  campus_id: CAMPUS_ID,
  name: 'Acada Complex',
  base_delivery_fee_kobo: 40000, // 400 NGN
  is_active: true,
};

const SAMPLE_USER_PROFILE = {
  id: TEST_USER_ID,
  email: 'student@unimaid.edu.ng',
  full_name: 'Student User',
  phone_number: '08012345678',
  default_campus_id: CAMPUS_ID,
  is_active: true,
};

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

const withStubs = async (stubs, fn) => {
  const originals = {
    orderRepo: {},
    cartRepo: {},
    productRepo: {},
    userRepo: {},
    db: {},
  };

  if (stubs.orderRepo) {
    for (const [k, v] of Object.entries(stubs.orderRepo)) {
      originals.orderRepo[k] = orderRepository[k];
      orderRepository[k] = v;
    }
  }
  if (stubs.cartRepo) {
    for (const [k, v] of Object.entries(stubs.cartRepo)) {
      originals.cartRepo[k] = cartRepository[k];
      cartRepository[k] = v;
    }
  }
  if (stubs.productRepo) {
    for (const [k, v] of Object.entries(stubs.productRepo)) {
      originals.productRepo[k] = productRepository[k];
      productRepository[k] = v;
    }
  }
  if (stubs.userRepo) {
    for (const [k, v] of Object.entries(stubs.userRepo)) {
      originals.userRepo[k] = userRepository[k];
      userRepository[k] = v;
    }
  }
  if (stubs.db) {
    for (const [k, v] of Object.entries(stubs.db)) {
      originals.db[k] = database[k];
      database[k] = v;
    }
  }

  try {
    return await fn();
  } finally {
    if (stubs.orderRepo) {
      for (const k of Object.keys(stubs.orderRepo)) {
        orderRepository[k] = originals.orderRepo[k];
      }
    }
    if (stubs.cartRepo) {
      for (const k of Object.keys(stubs.cartRepo)) {
        cartRepository[k] = originals.cartRepo[k];
      }
    }
    if (stubs.productRepo) {
      for (const k of Object.keys(stubs.productRepo)) {
        productRepository[k] = originals.productRepo[k];
      }
    }
    if (stubs.userRepo) {
      for (const k of Object.keys(stubs.userRepo)) {
        userRepository[k] = originals.userRepo[k];
      }
    }
    if (stubs.db) {
      for (const k of Object.keys(stubs.db)) {
        database[k] = originals.db[k];
      }
    }
  }
};

// ==========================================
// 1. AUTHENTICATION TESTS
// ==========================================

test('1. POST /api/v1/orders requires authentication (401)', async () => {
  const response = await request('/api/v1/orders', {
    method: 'POST',
    body: { deliveryAddress: 'Hostel A, Room 102', phoneNumber: '08012345678' },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('2. GET /api/v1/orders requires authentication (401)', async () => {
  const response = await request('/api/v1/orders');

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('3. GET /api/v1/orders/:orderId requires authentication (401)', async () => {
  const response = await request(`/api/v1/orders/${ORDER_ID_1}`);

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

// ==========================================
// 2. CART & CHECKOUT VALIDATION TESTS
// ==========================================

test('4. POST /api/v1/orders returns 404 CART_NOT_FOUND when user has no active cart', async () => {
  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => null,
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: { deliveryAddress: 'Hostel A Room 10', phoneNumber: '08012345678' },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'CART_NOT_FOUND');
  });
});

test('5. POST /api/v1/orders returns 400 CART_EMPTY when active cart has no items', async () => {
  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => ({ id: 'cart-1', user_id: TEST_USER_ID, vendor_id: VENDOR_ID, campus_id: CAMPUS_ID }),
      getCartItemsByCartId: async () => [],
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: { deliveryAddress: 'Hostel A Room 10', phoneNumber: '08012345678' },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'CART_EMPTY');
  });
});

test('6. POST /api/v1/orders validates delivery address (missing or too short returns 400)', async () => {
  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
  }, async () => {
    const resEmpty = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: { deliveryAddress: '', phoneNumber: '08012345678' },
    });
    assert.equal(resEmpty.statusCode, 400);
    assert.equal(resEmpty.body.error.code, 'INVALID_DELIVERY_ADDRESS');

    const resShort = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: { deliveryAddress: 'ab', phoneNumber: '08012345678' },
    });
    assert.equal(resShort.statusCode, 400);
    assert.equal(resShort.body.error.code, 'INVALID_DELIVERY_ADDRESS');
  });
});

test('7. POST /api/v1/orders resolves phone number from profile when omitted in body', async () => {
  let createdOrderData = null;

  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => ({
        id: 'cart-1',
        user_id: TEST_USER_ID,
        vendor_id: VENDOR_ID,
        campus_id: CAMPUS_ID,
        vendor_name: 'Mama Put Special',
        campus_name: 'University of Maiduguri',
      }),
      getCartItemsByCartId: async () => [
        { id: 'ci-1', cart_id: 'cart-1', product_id: SAMPLE_PRODUCT_1.id, quantity: 2, unit_price_kobo: 250000 },
      ],
    },
    productRepo: {
      getProductByIdentifier: async () => SAMPLE_PRODUCT_1,
    },
    orderRepo: {
      createOrder: async (data) => {
        createdOrderData = data;
        return { id: ORDER_ID_1, ...data, created_at: new Date().toISOString() };
      },
      createOrderItems: async (orderId, items) => items.map((it, idx) => ({ id: `oi-${idx}`, order_id: orderId, ...it })),
      decrementProductStock: async () => ({ id: SAMPLE_PRODUCT_1.id, stock_quantity: 48 }),
      createOrderPayment: async (data) => ({ id: 'pay-1', ...data, created_at: new Date().toISOString() }),
      clearCartItems: async () => [{ id: 'ci-1' }],
    },
    db: {
      withTransaction: async (cb) => cb(null),
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: { deliveryAddress: 'Hostel A Room 10' }, // omitted phoneNumber
    });

    assert.equal(response.statusCode, 201);
    assert.equal(createdOrderData.phoneNumber, '08012345678');
  });
});

// ==========================================
// 3. PRODUCT & STOCK VALIDATION TESTS
// ==========================================

test('8. POST /api/v1/orders rejects when a product in cart is not found (404 PRODUCT_NOT_FOUND)', async () => {
  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => ({ id: 'cart-1', user_id: TEST_USER_ID, vendor_id: VENDOR_ID, campus_id: CAMPUS_ID }),
      getCartItemsByCartId: async () => [
        { id: 'ci-1', cart_id: 'cart-1', product_id: 'missing-product-id', quantity: 1 },
      ],
    },
    productRepo: {
      getProductByIdentifier: async () => null,
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: { deliveryAddress: 'Science Complex Lab 3', phoneNumber: '08012345678' },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.error.code, 'PRODUCT_NOT_FOUND');
  });
});

test('9. POST /api/v1/orders rejects when product is out of stock (409 PRODUCT_OUT_OF_STOCK)', async () => {
  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => ({ id: 'cart-1', user_id: TEST_USER_ID, vendor_id: VENDOR_ID, campus_id: CAMPUS_ID }),
      getCartItemsByCartId: async () => [
        { id: 'ci-1', cart_id: 'cart-1', product_id: SAMPLE_PRODUCT_1.id, quantity: 1 },
      ],
    },
    productRepo: {
      getProductByIdentifier: async () => ({ ...SAMPLE_PRODUCT_1, is_in_stock: false }),
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: { deliveryAddress: 'Science Complex Lab 3', phoneNumber: '08012345678' },
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.error.code, 'PRODUCT_OUT_OF_STOCK');
  });
});

test('10. POST /api/v1/orders rejects when requested quantity exceeds available stock (409 PRODUCT_OUT_OF_STOCK)', async () => {
  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => ({ id: 'cart-1', user_id: TEST_USER_ID, vendor_id: VENDOR_ID, campus_id: CAMPUS_ID }),
      getCartItemsByCartId: async () => [
        { id: 'ci-1', cart_id: 'cart-1', product_id: SAMPLE_PRODUCT_1.id, quantity: 15 },
      ],
    },
    productRepo: {
      getProductByIdentifier: async () => ({ ...SAMPLE_PRODUCT_1, stock_quantity: 10 }),
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: { deliveryAddress: 'Hostel Block C Room 2', phoneNumber: '08012345678' },
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.error.code, 'PRODUCT_OUT_OF_STOCK');
  });
});

test('11. POST /api/v1/orders rejects when vendor is inactive (409 PRODUCT_UNAVAILABLE)', async () => {
  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => ({ id: 'cart-1', user_id: TEST_USER_ID, vendor_id: VENDOR_ID, campus_id: CAMPUS_ID }),
      getCartItemsByCartId: async () => [
        { id: 'ci-1', cart_id: 'cart-1', product_id: SAMPLE_PRODUCT_1.id, quantity: 1 },
      ],
    },
    productRepo: {
      getProductByIdentifier: async () => ({ ...SAMPLE_PRODUCT_1, vendor_status: 'SUSPENDED' }),
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: { deliveryAddress: 'Hostel Block C Room 2', phoneNumber: '08012345678' },
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.error.code, 'PRODUCT_UNAVAILABLE');
  });
});

test('12. POST /api/v1/orders rejects when campus is inactive (409 PRODUCT_UNAVAILABLE)', async () => {
  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => ({ id: 'cart-1', user_id: TEST_USER_ID, vendor_id: VENDOR_ID, campus_id: CAMPUS_ID }),
      getCartItemsByCartId: async () => [
        { id: 'ci-1', cart_id: 'cart-1', product_id: SAMPLE_PRODUCT_1.id, quantity: 1 },
      ],
    },
    productRepo: {
      getProductByIdentifier: async () => ({ ...SAMPLE_PRODUCT_1, campus_is_active: false }),
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: { deliveryAddress: 'Hostel Block C Room 2', phoneNumber: '08012345678' },
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.error.code, 'PRODUCT_UNAVAILABLE');
  });
});

// ==========================================
// 4. PRICING & INTEGER KOBO ARITHMETIC TESTS
// ==========================================

test('13. Order prices are derived strictly from database records (client supplied totals ignored)', async () => {
  let createdOrderData = null;

  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => ({
        id: 'cart-1',
        user_id: TEST_USER_ID,
        vendor_id: VENDOR_ID,
        campus_id: CAMPUS_ID,
        vendor_name: 'Mama Put Special',
        campus_name: 'University of Maiduguri',
      }),
      getCartItemsByCartId: async () => [
        { id: 'ci-1', cart_id: 'cart-1', product_id: SAMPLE_PRODUCT_1.id, quantity: 2, unit_price_kobo: 999999 }, // manipulated in cart item
      ],
    },
    productRepo: {
      // Real database price is 250,000 kobo (2,500 NGN)
      getProductByIdentifier: async () => SAMPLE_PRODUCT_1,
    },
    orderRepo: {
      createOrder: async (data) => {
        createdOrderData = data;
        return { id: ORDER_ID_1, ...data, created_at: new Date().toISOString() };
      },
      createOrderItems: async (orderId, items) => items.map((it, idx) => ({ id: `oi-${idx}`, order_id: orderId, ...it })),
      decrementProductStock: async () => ({ id: SAMPLE_PRODUCT_1.id, stock_quantity: 48 }),
      createOrderPayment: async (data) => ({ id: 'pay-1', ...data, created_at: new Date().toISOString() }),
      clearCartItems: async () => [{ id: 'ci-1' }],
    },
    db: {
      withTransaction: async (cb) => cb(null),
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: {
        deliveryAddress: 'Hostel A Room 10',
        phoneNumber: '08012345678',
        subtotalKobo: 50, // client attempts to spoof subtotal
        totalKobo: 50, // client attempts to spoof total
        price: 1, // client attempts to spoof unit price
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.success, true);
    // 2 items * 250,000 kobo = 500,000 kobo (5,000 NGN)
    assert.equal(createdOrderData.subtotalKobo, 500000);
    assert.equal(createdOrderData.totalKobo, 500000);
    assert.equal(response.body.data.order.subtotalKobo, 500000);
    assert.equal(response.body.data.order.totalKobo, 500000);
  });
});

test('14. Multi-item subtotal and delivery zone fee calculate accurately in integer kobo', async () => {
  let createdOrderData = null;

  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => ({
        id: 'cart-1',
        user_id: TEST_USER_ID,
        vendor_id: VENDOR_ID,
        campus_id: CAMPUS_ID,
        vendor_name: 'Mama Put Special',
        campus_name: 'University of Maiduguri',
      }),
      getCartItemsByCartId: async () => [
        { id: 'ci-1', cart_id: 'cart-1', product_id: SAMPLE_PRODUCT_1.id, quantity: 3 }, // 3 * 250,000 = 750,000
        { id: 'ci-2', cart_id: 'cart-1', product_id: SAMPLE_PRODUCT_2.id, quantity: 2 }, // 2 * 120,000 = 240,000
      ],
    },
    productRepo: {
      getProductByIdentifier: async (id) => {
        if (id === SAMPLE_PRODUCT_1.id) return SAMPLE_PRODUCT_1;
        if (id === SAMPLE_PRODUCT_2.id) return SAMPLE_PRODUCT_2;
        return null;
      },
    },
    orderRepo: {
      getDeliveryZoneById: async () => SAMPLE_ZONE, // 40,000 kobo delivery fee
      createOrder: async (data) => {
        createdOrderData = data;
        return { id: ORDER_ID_1, ...data, created_at: new Date().toISOString() };
      },
      createOrderItems: async (orderId, items) => items.map((it, idx) => ({ id: `oi-${idx}`, order_id: orderId, ...it })),
      decrementProductStock: async () => ({ id: SAMPLE_PRODUCT_1.id, stock_quantity: 47 }),
      createOrderPayment: async (data) => ({ id: 'pay-1', ...data, created_at: new Date().toISOString() }),
      clearCartItems: async () => [{ id: 'ci-1' }, { id: 'ci-2' }],
    },
    db: {
      withTransaction: async (cb) => cb(null),
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: {
        deliveryAddress: 'Faculty of Law Room 4',
        phoneNumber: '08012345678',
        deliveryZoneId: ZONE_ID,
      },
    });

    assert.equal(response.statusCode, 201);
    // Subtotal: 750,000 + 240,000 = 990,000 kobo
    // Delivery fee: 40,000 kobo
    // Total: 1,030,000 kobo
    assert.equal(createdOrderData.subtotalKobo, 990000);
    assert.equal(createdOrderData.deliveryFeeKobo, 40000);
    assert.equal(createdOrderData.totalKobo, 1030000);
    assert.equal(response.body.data.order.subtotalKobo, 990000);
    assert.equal(response.body.data.order.deliveryFeeKobo, 40000);
    assert.equal(response.body.data.order.totalKobo, 1030000);
  });
});

test('15. POST /api/v1/orders rejects invalid or mismatched delivery zone (400 INVALID_DELIVERY_ZONE)', async () => {
  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => ({ id: 'cart-1', user_id: TEST_USER_ID, vendor_id: VENDOR_ID, campus_id: CAMPUS_ID }),
      getCartItemsByCartId: async () => [
        { id: 'ci-1', cart_id: 'cart-1', product_id: SAMPLE_PRODUCT_1.id, quantity: 1 },
      ],
    },
    productRepo: {
      getProductByIdentifier: async () => SAMPLE_PRODUCT_1,
    },
    orderRepo: {
      getDeliveryZoneById: async () => ({
        ...SAMPLE_ZONE,
        campus_id: 'different-campus-uuid', // mismatch
      }),
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: {
        deliveryAddress: 'Hostel A',
        phoneNumber: '08012345678',
        deliveryZoneId: ZONE_ID,
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error.code, 'INVALID_DELIVERY_ZONE');
  });
});

// ==========================================
// 5. ORDER CREATION & ATOMICITY TESTS
// ==========================================

test('16. Valid cart creates order with initial PENDING status and clears cart', async () => {
  let cartCleared = false;
  let stockDecremented = false;

  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => ({
        id: 'cart-1',
        user_id: TEST_USER_ID,
        vendor_id: VENDOR_ID,
        campus_id: CAMPUS_ID,
        vendor_name: 'Mama Put Special',
        vendor_slug: 'mama-put-special',
        campus_name: 'University of Maiduguri',
        campus_slug: 'unimaid',
      }),
      getCartItemsByCartId: async () => [
        { id: 'ci-1', cart_id: 'cart-1', product_id: SAMPLE_PRODUCT_1.id, quantity: 2 },
      ],
    },
    productRepo: {
      getProductByIdentifier: async () => SAMPLE_PRODUCT_1,
    },
    orderRepo: {
      createOrder: async (data) => ({
        id: ORDER_ID_1,
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      createOrderItems: async (orderId, items) => items.map((it, idx) => ({
        id: `oi-${idx}`,
        order_id: orderId,
        product_id: it.productId,
        quantity: it.quantity,
        unit_price_kobo: it.unitPriceKobo,
        total_price_kobo: it.totalPriceKobo,
        created_at: new Date().toISOString(),
      })),
      decrementProductStock: async () => {
        stockDecremented = true;
        return { id: SAMPLE_PRODUCT_1.id, stock_quantity: 48 };
      },
      createOrderPayment: async (data) => ({
        id: 'pay-1',
        ...data,
        created_at: new Date().toISOString(),
      }),
      clearCartItems: async () => {
        cartCleared = true;
        return [{ id: 'ci-1' }];
      },
    },
    db: {
      withTransaction: async (cb) => cb(null),
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: {
        deliveryAddress: 'Block D, Flat 2, Staff Quarters',
        phoneNumber: '08099887766',
        paymentMethod: 'CASH_ON_DELIVERY',
        notes: 'Please call when arriving at gate',
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.order.status, 'PENDING');
    assert.equal(response.body.data.order.paymentStatus, 'PENDING');
    assert.equal(response.body.data.order.paymentMethod, 'CASH_ON_DELIVERY');
    assert.equal(response.body.data.order.notes, 'Please call when arriving at gate');
    assert.equal(response.body.data.order.items.length, 1);
    assert.equal(response.body.data.order.items[0].productName, 'Jollof Rice Special');
    assert.equal(response.body.data.order.items[0].unitPriceKobo, 250000);
    assert.equal(response.body.data.order.items[0].quantity, 2);
    assert.equal(response.body.data.order.items[0].totalPriceKobo, 500000);
    assert.equal(cartCleared, true);
    assert.equal(stockDecremented, true);
  });
});

test('17. Transaction failure rolls back and returns 500 without clearing cart', async () => {
  let cartCleared = false;

  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => ({ id: 'cart-1', user_id: TEST_USER_ID, vendor_id: VENDOR_ID, campus_id: CAMPUS_ID }),
      getCartItemsByCartId: async () => [
        { id: 'ci-1', cart_id: 'cart-1', product_id: SAMPLE_PRODUCT_1.id, quantity: 1 },
      ],
    },
    productRepo: {
      getProductByIdentifier: async () => SAMPLE_PRODUCT_1,
    },
    orderRepo: {
      createOrder: async () => {
        throw new Error('Database disk write failure');
      },
      clearCartItems: async () => {
        cartCleared = true;
      },
    },
    db: {
      withTransaction: async (cb) => {
        try {
          return await cb(null);
        } catch (err) {
          throw err;
        }
      },
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: { deliveryAddress: 'Hostel Block C Room 2', phoneNumber: '08012345678' },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'ORDER_CREATION_FAILED');
    assert.equal(cartCleared, false);
  });
});

test('18. Order item failure rolls back parent order and transaction', async () => {
  let orderCreated = false;

  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    cartRepo: {
      getCartByUserId: async () => ({ id: 'cart-1', user_id: TEST_USER_ID, vendor_id: VENDOR_ID, campus_id: CAMPUS_ID }),
      getCartItemsByCartId: async () => [
        { id: 'ci-1', cart_id: 'cart-1', product_id: SAMPLE_PRODUCT_1.id, quantity: 1 },
      ],
    },
    productRepo: {
      getProductByIdentifier: async () => SAMPLE_PRODUCT_1,
    },
    orderRepo: {
      createOrder: async (data) => {
        orderCreated = true;
        return { id: ORDER_ID_1, ...data };
      },
      createOrderItems: async () => {
        throw new Error('Constraint violation on order_items');
      },
    },
    db: {
      withTransaction: async (cb) => cb(null),
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: { deliveryAddress: 'Hostel A Room 10', phoneNumber: '08012345678' },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.body.error.code, 'ORDER_CREATION_FAILED');
  });
});

// ==========================================
// 6. ORDER RETRIEVAL & OWNERSHIP TESTS
// ==========================================

test('19. GET /api/v1/orders returns only orders belonging to authenticated user', async () => {
  const userOrders = [
    {
      id: ORDER_ID_1,
      user_id: TEST_USER_ID,
      vendor_id: VENDOR_ID,
      campus_id: CAMPUS_ID,
      delivery_address: 'Acada Complex',
      phone_number: '08012345678',
      type: 'FOOD',
      subtotal_kobo: 500000,
      delivery_fee_kobo: 40000,
      service_fee_kobo: 0,
      total_kobo: 540000,
      payment_method: 'CASH_ON_DELIVERY',
      payment_status: 'PENDING',
      status: 'PENDING',
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      vendor_name: 'Mama Put Special',
      vendor_slug: 'mama-put-special',
      campus_name: 'University of Maiduguri',
      campus_slug: 'unimaid',
      item_count: 2,
    },
  ];

  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    orderRepo: {
      getOrdersByUserId: async (uid) => {
        assert.equal(uid, TEST_USER_ID);
        return userOrders;
      },
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      headers: { Authorization: getAuthHeader() },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(Array.isArray(response.body.data.orders), true);
    assert.equal(response.body.data.orders.length, 1);
    assert.equal(response.body.data.orders[0].id, ORDER_ID_1);
    assert.equal(response.body.data.orders[0].userId, TEST_USER_ID);
    assert.equal(response.body.data.orders[0].totalKobo, 540000);
    assert.equal(response.body.data.orders[0].vendor.name, 'Mama Put Special');
    assert.equal(response.body.data.pagination.limit, 20);
    assert.equal(response.body.data.pagination.offset, 0);
  });
});

test('20. GET /api/v1/orders/:orderId returns full order details with items and payments for owner', async () => {
  const sampleOrder = {
    id: ORDER_ID_1,
    user_id: TEST_USER_ID,
    vendor_id: VENDOR_ID,
    campus_id: CAMPUS_ID,
    delivery_zone_id: ZONE_ID,
    delivery_address: 'Faculty of Science Lab 2',
    phone_number: '08012345678',
    type: 'FOOD',
    subtotal_kobo: 500000,
    delivery_fee_kobo: 40000,
    service_fee_kobo: 0,
    total_kobo: 540000,
    payment_method: 'CASH_ON_DELIVERY',
    payment_status: 'PENDING',
    status: 'PENDING',
    notes: 'Fragile package',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    vendor_name: 'Mama Put Special',
    vendor_slug: 'mama-put-special',
    campus_name: 'University of Maiduguri',
    campus_slug: 'unimaid',
    delivery_zone_name: 'Acada Complex',
  };

  const sampleItems = [
    {
      id: 'oi-1',
      order_id: ORDER_ID_1,
      product_id: SAMPLE_PRODUCT_1.id,
      quantity: 2,
      unit_price_kobo: 250000,
      total_price_kobo: 500000,
      product_name: 'Jollof Rice Special',
      product_slug: 'jollof-rice-special',
      product_image_url: 'https://example.com/jollof.jpg',
      created_at: new Date().toISOString(),
    },
  ];

  const samplePayments = [
    {
      id: 'pay-1',
      order_id: ORDER_ID_1,
      provider: null,
      provider_reference: null,
      amount_kobo: 540000,
      status: 'PENDING',
      paid_at: null,
      created_at: new Date().toISOString(),
    },
  ];

  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    orderRepo: {
      getOrderById: async (id) => (id === ORDER_ID_1 ? sampleOrder : null),
      getOrderItemsByOrderId: async () => sampleItems,
      getOrderPaymentsByOrderId: async () => samplePayments,
    },
  }, async () => {
    const response = await request(`/api/v1/orders/${ORDER_ID_1}`, {
      headers: { Authorization: getAuthHeader() },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.order.id, ORDER_ID_1);
    assert.equal(response.body.data.order.userId, TEST_USER_ID);
    assert.equal(response.body.data.order.items.length, 1);
    assert.equal(response.body.data.order.items[0].productName, 'Jollof Rice Special');
    assert.equal(response.body.data.order.payments.length, 1);
    assert.equal(response.body.data.order.payments[0].amountKobo, 540000);
  });
});

test('21. GET /api/v1/orders/:orderId returns 404 ORDER_NOT_FOUND when accessing another user\'s order', async () => {
  const anotherUserOrder = {
    id: ORDER_ID_OTHER,
    user_id: OTHER_USER_ID, // Owned by another user
    vendor_id: VENDOR_ID,
    campus_id: CAMPUS_ID,
    delivery_address: 'Hostel B',
    phone_number: '08099999999',
    subtotal_kobo: 200000,
    total_kobo: 200000,
    status: 'CONFIRMED',
  };

  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    orderRepo: {
      getOrderById: async (id) => (id === ORDER_ID_OTHER ? anotherUserOrder : null),
    },
  }, async () => {
    const response = await request(`/api/v1/orders/${ORDER_ID_OTHER}`, {
      headers: { Authorization: getAuthHeader() },
    });

    // Strictly returns 404 and does not disclose that the other user's order exists
    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'ORDER_NOT_FOUND');
  });
});

test('22. GET /api/v1/orders/:orderId returns 404 ORDER_NOT_FOUND when order does not exist', async () => {
  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    orderRepo: {
      getOrderById: async () => null,
    },
  }, async () => {
    const response = await request('/api/v1/orders/non-existent-uuid', {
      headers: { Authorization: getAuthHeader() },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'ORDER_NOT_FOUND');
  });
});

// ==========================================
// 7. PAGINATION NORMALIZATION TESTS
// ==========================================

test('23. GET /api/v1/orders normalizes limit, maximum limit, and negative offset', async () => {
  let capturedOptions = null;

  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
    orderRepo: {
      getOrdersByUserId: async (uid, opts) => {
        capturedOptions = opts;
        return [];
      },
    },
  }, async () => {
    // 1. Negative offset and excessively large limit
    const res1 = await request('/api/v1/orders?limit=999&offset=-5', {
      headers: { Authorization: getAuthHeader() },
    });
    assert.equal(res1.statusCode, 200);
    assert.equal(capturedOptions.limit, 100);
    assert.equal(capturedOptions.offset, 0);

    // 2. Non-numeric inputs fallback safely
    const res2 = await request('/api/v1/orders?limit=invalid&offset=invalid', {
      headers: { Authorization: getAuthHeader() },
    });
    assert.equal(res2.statusCode, 200);
    assert.equal(capturedOptions.limit, 20);
    assert.equal(capturedOptions.offset, 0);
  });
});

// ==========================================
// 8. INPUT VALIDATION & OPTIONAL FIELDS
// ==========================================

test('24. POST /api/v1/orders rejects invalid payment method (400 INVALID_PAYMENT_METHOD)', async () => {
  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: {
        deliveryAddress: 'Hostel A Room 10',
        phoneNumber: '08012345678',
        paymentMethod: 'CRYPTO_BITCOIN', // invalid
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error.code, 'INVALID_PAYMENT_METHOD');
  });
});

test('25. POST /api/v1/orders rejects invalid order type (400 INVALID_ORDER_TYPE)', async () => {
  await withStubs({
    userRepo: {
      getUserProfileById: async () => SAMPLE_USER_PROFILE,
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: {
        deliveryAddress: 'Hostel A Room 10',
        phoneNumber: '08012345678',
        type: 'AIRCRAFT_CHARTER', // invalid
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error.code, 'INVALID_ORDER_TYPE');
  });
});

test('26. POST /api/v1/orders rejects when phone number is invalid (400 INVALID_PHONE_NUMBER)', async () => {
  await withStubs({
    userRepo: {
      getUserProfileById: async () => ({ ...SAMPLE_USER_PROFILE, phone_number: null }),
    },
  }, async () => {
    const response = await request('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: {
        deliveryAddress: 'Hostel A Room 10',
        phoneNumber: '123', // too short
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error.code, 'INVALID_PHONE_NUMBER');
  });
});

// ==========================================
// 9. SERVICE HELPER UNIT TESTS
// ==========================================

test('27. normalizePagination correctly bounds values', () => {
  assert.deepEqual(orderService.normalizePagination(undefined, undefined), { limit: 20, offset: 0 });
  assert.deepEqual(orderService.normalizePagination('50', '10'), { limit: 50, offset: 10 });
  assert.deepEqual(orderService.normalizePagination('500', '-20'), { limit: 100, offset: 0 });
  assert.deepEqual(orderService.normalizePagination('0', 'abc'), { limit: 20, offset: 0 });
});

test('28. formatOrderItem preserves integer kobo calculation', () => {
  const item = orderService.formatOrderItem({
    id: 'oi-1',
    order_id: 'o-1',
    product_id: 'p-1',
    product_name: 'Drink',
    quantity: '3',
    unit_price_kobo: '15000',
    total_price_kobo: '45000',
    created_at: '2026-08-22T00:00:00Z',
  });

  assert.equal(item.quantity, 3);
  assert.equal(item.unitPriceKobo, 15000);
  assert.equal(item.totalPriceKobo, 45000);
  assert.equal(typeof item.totalPriceKobo, 'number');
});
