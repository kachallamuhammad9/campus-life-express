const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const cartRepository = require('../src/repositories/cartRepository');
const productRepository = require('../src/repositories/productRepository');
const userRepository = require('../src/repositories/userRepository');
const cartService = require('../src/services/cartService');
const {
  TEST_USER_ID,
  getAuthHeader,
} = require('./helpers/authHelper');

const OTHER_USER_ID = '00000000-0000-4000-8000-000000000099';
const VENDOR_1_ID = '00000000-0000-4000-8000-000000000010';
const VENDOR_2_ID = '00000000-0000-4000-8000-000000000020';
const CAMPUS_ID = '00000000-0000-4000-8000-000000000001';

const PRODUCT_1 = {
  id: '00000000-0000-4000-8000-000000000201',
  slug: 'jollof-rice-special',
  name: 'Jollof Rice Special',
  vendor_id: VENDOR_1_ID,
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

const PRODUCT_1_SAME_VENDOR = {
  id: '00000000-0000-4000-8000-000000000202',
  slug: 'fried-chicken-portion',
  name: 'Fried Chicken Portion',
  vendor_id: VENDOR_1_ID,
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

const PRODUCT_2_DIFF_VENDOR = {
  id: '00000000-0000-4000-8000-000000000203',
  slug: 'campus-burger-deluxe',
  name: 'Campus Burger Deluxe',
  vendor_id: VENDOR_2_ID,
  campus_id: CAMPUS_ID,
  price_kobo: 300000, // 3,000 NGN
  image_url: 'https://example.com/burger.jpg',
  is_in_stock: true,
  stock_quantity: 20,
  vendor_name: 'Campus Bites Cafe',
  vendor_slug: 'campus-bites-cafe',
  vendor_status: 'ACTIVE',
  campus_name: 'University of Maiduguri',
  campus_slug: 'unimaid',
  campus_is_active: true,
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

const withStubs = async (stubs, callback) => {
  const originals = {
    cartRepo: { ...cartRepository },
    productRepo: { ...productRepository },
    userRepo: { ...userRepository },
  };

  if (stubs.cart) Object.assign(cartRepository, stubs.cart);
  if (stubs.product) Object.assign(productRepository, stubs.product);
  if (stubs.user) Object.assign(userRepository, stubs.user);

  try {
    return await callback();
  } finally {
    Object.assign(cartRepository, originals.cartRepo);
    Object.assign(productRepository, originals.productRepo);
    Object.assign(userRepository, originals.userRepo);
  }
};

// ==========================================
// 1. AUTHENTICATION ENFORCEMENT
// ==========================================

test('1. GET /api/v1/cart without authentication returns 401 UNAUTHORIZED', async () => {
  const result = await request('/api/v1/cart');
  assert.equal(result.statusCode, 401);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'UNAUTHORIZED');
});

test('2. POST /api/v1/cart/items without authentication returns 401 UNAUTHORIZED', async () => {
  const result = await request('/api/v1/cart/items', {
    method: 'POST',
    body: { productId: PRODUCT_1.id, quantity: 1 },
  });
  assert.equal(result.statusCode, 401);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'UNAUTHORIZED');
});

test('3. PATCH /api/v1/cart/items/:itemId without authentication returns 401 UNAUTHORIZED', async () => {
  const result = await request('/api/v1/cart/items/00000000-0000-4000-8000-000000000801', {
    method: 'PATCH',
    body: { quantity: 2 },
  });
  assert.equal(result.statusCode, 401);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'UNAUTHORIZED');
});

test('4. DELETE /api/v1/cart/items/:itemId without authentication returns 401 UNAUTHORIZED', async () => {
  const result = await request('/api/v1/cart/items/00000000-0000-4000-8000-000000000801', {
    method: 'DELETE',
  });
  assert.equal(result.statusCode, 401);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'UNAUTHORIZED');
});

test('5. DELETE /api/v1/cart without authentication returns 401 UNAUTHORIZED', async () => {
  const result = await request('/api/v1/cart', {
    method: 'DELETE',
  });
  assert.equal(result.statusCode, 401);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'UNAUTHORIZED');
});

// ==========================================
// 2. CART RETRIEVAL & TOTAL CALCULATIONS
// ==========================================

