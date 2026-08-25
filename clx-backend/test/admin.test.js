const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const adminRepository = require('../src/repositories/adminRepository');
const auditRepository = require('../src/repositories/auditRepository');
const userRepository = require('../src/repositories/userRepository');
const notificationService = require('../src/services/notificationService');
const {
  TEST_USER_ID,
  TEST_ADMIN_ID,
  TEST_VENDOR_USER_ID,
  getAuthHeader,
} = require('./helpers/authHelper');

const TEST_SUPER_ADMIN_ID = '00000000-0000-4000-8000-000000000002';
const TEST_RIDER_ID = '00000000-0000-4000-8000-000000000015';
const TARGET_USER_ID = '00000000-0000-4000-8000-000000000099';

const SAMPLE_VENDOR_ID = '00000000-0000-4000-8000-000000000201';
const SAMPLE_PRODUCT_ID = '00000000-0000-4000-8000-000000000301';
const SAMPLE_LISTING_ID = '00000000-0000-4000-8000-000000000401';
const SAMPLE_SERVICE_ID = '00000000-0000-4000-8000-000000000501';
const SAMPLE_ORDER_ID = '00000000-0000-4000-8000-000000000601';
const SAMPLE_DELIVERY_ID = '00000000-0000-4000-8000-000000000701';
const SAMPLE_AUDIT_LOG_ID = '00000000-0000-4000-8000-000000000801';

const request = (path, options = {}) =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const method = options.method || 'GET';
      const payload = options.body ? JSON.stringify(options.body) : null;

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: {
            ...(options.headers || {}),
            ...(payload
              ? {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(payload),
                }
              : {}),
          },
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            server.close(() => {
              let parsed;
              try {
                parsed = JSON.parse(body);
              } catch (_) {
                parsed = body;
              }
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: parsed,
              });
            });
          });
        }
      );

      req.on('error', (err) => {
        server.close(() => reject(err));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  });

const withStubs = async (stubs, fn) => {
  const originals = [];
  for (const { target, method, stub } of stubs) {
    originals.push({ target, method, original: target[method] });
    target[method] = stub;
  }

  try {
    return await fn();
  } finally {
    for (const { target, method, original } of originals) {
      target[method] = original;
    }
  }
};

const setupUserRoleStub = (userId, role, roles = [role]) => {
  return [
    {
      target: userRepository,
      method: 'getUserProfileById',
      stub: async (id) => ({
        id,
        email: `${role.toLowerCase()}@unimaid.edu.ng`,
        full_name: `${role} User`,
        is_active: true,
      }),
    },
    {
      target: userRepository,
      method: 'getUserRoles',
      stub: async (id) => (id === userId ? roles : ['CUSTOMER']),
    },
  ];
};