test('6. Authenticated user gets own cart with items and server-side totals', async () => {
  const mockCart = {
    id: '00000000-0000-4000-8000-000000000701',
    user_id: TEST_USER_ID,
    vendor_id: VENDOR_1_ID,
    campus_id: CAMPUS_ID,
    status: 'ACTIVE',
    vendor_name: 'Mama Put Special',
    vendor_slug: 'mama-put-special',
    vendor_image_url: 'https://example.com/vendor.jpg',
    vendor_status: 'ACTIVE',
    campus_name: 'University of Maiduguri',
    campus_slug: 'unimaid',
    created_at: '2026-08-20T10:00:00Z',
    updated_at: '2026-08-20T10:00:00Z',
  };

  const mockItems = [
    {
      id: '00000000-0000-4000-8000-000000000801',
      cart_id: mockCart.id,
      product_id: PRODUCT_1.id,
      quantity: 2,
      unit_price_kobo: 250000,
      product_name: PRODUCT_1.name,
      product_slug: PRODUCT_1.slug,
      product_image_url: PRODUCT_1.image_url,
      product_is_in_stock: true,
      product_stock_quantity: 50,
      created_at: '2026-08-20T10:00:00Z',
      updated_at: '2026-08-20T10:00:00Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000802',
      cart_id: mockCart.id,
      product_id: PRODUCT_1_SAME_VENDOR.id,
      quantity: 1,
      unit_price_kobo: 120000,
      product_name: PRODUCT_1_SAME_VENDOR.name,
      product_slug: PRODUCT_1_SAME_VENDOR.slug,
      product_image_url: PRODUCT_1_SAME_VENDOR.image_url,
      product_is_in_stock: true,
      product_stock_quantity: 30,
      created_at: '2026-08-20T10:05:00Z',
      updated_at: '2026-08-20T10:05:00Z',
    },
  ];

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    cart: {
      getCartByUserId: async (userId) => (userId === TEST_USER_ID ? mockCart : null),
      getCartItemsByCartId: async (cartId) => (cartId === mockCart.id ? mockItems : []),
    },
  }, () => request('/api/v1/cart', {
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.cart.id, mockCart.id);
  assert.equal(result.body.data.cart.userId, TEST_USER_ID);
  assert.equal(result.body.data.cart.vendorId, VENDOR_1_ID);
  assert.equal(result.body.data.cart.itemCount, 3); // 2 + 1
  assert.equal(result.body.data.cart.subtotalKobo, 620000); // 2 * 250000 + 1 * 120000 = 620000 kobo (6,200 NGN)
  assert.equal(result.body.data.cart.items.length, 2);
  assert.equal(result.body.data.cart.items[0].totalPriceKobo, 500000);
  assert.equal(result.body.data.cart.items[1].totalPriceKobo, 120000);
});

test('7. Empty cart returns clean cart object with 0 itemCount and 0 subtotal', async () => {
  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    cart: {
      getCartByUserId: async () => null,
    },
  }, () => request('/api/v1/cart', {
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.cart.id, null);
  assert.equal(result.body.data.cart.userId, TEST_USER_ID);
  assert.equal(result.body.data.cart.vendorId, null);
  assert.equal(result.body.data.cart.itemCount, 0);
  assert.equal(result.body.data.cart.subtotalKobo, 0);
  assert.deepEqual(result.body.data.cart.items, []);
});

// ==========================================
// 3. ADD ITEM TO CART
// ==========================================

test('8. Add valid product creates cart and cart item with server-side price', async () => {
  const createdCart = {
    id: '00000000-0000-4000-8000-000000000701',
    user_id: TEST_USER_ID,
    vendor_id: VENDOR_1_ID,
    campus_id: CAMPUS_ID,
    status: 'ACTIVE',
    vendor_name: 'Mama Put Special',
    vendor_slug: 'mama-put-special',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const createdItem = {
    id: '00000000-0000-4000-8000-000000000801',
    cart_id: createdCart.id,
    product_id: PRODUCT_1.id,
    quantity: 2,
    unit_price_kobo: PRODUCT_1.price_kobo,
    product_name: PRODUCT_1.name,
    product_slug: PRODUCT_1.slug,
    product_image_url: PRODUCT_1.image_url,
    product_is_in_stock: true,
    product_stock_quantity: 50,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let insertedItemArgs = null;

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    product: {
      getProductByIdentifier: async (id) => (id === PRODUCT_1.id ? PRODUCT_1 : null),
    },
    cart: {
      getCartByUserId: async () => null,
      createCart: async () => createdCart,
      getCartItemByCartAndProduct: async () => null,
      addCartItem: async (args) => {
        insertedItemArgs = args;
        return createdItem;
      },
      getCartById: async () => createdCart,
      getCartItemsByCartId: async () => [createdItem],
    },
  }, () => request('/api/v1/cart/items', {
    method: 'POST',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
    body: {
      productId: PRODUCT_1.id,
      quantity: 2,
      // Client attempts to supply fake price and user ID
      price_kobo: 10,
      userId: OTHER_USER_ID,
    },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.cart.itemCount, 2);
  assert.equal(result.body.data.cart.subtotalKobo, 500000); // 2 * 250000
  // Server-side price was used, not client's 10 kobo
  assert.equal(insertedItemArgs.unitPriceKobo, 250000);
  assert.equal(insertedItemArgs.quantity, 2);
});

test('9. Invalid product identifier returns 404 PRODUCT_NOT_FOUND', async () => {
  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    product: {
      getProductByIdentifier: async () => null,
    },
  }, () => request('/api/v1/cart/items', {
    method: 'POST',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
    body: { productId: '00000000-0000-4000-8000-000000000999', quantity: 1 },
  }));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'PRODUCT_NOT_FOUND');
});

test('10. Inactive product vendor is rejected with 400 INVALID_PRODUCT', async () => {
  const inactiveVendorProduct = {
    ...PRODUCT_1,
    vendor_status: 'SUSPENDED',
  };

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    product: {
      getProductByIdentifier: async () => inactiveVendorProduct,
    },
  }, () => request('/api/v1/cart/items', {
    method: 'POST',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
    body: { productId: PRODUCT_1.id, quantity: 1 },
  }));

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'INVALID_PRODUCT');
  assert.match(result.body.error.message, /vendor is not currently active/i);
});

test('11. Out-of-stock product is rejected with 409 PRODUCT_OUT_OF_STOCK', async () => {
  const outOfStockProduct = {
    ...PRODUCT_1,
    is_in_stock: false,
  };

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    product: {
      getProductByIdentifier: async () => outOfStockProduct,
    },
  }, () => request('/api/v1/cart/items', {
    method: 'POST',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
    body: { productId: PRODUCT_1.id, quantity: 1 },
  }));

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'PRODUCT_OUT_OF_STOCK');
});

test('12. Quantity exceeding product stock is rejected with 409 PRODUCT_OUT_OF_STOCK', async () => {
  const limitedStockProduct = {
    ...PRODUCT_1,
    stock_quantity: 3,
  };

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    product: {
      getProductByIdentifier: async () => limitedStockProduct,
    },
  }, () => request('/api/v1/cart/items', {
    method: 'POST',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
    body: { productId: PRODUCT_1.id, quantity: 10 },
  }));

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'PRODUCT_OUT_OF_STOCK');
  assert.match(result.body.error.message, /exceeds available stock/i);
});

test('13. Zero, negative, decimal, and non-numeric quantities are rejected with 400 INVALID_QUANTITY', async () => {
  const testCases = [0, -5, 1.5, 'invalid', '', null, NaN];

  for (const qty of testCases) {
    const result = await withStubs({
      user: {
        getUserProfileById: async (id) => ({ id, is_active: true }),
        getUserRoles: async () => ['CUSTOMER'],
      },
      product: {
        getProductByIdentifier: async () => PRODUCT_1,
      },
    }, () => request('/api/v1/cart/items', {
      method: 'POST',
      headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
      body: { productId: PRODUCT_1.id, quantity: qty },
    }));

    assert.equal(result.statusCode, 400, `Expected 400 for quantity ${qty}`);
    assert.equal(result.body.success, false);
    assert.equal(result.body.error.code, 'INVALID_QUANTITY');
  }
});