test('Phase 15 — Admin & Moderation Panel APIs', async (t) => {
  // ===================================================
  // 1. Authentication & Role-Based Access Control (RBAC)
  // ===================================================

  await t.test('1.1 GET /api/v1/admin/stats returns 401 when no token is provided', async () => {
    const res = await request('/api/v1/admin/stats');
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  await t.test('1.2 GET /api/v1/admin/stats returns 403 for CUSTOMER role', async () => {
    const stubs = setupUserRoleStub(TEST_USER_ID, 'CUSTOMER');
    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_USER_ID });
      const res = await request('/api/v1/admin/stats', {
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });
  });

  await t.test('1.3 GET /api/v1/admin/stats returns 403 for VENDOR role', async () => {
    const stubs = setupUserRoleStub(TEST_VENDOR_USER_ID, 'VENDOR');
    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_VENDOR_USER_ID });
      const res = await request('/api/v1/admin/stats', {
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });
  });

  await t.test('1.4 GET /api/v1/admin/stats returns 403 for RIDER role', async () => {
    const stubs = setupUserRoleStub(TEST_RIDER_ID, 'RIDER');
    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_RIDER_ID });
      const res = await request('/api/v1/admin/stats', {
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });
  });

  await t.test('1.5 GET /api/v1/admin/stats succeeds with 200 for ADMIN role', async () => {
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'getDashboardStats',
        stub: async () => ({
          users: { total: 100, active: 95, inactive: 5, byRole: { CUSTOMER: 80, VENDOR: 10, RIDER: 8, ADMIN: 2, SUPER_ADMIN: 0 } },
          vendors: { total: 10, active: 8, pending: 1, suspended: 1, closed: 0, verified: 7 },
          products: { total: 50, inStock: 45, outOfStock: 5 },
          marketplace: { total: 20, pendingReview: 3, published: 15, sold: 2, rejected: 0, removed: 0 },
          services: { total: 5, active: 5 },
          orders: { total: 200, delivered: 180, cancelled: 5, pending: 15, totalRevenueKobo: '5000000', grossOrderValueKobo: '5500000' },
          deliveries: { total: 150, delivered: 140, inTransit: 5, cancelled: 5 },
        }),
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request('/api/v1/admin/stats', {
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.users.total, 100);
      assert.equal(res.body.data.vendors.total, 10);
      assert.equal(res.body.data.orders.delivered, 180);
    });
  });

  // ===================================================
  // 2. Dashboard Statistics & Campus Filtering
  // ===================================================

  await t.test('2.1 GET /api/v1/admin/dashboard alias works and supports campusId query', async () => {
    let capturedCampusId = null;
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'getDashboardStats',
        stub: async ({ campusId }) => {
          capturedCampusId = campusId;
          return {
            users: { total: 25, active: 25, inactive: 0, byRole: { CUSTOMER: 25 } },
            vendors: { total: 3, active: 3, pending: 0, suspended: 0, closed: 0, verified: 3 },
            products: { total: 12, inStock: 12, outOfStock: 0 },
            marketplace: { total: 4, pendingReview: 1, published: 3, sold: 0, rejected: 0, removed: 0 },
            services: { total: 2, active: 2 },
            orders: { total: 30, delivered: 30, totalRevenueKobo: '900000', grossOrderValueKobo: '900000' },
            deliveries: { total: 20, delivered: 20 },
          };
        },
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request('/api/v1/admin/dashboard?campusId=unimaid-main', {
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(capturedCampusId, 'unimaid-main');
      assert.equal(res.body.data.users.total, 25);
    });
  });

  // ===================================================
  // 3. Vendor Moderation & Management
  // ===================================================

  await t.test('3.1 GET /api/v1/admin/vendors lists vendors with pagination and filters', async () => {
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'listAdminVendors',
        stub: async () => [
          {
            id: SAMPLE_VENDOR_ID,
            name: 'Mama Put Kitchen',
            slug: 'mama-put-kitchen',
            status: 'PENDING',
            is_verified: false,
            owner_name: 'Amina Bello',
            owner_email: 'amina@unimaid.edu.ng',
            product_count: 5,
            order_count: 12,
          },
        ],
      },
      {
        target: adminRepository,
        method: 'countAdminVendors',
        stub: async () => 1,
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request('/api/v1/admin/vendors?status=PENDING&limit=10&offset=0', {
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.vendors.length, 1);
      assert.equal(res.body.data.vendors[0].name, 'Mama Put Kitchen');
      assert.equal(res.body.data.pagination.total, 1);
    });
  });

  await t.test('3.2 GET /api/v1/admin/vendors/:vendorId returns 404 if vendor not found', async () => {
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'getAdminVendorById',
        stub: async () => null,
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request('/api/v1/admin/vendors/unknown-vendor-id', {
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 404);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VENDOR_NOT_FOUND');
    });
  });

  await t.test('3.3 PATCH /api/v1/admin/vendors/:vendorId/status moderates status and creates audit log', async () => {
    let auditLogCreated = false;
    let notificationSent = false;

    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'getAdminVendorById',
        stub: async (id) => ({
          id,
          name: 'Mama Put Kitchen',
          slug: 'mama-put-kitchen',
          status: 'PENDING',
          is_verified: false,
          owner_user_id: TEST_VENDOR_USER_ID,
          email: 'mamaput@unimaid.edu.ng',
          owner_email: 'mamaput@unimaid.edu.ng',
        }),
      },
      {
        target: adminRepository,
        method: 'updateAdminVendor',
        stub: async (id, fields) => ({
          id,
          name: 'Mama Put Kitchen',
          slug: 'mama-put-kitchen',
          status: fields.status || 'ACTIVE',
          is_verified: fields.is_verified !== undefined ? fields.is_verified : true,
          owner_user_id: TEST_VENDOR_USER_ID,
        }),
      },
      {
        target: auditRepository,
        method: 'createAuditLog',
        stub: async (entry) => {
          auditLogCreated = true;
          assert.equal(entry.action, 'MODERATE_VENDOR');
          assert.equal(entry.resourceType, 'VENDOR');
          return { id: SAMPLE_AUDIT_LOG_ID, ...entry };
        },
      },
      {
        target: notificationService,
        method: 'notifySystemAlert',
        stub: async () => {
          notificationSent = true;
          return { id: 'notif-1' };
        },
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request(`/api/v1/admin/vendors/${SAMPLE_VENDOR_ID}/status`, {
        method: 'PATCH',
        headers: { Authorization: authHeader },
        body: { status: 'ACTIVE', isVerified: true, notes: 'Approved after document verification' },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'ACTIVE');
      assert.equal(res.body.data.is_verified, true);
      assert.equal(auditLogCreated, true);
      assert.equal(notificationSent, true);
    });
  });

  await t.test('3.4 PATCH /api/v1/admin/vendors/:vendorId/status rejects invalid status with 400', async () => {
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'getAdminVendorById',
        stub: async (id) => ({ id, status: 'PENDING' }),
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request(`/api/v1/admin/vendors/${SAMPLE_VENDOR_ID}/status`, {
        method: 'PATCH',
        headers: { Authorization: authHeader },
        body: { status: 'INVALID_STATUS' },
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'INVALID_STATUS');
    });
  });

  // ===================================================
  // 4. Product / Catalog Moderation
  // ===================================================

  await t.test('4.1 GET /api/v1/admin/products lists products with search and stock filters', async () => {
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'listAdminProducts',
        stub: async () => [
          {
            id: SAMPLE_PRODUCT_ID,
            name: 'Jollof Rice & Chicken',
            price_kobo: 150000,
            is_in_stock: true,
            vendor_name: 'Mama Put Kitchen',
            campus_name: 'UNIMAID Main Campus',
          },
        ],
      },
      {
        target: adminRepository,
        method: 'countAdminProducts',
        stub: async () => 1,
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request('/api/v1/admin/products?search=Jollof&isInStock=true', {
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.products.length, 1);
      assert.equal(res.body.data.products[0].name, 'Jollof Rice & Chicken');
    });
  });

  await t.test('4.2 PATCH /api/v1/admin/products/:productId updates stock and price with audit log', async () => {
    let auditRecorded = false;
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'getAdminProductById',
        stub: async (id) => ({
          id,
          name: 'Jollof Rice',
          price_kobo: 150000,
          is_in_stock: true,
        }),
      },
      {
        target: adminRepository,
        method: 'updateAdminProduct',
        stub: async (id, fields) => ({
          id,
          name: 'Jollof Rice',
          price_kobo: fields.price_kobo || 180000,
          is_in_stock: fields.is_in_stock !== undefined ? fields.is_in_stock : false,
        }),
      },
      {
        target: auditRepository,
        method: 'createAuditLog',
        stub: async () => {
          auditRecorded = true;
          return { id: SAMPLE_AUDIT_LOG_ID };
        },
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request(`/api/v1/admin/products/${SAMPLE_PRODUCT_ID}`, {
        method: 'PATCH',
        headers: { Authorization: authHeader },
        body: { isInStock: false, priceKobo: 180000 },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.is_in_stock, false);
      assert.equal(res.body.data.price_kobo, 180000);
      assert.equal(auditRecorded, true);
    });
  });

  await t.test('4.3 DELETE /api/v1/admin/products/:productId removes product with audit log', async () => {
    let auditRecorded = false;
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'getAdminProductById',
        stub: async (id) => ({ id, name: 'Old Product' }),
      },
      {
        target: adminRepository,
        method: 'deleteAdminProduct',
        stub: async (id) => ({ id, name: 'Old Product' }),
      },
      {
        target: auditRepository,
        method: 'createAuditLog',
        stub: async () => {
          auditRecorded = true;
          return { id: SAMPLE_AUDIT_LOG_ID };
        },
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request(`/api/v1/admin/products/${SAMPLE_PRODUCT_ID}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.message, 'Product removed successfully');
      assert.equal(auditRecorded, true);
    });
  });

  // ===================================================
  // 5. Student Marketplace Listing Moderation
  // ===================================================

  await t.test('5.1 GET /api/v1/admin/marketplace/listings returns marketplace listings with seller data', async () => {
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'listAdminMarketplaceListings',
        stub: async () => [
          {
            id: SAMPLE_LISTING_ID,
            title: 'Scientific Calculator Casio fx-991EX',
            status: 'PENDING_REVIEW',
            seller_name: 'Ibrahim Musa',
            seller_email: 'ibrahim@unimaid.edu.ng',
            price_kobo: 1200000,
          },
        ],
      },
      {
        target: adminRepository,
        method: 'countAdminMarketplaceListings',
        stub: async () => 1,
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request('/api/v1/admin/marketplace/listings?status=PENDING_REVIEW', {
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.listings.length, 1);
      assert.equal(res.body.data.listings[0].title, 'Scientific Calculator Casio fx-991EX');
    });
  });

  await t.test('5.2 POST /api/v1/admin/marketplace/listings/:id/moderate approves listing (status=PUBLISHED)', async () => {
    let notifiedSeller = false;
    let auditCreated = false;

    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'getAdminMarketplaceListingById',
        stub: async (id) => ({
          id,
          seller_user_id: TARGET_USER_ID,
          title: 'Scientific Calculator',
          status: 'PENDING_REVIEW',
          seller_email: 'ibrahim@unimaid.edu.ng',
        }),
      },
      {
        target: adminRepository,
        method: 'moderateMarketplaceListing',
        stub: async (id, { status, moderatedBy }) => ({
          id,
          status,
          moderated_by: moderatedBy,
        }),
      },
      {
        target: auditRepository,
        method: 'createAuditLog',
        stub: async () => {
          auditCreated = true;
          return { id: SAMPLE_AUDIT_LOG_ID };
        },
      },
      {
        target: notificationService,
        method: 'notifyMarketplaceListingModerated',
        stub: async () => {
          notifiedSeller = true;
          return { id: 'notif-2' };
        },
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request(`/api/v1/admin/marketplace/listings/${SAMPLE_LISTING_ID}/moderate`, {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: { action: 'APPROVE' },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'PUBLISHED');
      assert.equal(auditCreated, true);
      assert.equal(notifiedSeller, true);
    });
  });

  await t.test('5.3 POST /api/v1/admin/marketplace/listings/:id/moderate rejects listing with reason requirement', async () => {
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'getAdminMarketplaceListingById',
        stub: async (id) => ({ id, status: 'PENDING_REVIEW' }),
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      // Missing rejectionReason
      const res1 = await request(`/api/v1/admin/marketplace/listings/${SAMPLE_LISTING_ID}/moderate`, {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: { action: 'REJECT' },
      });
      assert.equal(res1.statusCode, 400);
      assert.equal(res1.body.success, false);
      assert.equal(res1.body.error.code, 'VALIDATION_ERROR');

      // With rejectionReason
      const stubsWithUpdate = [
        ...stubs,
        {
          target: adminRepository,
          method: 'moderateMarketplaceListing',
          stub: async (id, { status, rejectionReason }) => ({
            id,
            status,
            rejection_reason: rejectionReason,
          }),
        },
        {
          target: auditRepository,
          method: 'createAuditLog',
          stub: async () => ({ id: SAMPLE_AUDIT_LOG_ID }),
        },
        {
          target: notificationService,
          method: 'notifyMarketplaceListingModerated',
          stub: async () => ({ id: 'notif-3' }),
        },
      ];

      await withStubs(stubsWithUpdate, async () => {
        const res2 = await request(`/api/v1/admin/marketplace/listings/${SAMPLE_LISTING_ID}/moderate`, {
          method: 'POST',
          headers: { Authorization: authHeader },
          body: { action: 'REJECT', rejectionReason: 'Image quality is too low or prohibited item' },
        });
        assert.equal(res2.statusCode, 200);
        assert.equal(res2.body.success, true);
        assert.equal(res2.body.data.status, 'REJECTED');
        assert.equal(res2.body.data.rejection_reason, 'Image quality is too low or prohibited item');
      });
    });
  });

  // ===================================================
  // 6. Services Moderation
  // ===================================================

  await t.test('6.1 GET /api/v1/admin/services and PATCH status/price', async () => {
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'listAdminServices',
        stub: async () => [
          {
            id: SAMPLE_SERVICE_ID,
            name: 'Document Printing & Binding',
            is_active: true,
            starting_price_kobo: 50000,
          },
        ],
      },
      {
        target: adminRepository,
        method: 'countAdminServices',
        stub: async () => 1,
      },
      {
        target: adminRepository,
        method: 'getAdminServiceById',
        stub: async (id) => ({
          id,
          name: 'Document Printing & Binding',
          is_active: true,
          starting_price_kobo: 50000,
        }),
      },
      {
        target: adminRepository,
        method: 'updateAdminService',
        stub: async (id, fields) => ({
          id,
          name: 'Document Printing & Binding',
          is_active: fields.is_active !== undefined ? fields.is_active : false,
          starting_price_kobo: fields.starting_price_kobo || 70000,
        }),
      },
      {
        target: auditRepository,
        method: 'createAuditLog',
        stub: async () => ({ id: SAMPLE_AUDIT_LOG_ID }),
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const listRes = await request('/api/v1/admin/services', {
        headers: { Authorization: authHeader },
      });
      assert.equal(listRes.statusCode, 200);
      assert.equal(listRes.body.data.services.length, 1);

      const patchRes = await request(`/api/v1/admin/services/${SAMPLE_SERVICE_ID}`, {
        method: 'PATCH',
        headers: { Authorization: authHeader },
        body: { isActive: false, startingPriceKobo: 70000 },
      });
      assert.equal(patchRes.statusCode, 200);
      assert.equal(patchRes.body.data.is_active, false);
      assert.equal(patchRes.body.data.starting_price_kobo, 70000);
    });
  });

  // ===================================================
  // 7. Order Inspection & Management
  // ===================================================

  await t.test('7.1 GET /api/v1/admin/orders/:orderId retrieves full order with items and payment', async () => {
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'getAdminOrderById',
        stub: async (id) => ({
          id,
          status: 'CONFIRMED',
          total_kobo: 350000,
          customer_name: 'Fatima Abubakar',
          customer_email: 'fatima@unimaid.edu.ng',
          vendor_name: 'Campus Shawarma & Grills',
          items: [
            { id: 'item-1', product_name: 'Beef Shawarma Large', quantity: 2, unit_price_kobo: 150000 },
          ],
          payments: [
            { id: 'pay-1', provider: 'PAYSTACK', amount_kobo: 350000, status: 'SUCCESS' },
          ],
        }),
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request(`/api/v1/admin/orders/${SAMPLE_ORDER_ID}`, {
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.id, SAMPLE_ORDER_ID);
      assert.equal(res.body.data.items.length, 1);
      assert.equal(res.body.data.payments[0].status, 'SUCCESS');
    });
  });

  await t.test('7.2 PATCH /api/v1/admin/orders/:orderId/status updates status and notifies customer', async () => {
    let orderNotified = false;
    let auditCreated = false;

    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'getAdminOrderById',
        stub: async (id) => ({
          id,
          user_id: TARGET_USER_ID,
          status: 'CONFIRMED',
          customer_email: 'fatima@unimaid.edu.ng',
        }),
      },
      {
        target: adminRepository,
        method: 'updateAdminOrderStatus',
        stub: async (id, { status, cancelReason }) => ({
          id,
          status,
          notes: cancelReason ? `Cancellation Reason: ${cancelReason}` : null,
        }),
      },
      {
        target: auditRepository,
        method: 'createAuditLog',
        stub: async () => {
          auditCreated = true;
          return { id: SAMPLE_AUDIT_LOG_ID };
        },
      },
      {
        target: notificationService,
        method: 'notifyOrderStatusChanged',
        stub: async () => {
          orderNotified = true;
          return { id: 'notif-4' };
        },
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request(`/api/v1/admin/orders/${SAMPLE_ORDER_ID}/status`, {
        method: 'PATCH',
        headers: { Authorization: authHeader },
        body: { status: 'CANCELLED', cancelReason: 'Customer requested refund via helpdesk' },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'CANCELLED');
      assert.equal(auditCreated, true);
      assert.equal(orderNotified, true);
    });
  });

  // ===================================================
  // 8. Delivery Inspection & Management
  // ===================================================

  await t.test('8.1 GET /api/v1/admin/deliveries and PATCH status', async () => {
    let auditCreated = false;
    let deliveryNotified = false;

    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'listAdminDeliveries',
        stub: async () => [
          {
            id: SAMPLE_DELIVERY_ID,
            status: 'REQUESTED',
            pickup_location: 'Hostel A',
            dropoff_location: 'Faculty of Science',
            requester_name: 'Usman Ali',
          },
        ],
      },
      {
        target: adminRepository,
        method: 'countAdminDeliveries',
        stub: async () => 1,
      },
      {
        target: adminRepository,
        method: 'getAdminDeliveryById',
        stub: async (id) => ({
          id,
          requester_user_id: TARGET_USER_ID,
          status: 'REQUESTED',
          requester_email: 'usman@unimaid.edu.ng',
        }),
      },
      {
        target: adminRepository,
        method: 'updateAdminDeliveryStatus',
        stub: async (id, { status, riderUserId }) => ({
          id,
          status,
          rider_user_id: riderUserId,
        }),
      },
      {
        target: auditRepository,
        method: 'createAuditLog',
        stub: async () => {
          auditCreated = true;
          return { id: SAMPLE_AUDIT_LOG_ID };
        },
      },
      {
        target: notificationService,
        method: 'notifyDeliveryStatusChanged',
        stub: async () => {
          deliveryNotified = true;
          return { id: 'notif-5' };
        },
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const listRes = await request('/api/v1/admin/deliveries', {
        headers: { Authorization: authHeader },
      });
      assert.equal(listRes.statusCode, 200);
      assert.equal(listRes.body.data.deliveries.length, 1);

      const patchRes = await request(`/api/v1/admin/deliveries/${SAMPLE_DELIVERY_ID}/status`, {
        method: 'PATCH',
        headers: { Authorization: authHeader },
        body: { status: 'ACCEPTED', riderUserId: TEST_RIDER_ID },
      });
      assert.equal(patchRes.statusCode, 200);
      assert.equal(patchRes.body.data.status, 'ACCEPTED');
      assert.equal(patchRes.body.data.rider_user_id, TEST_RIDER_ID);
      assert.equal(auditCreated, true);
      assert.equal(deliveryNotified, true);
    });
  });

  // ===================================================
  // 9. User Profile Inspection & Role Governance
  // ===================================================

  await t.test('9.1 GET /api/v1/admin/users/:userId retrieves safe profile without secrets', async () => {
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'getAdminUserById',
        stub: async (id) => ({
          id,
          email: 'student@unimaid.edu.ng',
          full_name: 'Zainab Mohammed',
          is_active: true,
          roles: ['CUSTOMER'],
          addresses: [{ id: 'addr-1', label: 'Room 12B', is_default: true }],
          vendor: null,
          stats: { order_count: 5, listing_count: 2, delivery_request_count: 1, rider_completed_count: 0 },
        }),
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request(`/api/v1/admin/users/${TARGET_USER_ID}`, {
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.email, 'student@unimaid.edu.ng');
      assert.equal(res.body.data.stats.order_count, 5);
      assert.equal(res.body.data.password, undefined);
      assert.equal(res.body.data.password_hash, undefined);
    });
  });

  await t.test('9.2 PATCH /api/v1/admin/users/:userId/status toggles account active status', async () => {
    let auditCreated = false;
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: adminRepository,
        method: 'getAdminUserById',
        stub: async (id) => ({
          id,
          is_active: true,
          roles: ['CUSTOMER'],
        }),
      },
      {
        target: adminRepository,
        method: 'updateAdminUserStatus',
        stub: async (id, { isActive }) => ({
          id,
          is_active: isActive,
        }),
      },
      {
        target: auditRepository,
        method: 'createAuditLog',
        stub: async () => {
          auditCreated = true;
          return { id: SAMPLE_AUDIT_LOG_ID };
        },
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request(`/api/v1/admin/users/${TARGET_USER_ID}/status`, {
        method: 'PATCH',
        headers: { Authorization: authHeader },
        body: { isActive: false },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.is_active, false);
      assert.equal(auditCreated, true);
    });
  });

  await t.test('9.3 POST /api/v1/admin/users/:userId/roles returns 403 for regular ADMIN (Super Admin only)', async () => {
    const stubs = setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN');
    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request(`/api/v1/admin/users/${TARGET_USER_ID}/roles`, {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: { role: 'VENDOR' },
      });
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });
  });

  await t.test('9.4 SUPER_ADMIN can assign, remove, and replace roles', async () => {
    let auditCount = 0;
    const stubs = [
      ...setupUserRoleStub(TEST_SUPER_ADMIN_ID, 'SUPER_ADMIN'),
      {
        target: adminRepository,
        method: 'getAdminUserById',
        stub: async (id) => ({
          id,
          is_active: true,
          roles: ['CUSTOMER'],
        }),
      },
      {
        target: adminRepository,
        method: 'assignUserRole',
        stub: async (id, role) => ['CUSTOMER', role],
      },
      {
        target: adminRepository,
        method: 'removeUserRole',
        stub: async () => ['CUSTOMER'],
      },
      {
        target: adminRepository,
        method: 'setUserRoles',
        stub: async (id, roles) => roles,
      },
      {
        target: auditRepository,
        method: 'createAuditLog',
        stub: async () => {
          auditCount++;
          return { id: SAMPLE_AUDIT_LOG_ID };
        },
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_SUPER_ADMIN_ID });

      // 1. Assign role
      const assignRes = await request(`/api/v1/admin/users/${TARGET_USER_ID}/roles`, {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: { role: 'VENDOR' },
      });
      assert.equal(assignRes.statusCode, 200);
      assert.equal(assignRes.body.success, true);
      assert.deepEqual(assignRes.body.data.roles, ['CUSTOMER', 'VENDOR']);

      // 2. Remove role
      const removeRes = await request(`/api/v1/admin/users/${TARGET_USER_ID}/roles/VENDOR`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      });
      assert.equal(removeRes.statusCode, 200);
      assert.equal(removeRes.body.success, true);
      assert.deepEqual(removeRes.body.data.roles, ['CUSTOMER']);

      // 3. Set roles
      const setRes = await request(`/api/v1/admin/users/${TARGET_USER_ID}/roles`, {
        method: 'PUT',
        headers: { Authorization: authHeader },
        body: { roles: ['CUSTOMER', 'RIDER'] },
      });
      assert.equal(setRes.statusCode, 200);
      assert.equal(setRes.body.success, true);
      assert.deepEqual(setRes.body.data.roles, ['CUSTOMER', 'RIDER']);

      assert.equal(auditCount, 3);
    });
  });

  // ===================================================
  // 10. Audit Log Retrieval & Inspection
  // ===================================================

  await t.test('10.1 GET /api/v1/admin/audit-logs lists audit entries with filtering', async () => {
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: auditRepository,
        method: 'listAuditLogs',
        stub: async () => [
          {
            id: SAMPLE_AUDIT_LOG_ID,
            actor_user_id: TEST_ADMIN_ID,
            action: 'MODERATE_VENDOR',
            resource_type: 'VENDOR',
            resource_id: SAMPLE_VENDOR_ID,
            changes: { updated: { status: 'ACTIVE' } },
            actor_name: 'Admin User',
            actor_email: 'admin@unimaid.edu.ng',
            created_at: '2026-08-23T10:00:00Z',
          },
        ],
      },
      {
        target: auditRepository,
        method: 'countAuditLogs',
        stub: async () => 1,
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request('/api/v1/admin/audit-logs?resourceType=VENDOR&action=MODERATE', {
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.auditLogs.length, 1);
      assert.equal(res.body.data.auditLogs[0].action, 'MODERATE_VENDOR');
      assert.equal(res.body.data.auditLogs[0].actor_email, 'admin@unimaid.edu.ng');
    });
  });

  await t.test('10.2 GET /api/v1/admin/audit-logs/:logId gets single audit log entry', async () => {
    const stubs = [
      ...setupUserRoleStub(TEST_ADMIN_ID, 'ADMIN'),
      {
        target: auditRepository,
        method: 'getAuditLogById',
        stub: async (id) => ({
          id,
          actor_user_id: TEST_ADMIN_ID,
          action: 'MODERATE_VENDOR',
          resource_type: 'VENDOR',
          resource_id: SAMPLE_VENDOR_ID,
          changes: { updated: { status: 'ACTIVE' } },
          actor_name: 'Admin User',
        }),
      },
    ];

    await withStubs(stubs, async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });
      const res = await request(`/api/v1/admin/audit-logs/${SAMPLE_AUDIT_LOG_ID}`, {
        headers: { Authorization: authHeader },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.id, SAMPLE_AUDIT_LOG_ID);
      assert.equal(res.body.data.action, 'MODERATE_VENDOR');
    });
  });
});