test('14. Existing product in cart updates quantity without creating duplicates', async () => {
  const mockCart = {
    id: '00000000-0000-4000-8000-000000000701',
    user_id: TEST_USER_ID,
    vendor_id: VENDOR_1_ID,
    campus_id: CAMPUS_ID,
    status: 'ACTIVE',
  };

  const existingItem = {
    id: '00000000-0000-4000-8000-000000000801',
    cart_id: mockCart.id,
    product_id: PRODUCT_1.id,
    quantity: 2,
    unit_price_kobo: 250000,
  };

  let updatedArgs = null;

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    product: {
      getProductByIdentifier: async () => PRODUCT_1,
    },
    cart: {
      getCartByUserId: async () => mockCart,
      getCartItemsByCartId: async () => [{
        ...existingItem,
        quantity: 5,
        product_name: PRODUCT_1.name,
        product_slug: PRODUCT_1.slug,
        product_is_in_stock: true,
        product_stock_quantity: 50,
      }],
      getCartItemByCartAndProduct: async () => existingItem,
      updateCartItemQuantity: async (id, newQty, price) => {
        updatedArgs = { id, newQty, price };
        return { ...existingItem, quantity: newQty };
      },
      getCartById: async () => mockCart,
    },
  }, () => request('/api/v1/cart/items', {
    method: 'POST',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
    body: { productId: PRODUCT_1.id, quantity: 3 },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(updatedArgs.id, existingItem.id);
  assert.equal(updatedArgs.newQty, 5); // 2 existing + 3 new = 5
  assert.equal(updatedArgs.price, PRODUCT_1.price_kobo);
});

// ==========================================
// 4. SINGLE-VENDOR CART ENFORCEMENT
// ==========================================

test('15. Adding product from same vendor succeeds', async () => {
  const mockCart = {
    id: '00000000-0000-4000-8000-000000000701',
    user_id: TEST_USER_ID,
    vendor_id: VENDOR_1_ID,
    campus_id: CAMPUS_ID,
    status: 'ACTIVE',
  };

  const existingItems = [
    {
      id: '00000000-0000-4000-8000-000000000801',
      cart_id: mockCart.id,
      product_id: PRODUCT_1.id,
      quantity: 1,
      unit_price_kobo: PRODUCT_1.price_kobo,
    },
  ];

  let addCartItemCalled = false;

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    product: {
      getProductByIdentifier: async () => PRODUCT_1_SAME_VENDOR,
    },
    cart: {
      getCartByUserId: async () => mockCart,
      getCartItemsByCartId: async () => existingItems,
      getCartItemByCartAndProduct: async () => null,
      addCartItem: async () => {
        addCartItemCalled = true;
        return {
          id: '00000000-0000-4000-8000-000000000802',
          cart_id: mockCart.id,
          product_id: PRODUCT_1_SAME_VENDOR.id,
          quantity: 1,
          unit_price_kobo: PRODUCT_1_SAME_VENDOR.price_kobo,
        };
      },
      getCartById: async () => mockCart,
    },
  }, () => request('/api/v1/cart/items', {
    method: 'POST',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
    body: { productId: PRODUCT_1_SAME_VENDOR.id, quantity: 1 },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(addCartItemCalled, true);
});

test('16. Adding product from different vendor is rejected with 409 CART_VENDOR_MISMATCH', async () => {
  const mockCart = {
    id: '00000000-0000-4000-8000-000000000701',
    user_id: TEST_USER_ID,
    vendor_id: VENDOR_1_ID, // Vendor 1
    campus_id: CAMPUS_ID,
    status: 'ACTIVE',
  };

  const existingItems = [
    {
      id: '00000000-0000-4000-8000-000000000801',
      cart_id: mockCart.id,
      product_id: PRODUCT_1.id,
      quantity: 1,
    },
  ];

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    product: {
      getProductByIdentifier: async () => PRODUCT_2_DIFF_VENDOR, // Vendor 2
    },
    cart: {
      getCartByUserId: async () => mockCart,
      getCartItemsByCartId: async () => existingItems,
    },
  }, () => request('/api/v1/cart/items', {
    method: 'POST',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
    body: { productId: PRODUCT_2_DIFF_VENDOR.id, quantity: 1 },
  }));

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'CART_VENDOR_MISMATCH');
  assert.match(result.body.error.message, /one vendor and campus only/i);
});

test('17. Database trigger vendor mismatch error is mapped to 409 CART_VENDOR_MISMATCH', async () => {
  const mockCart = {
    id: '00000000-0000-4000-8000-000000000701',
    user_id: TEST_USER_ID,
    vendor_id: VENDOR_1_ID,
    campus_id: CAMPUS_ID,
    status: 'ACTIVE',
  };

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    product: {
      getProductByIdentifier: async () => PRODUCT_2_DIFF_VENDOR,
    },
    cart: {
      getCartByUserId: async () => mockCart,
      getCartItemsByCartId: async () => [],
      getCartItemByCartAndProduct: async () => null,
      updateCartVendorAndCampus: async () => mockCart,
      addCartItem: async () => {
        throw new Error('A cart may contain products from one vendor and campus only');
      },
    },
  }, () => request('/api/v1/cart/items', {
    method: 'POST',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
    body: { productId: PRODUCT_2_DIFF_VENDOR.id, quantity: 1 },
  }));

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'CART_VENDOR_MISMATCH');
});

// ==========================================
// 5. UPDATE CART ITEM
// ==========================================

test('18. Owner can update item quantity in cart', async () => {
  const mockItem = {
    id: '00000000-0000-4000-8000-000000000801',
    cart_id: '00000000-0000-4000-8000-000000000701',
    cart_user_id: TEST_USER_ID,
    product_id: PRODUCT_1.id,
    quantity: 1,
    unit_price_kobo: 250000,
    product_current_price_kobo: 250000,
    product_is_in_stock: true,
    product_stock_quantity: 50,
  };

  let updatedQuantity = null;

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    cart: {
      getCartItemById: async (id) => (id === mockItem.id ? mockItem : null),
      updateCartItemQuantity: async (id, qty) => {
        updatedQuantity = qty;
        return { ...mockItem, quantity: qty };
      },
      getCartById: async () => ({ id: mockItem.cart_id, user_id: TEST_USER_ID }),
      getCartItemsByCartId: async () => [{
        ...mockItem,
        quantity: 4,
        product_name: PRODUCT_1.name,
        product_slug: PRODUCT_1.slug,
        product_is_in_stock: true,
        product_stock_quantity: 50,
      }],
    },
  }, () => request(`/api/v1/cart/items/${mockItem.id}`, {
    method: 'PATCH',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
    body: { quantity: 4 },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(updatedQuantity, 4);
  assert.equal(result.body.data.cart.itemCount, 4);
  assert.equal(result.body.data.cart.subtotalKobo, 1000000); // 4 * 250000
});

test('19. Non-owner cannot update another user cart item (404 CART_ITEM_NOT_FOUND)', async () => {
  const otherUsersItem = {
    id: '00000000-0000-4000-8000-000000000801',
    cart_id: '00000000-0000-4000-8000-000000000701',
    cart_user_id: OTHER_USER_ID, // Belongs to another user
    product_id: PRODUCT_1.id,
    quantity: 1,
    unit_price_kobo: 250000,
    product_is_in_stock: true,
  };

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    cart: {
      getCartItemById: async () => otherUsersItem,
    },
  }, () => request(`/api/v1/cart/items/${otherUsersItem.id}`, {
    method: 'PATCH',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
    body: { quantity: 5 },
  }));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'CART_ITEM_NOT_FOUND');
});

test('20. Out-of-stock product cannot be updated with 409 PRODUCT_OUT_OF_STOCK', async () => {
  const outOfStockItem = {
    id: '00000000-0000-4000-8000-000000000801',
    cart_id: '00000000-0000-4000-8000-000000000701',
    cart_user_id: TEST_USER_ID,
    product_id: PRODUCT_1.id,
    quantity: 1,
    unit_price_kobo: 250000,
    product_is_in_stock: false, // Out of stock now
  };

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    cart: {
      getCartItemById: async () => outOfStockItem,
    },
  }, () => request(`/api/v1/cart/items/${outOfStockItem.id}`, {
    method: 'PATCH',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
    body: { quantity: 2 },
  }));

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'PRODUCT_OUT_OF_STOCK');
});

// ==========================================
// 6. REMOVE CART ITEM
// ==========================================

test('21. Owner can remove own item from cart', async () => {
  const mockItem = {
    id: '00000000-0000-4000-8000-000000000801',
    cart_id: '00000000-0000-4000-8000-000000000701',
    cart_user_id: TEST_USER_ID,
    product_id: PRODUCT_1.id,
  };

  let removedId = null;

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    cart: {
      getCartItemById: async () => mockItem,
      removeCartItem: async (id) => {
        removedId = id;
        return mockItem;
      },
      getCartById: async () => ({ id: mockItem.cart_id, user_id: TEST_USER_ID }),
      getCartItemsByCartId: async () => [],
    },
  }, () => request(`/api/v1/cart/items/${mockItem.id}`, {
    method: 'DELETE',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(removedId, mockItem.id);
  assert.equal(result.body.data.cart.itemCount, 0);
  assert.equal(result.body.data.cart.subtotalKobo, 0);
});

test('22. Non-owner cannot remove another user item (404 CART_ITEM_NOT_FOUND)', async () => {
  const otherUsersItem = {
    id: '00000000-0000-4000-8000-000000000801',
    cart_id: '00000000-0000-4000-8000-000000000701',
    cart_user_id: OTHER_USER_ID,
  };

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    cart: {
      getCartItemById: async () => otherUsersItem,
    },
  }, () => request(`/api/v1/cart/items/${otherUsersItem.id}`, {
    method: 'DELETE',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
  }));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'CART_ITEM_NOT_FOUND');
});

// ==========================================
// 7. CLEAR CART
// ==========================================

test('23. Owner can clear own cart', async () => {
  const mockCart = {
    id: '00000000-0000-4000-8000-000000000701',
    user_id: TEST_USER_ID,
  };

  let clearedCartId = null;

  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    cart: {
      getCartByUserId: async (userId) => (userId === TEST_USER_ID ? mockCart : null),
      clearCart: async (id) => {
        clearedCartId = id;
        return [];
      },
      getCartById: async () => mockCart,
    },
  }, () => request('/api/v1/cart', {
    method: 'DELETE',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(clearedCartId, mockCart.id);
  assert.equal(result.body.data.cart.itemCount, 0);
  assert.equal(result.body.data.cart.subtotalKobo, 0);
});

test('24. Clearing cart when user has no active cart is handled safely', async () => {
  const result = await withStubs({
    user: {
      getUserProfileById: async (id) => ({ id, is_active: true }),
      getUserRoles: async () => ['CUSTOMER'],
    },
    cart: {
      getCartByUserId: async () => null,
    },
  }, () => request('/api/v1/cart', {
    method: 'DELETE',
    headers: { Authorization: getAuthHeader({ sub: TEST_USER_ID }) },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.cart.itemCount, 0);
  assert.equal(result.body.data.cart.subtotalKobo, 0);
});

// ==========================================
// 8. SERVICE UNIT HELPER TESTS
// ==========================================

test('25. Quantity parsing helper correctly handles all valid and invalid inputs', () => {
  assert.equal(cartService.parseQuantity(1), 1);
  assert.equal(cartService.parseQuantity(50), 50);
  assert.equal(cartService.parseQuantity('5'), 5);
  assert.equal(cartService.parseQuantity('  12  '), 12);

  assert.equal(cartService.parseQuantity(0), null);
  assert.equal(cartService.parseQuantity(-1), null);
  assert.equal(cartService.parseQuantity(1.5), null);
  assert.equal(cartService.parseQuantity('1.5'), null);
  assert.equal(cartService.parseQuantity('abc'), null);
  assert.equal(cartService.parseQuantity(''), null);
  assert.equal(cartService.parseQuantity(null), null);
  assert.equal(cartService.parseQuantity(undefined), null);
  assert.equal(cartService.parseQuantity(NaN), null);
  assert.equal(cartService.parseQuantity(Infinity), null);
});

test('26. Format cart response calculates total kobo and item count accurately with integer math', () => {
  const mockCartRecord = {
    id: '00000000-0000-4000-8000-000000000701',
    vendor_id: VENDOR_1_ID,
    vendor_name: 'Mama Put Special',
    vendor_slug: 'mama-put-special',
    campus_id: CAMPUS_ID,
    campus_name: 'University of Maiduguri',
    created_at: '2026-08-20T10:00:00Z',
    updated_at: '2026-08-20T10:00:00Z',
  };

  const mockItems = [
    {
      id: 'item-1',
      product_id: 'prod-1',
      product_name: 'Rice',
      quantity: 3,
      unit_price_kobo: 150000,
    },
    {
      id: 'item-2',
      product_id: 'prod-2',
      product_name: 'Drink',
      quantity: 2,
      unit_price_kobo: 50000,
    },
  ];

  const formatted = cartService.formatCartResponse(TEST_USER_ID, mockCartRecord, mockItems);
  assert.equal(formatted.cart.itemCount, 5);
  assert.equal(formatted.cart.subtotalKobo, 550000); // 3 * 150000 + 2 * 50000 = 450000 + 100000 = 550000
  assert.equal(formatted.cart.items.length, 2);
  assert.equal(formatted.cart.items[0].totalPriceKobo, 450000);
  assert.equal(formatted.cart.items[1].totalPriceKobo, 100000);
});
