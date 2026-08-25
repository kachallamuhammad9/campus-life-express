const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const config = require('../src/config/env');
const gasRepository = require('../src/repositories/gasRepository');
const marketplaceRepository = require('../src/repositories/marketplaceRepository');
const userRepository = require('../src/repositories/userRepository');
const gasService = require('../src/services/gasService');
const {
  TEST_USER_ID,
  TEST_ADMIN_ID,
  getAuthHeader,
} = require('./helpers/authHelper');

const SAMPLE_API_KEY = config.gasIntegrationKey || 'clx-dev-gas-secret-key-32-chars-sauki';
const CAMPUS_ID = '00000000-0000-4000-8000-000000000001';
const VENDOR_ID = '00000000-0000-4000-8000-000000000010';
const LISTING_ID = '00000000-0000-4000-8000-000000000050';

const SAMPLE_SALES_REPORT = {
  summary: {
    total_orders: 120,
    delivered_orders: 100,
    cancelled_orders: 5,
    pending_orders: 10,
    confirmed_orders: 5,
    paid_orders: 110,
    pending_payment_orders: 10,
    total_gmv_kobo: 65000000,
    total_paid_revenue_kobo: 60000000,
    total_delivery_fees_kobo: 6000000,
    total_service_fees_kobo: 3000000,
    avg_order_value_kobo: 541666,
  },
  paymentMethods: [
    { payment_method: 'CASH_ON_DELIVERY', order_count: 80, total_kobo: 45000000 },
    { payment_method: 'BANK_TRANSFER', order_count: 40, total_kobo: 20000000 },
  ],
  orderStatuses: [
    { order_status: 'DELIVERED', order_count: 100, total_kobo: 55000000 },
    { order_status: 'PENDING', order_count: 15, total_kobo: 7500000 },
    { order_status: 'CANCELLED', order_count: 5, total_kobo: 2500000 },
  ],
  campuses: [
    {
      campus_id: CAMPUS_ID,
      campus_name: 'University of Maiduguri',
      campus_code: 'UNIMAID',
      campus_slug: 'unimaid',
      order_count: 120,
      total_kobo: 65000000,
      paid_revenue_kobo: 60000000,
    },
  ],
  dailyTimeline: [
    {
      report_date: '2026-08-20',
      order_count: 40,
      total_kobo: 20000000,
      paid_kobo: 18000000,
    },
    {
      report_date: '2026-08-21',
      order_count: 80,
      total_kobo: 45000000,
      paid_kobo: 42000000,
    },
  ],
};

const SAMPLE_CAMPUS_SUMMARY = [
  {
    campus_id: CAMPUS_ID,
    campus_name: 'University of Maiduguri',
    campus_code: 'UNIMAID',
    campus_slug: 'unimaid',
    city: 'Maiduguri',
    state: 'Borno',
    is_active: true,
    active_vendors_count: 15,
    active_products_count: 120,
    active_services_count: 8,
    active_marketplace_count: 45,
    total_orders_count: 120,
    total_order_revenue_kobo: 65000000,
    delivery_requests_count: 35,
    service_requests_count: 12,
  },
];

const SAMPLE_VENDOR_ANALYTICS = [
  {
    vendor_id: VENDOR_ID,
    vendor_name: 'Mama Put Special',
    vendor_slug: 'mama-put-special',
    vendor_status: 'ACTIVE',
    is_verified: true,
    current_rating: 4.8,
    review_count: 42,
    category_name: 'Food & Dining',
    category_slug: 'food-dining',
    owner_name: 'Vendor Owner',
    owner_email: 'vendor@unimaid.edu.ng',
    total_orders: 85,
    delivered_orders: 80,
    cancelled_orders: 2,
    total_gross_kobo: 48000000,
    total_paid_kobo: 45000000,
    active_products_count: 18,
  },
];

const SAMPLE_EXPORT_ORDERS = [
  {
    order_id: '00000000-0000-4000-8000-000000000501',
    created_at: '2026-08-22T10:00:00.000Z',
    order_status: 'DELIVERED',
    order_type: 'DELIVERY',
    payment_method: 'CASH_ON_DELIVERY',
    payment_status: 'PAID',
    subtotal_kobo: 500000,
    delivery_fee_kobo: 50000,
    service_fee_kobo: 25000,
    total_kobo: 575000,
    delivery_address: 'Hostel A Room 12',
    phone_number: '08012345678',
    notes: 'Please hurry',
    delivered_at: '2026-08-22T11:00:00.000Z',
    cancelled_at: null,
    customer_user_id: TEST_USER_ID,
    customer_name: 'Student Buyer',
    customer_email: 'student@unimaid.edu.ng',
    customer_registered_phone: '08012345678',
    vendor_id: VENDOR_ID,
    vendor_name: 'Mama Put Special',
    vendor_slug: 'mama-put-special',
    campus_id: CAMPUS_ID,
    campus_name: 'University of Maiduguri',
    campus_code: 'UNIMAID',
    delivery_zone_name: 'Hostels Zone',
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000020',
        quantity: 2,
        unitPriceKobo: 250000,
        totalPriceKobo: 500000,
      },
    ],
  },
];

const SAMPLE_LISTING = {
  id: LISTING_ID,
  title: 'Engineering Textbook',
  description: 'Used 200 Level Textbook',
  price_kobo: 650000,
  condition: 'GOOD',
  status: 'PENDING_REVIEW',
  seller_email: 'student@unimaid.edu.ng',
  seller_contact_phone: '08012345678',
  created_at: '2026-08-20T10:00:00.000Z',
  updated_at: '2026-08-20T10:00:00.000Z',
};

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
        }
      );

      req.on('error', (error) => server.close(() => reject(error)));

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  });

const withStubs = async (stubs, fn) => {
  const originals = [];
  for (const [targetModule, methods] of stubs) {
    for (const [methodName, stubFn] of Object.entries(methods)) {
      originals.push({
        targetModule,
        methodName,
        orig: targetModule[methodName],
      });
      targetModule[methodName] = stubFn;
    }
  }

  try {
    return await fn();
  } finally {
    for (const { targetModule, methodName, orig } of originals) {
      targetModule[methodName] = orig;
    }
  }
};

const gasApiKeyHeaders = (key = SAMPLE_API_KEY) => ({
  'X-GAS-API-Key': key,
});

const adminAuthHeader = () =>
  getAuthHeader({
    sub: TEST_ADMIN_ID,
    email: 'admin@unimaid.edu.ng',
    app_metadata: { role: 'ADMIN' },
  });

const customerAuthHeader = () =>
  getAuthHeader({
    sub: TEST_USER_ID,
    email: 'student@unimaid.edu.ng',
  });

const setupUserAuthMocks = () => [
  [
    userRepository,
    {
      getUserProfileById: async (id) => {
        if (id === TEST_ADMIN_ID) {
          return {
            id: TEST_ADMIN_ID,
            email: 'admin@unimaid.edu.ng',
            full_name: 'Admin User',
            is_active: true,
          };
        }
        if (id === TEST_USER_ID) {
          return {
            id: TEST_USER_ID,
            email: 'student@unimaid.edu.ng',
            full_name: 'Student Buyer',
            is_active: true,
          };
        }
        return null;
      },
      getUserRoles: async (id) => {
        if (id === TEST_ADMIN_ID) return ['ADMIN'];
        if (id === TEST_USER_ID) return ['CUSTOMER'];
        return [];
      },
    },
  ],
];

// ==========================================
// TEST SUITE: Google Apps Script Integration
// ==========================================

test('1. Security Boundary & Authentication', async (t) => {
  await t.test('1.1 Rejects request with missing authentication credentials', async () => {
    const res = await request('/api/v1/integrations/gas/status');
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  await t.test('1.2 Rejects request with invalid API key', async () => {
    const res = await request('/api/v1/integrations/gas/status', {
      headers: { 'X-GAS-API-Key': 'invalid-secret-key-12345' },
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  await t.test('1.3 Rejects request from authenticated non-admin customer', async () => {
    await withStubs(setupUserAuthMocks(), async () => {
      const res = await request('/api/v1/integrations/gas/status', {
        headers: { Authorization: customerAuthHeader() },
      });
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });
  });

  await t.test('1.4 Allows access with valid X-GAS-API-Key header', async () => {
    const res = await request('/api/v1/integrations/gas/status', {
      headers: gasApiKeyHeaders(),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.authType, 'API_KEY');
    assert.equal(res.body.data.status, 'ACTIVE');
  });

  await t.test('1.5 Allows access with alternative X-Integration-Key header', async () => {
    const res = await request('/api/v1/integrations/gas/status', {
      headers: { 'X-Integration-Key': SAMPLE_API_KEY },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.authType, 'API_KEY');
  });

  await t.test('1.6 Allows access with valid Admin JWT token', async () => {
    await withStubs(setupUserAuthMocks(), async () => {
      const res = await request('/api/v1/integrations/gas/status', {
        headers: { Authorization: adminAuthHeader() },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.authType, 'JWT_ADMIN');
    });
  });
});

test('2. Administrative Sales Reporting', async (t) => {
  await t.test('2.1 GET /api/v1/integrations/gas/reports/sales returns complete aggregated report', async () => {
    await withStubs(
      [
        [
          gasRepository,
          {
            getSalesReport: async () => SAMPLE_SALES_REPORT,
          },
        ],
      ],
      async () => {
        const res = await request('/api/v1/integrations/gas/reports/sales', {
          headers: gasApiKeyHeaders(),
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        const { summary, campuses, paymentMethods, orderStatuses, dailyTimeline } =
          res.body.data;

        assert.equal(summary.totalOrders, 120);
        assert.equal(summary.deliveredOrders, 100);
        assert.equal(summary.totalGmvKobo, 65000000);
        assert.equal(summary.totalGmvNaira, 650000);
        assert.ok(summary.totalGmvFormatted.includes('650,000.00'));
        assert.equal(summary.fulfillmentRatePercent, 83.3);
        assert.equal(campuses.length, 1);
        assert.equal(campuses[0].campusCode, 'UNIMAID');
        assert.equal(paymentMethods.length, 2);
        assert.equal(orderStatuses.length, 3);
        assert.equal(dailyTimeline.length, 2);
      }
    );
  });

  await t.test('2.2 Filters by valid date range and campus', async () => {
    let capturedFilters = null;
    await withStubs(
      [
        [
          gasRepository,
          {
            getSalesReport: async (filters) => {
              capturedFilters = filters;
              return SAMPLE_SALES_REPORT;
            },
          },
        ],
      ],
      async () => {
        const res = await request(
          `/api/v1/integrations/gas/reports/sales?startDate=2026-08-01T00:00:00Z&endDate=2026-08-20T23:59:59Z&campusId=${CAMPUS_ID}`,
          { headers: gasApiKeyHeaders() }
        );
        assert.equal(res.statusCode, 200);
        assert.equal(capturedFilters.campusId, CAMPUS_ID);
        assert.equal(capturedFilters.startDate, '2026-08-01T00:00:00Z');
        assert.equal(capturedFilters.endDate, '2026-08-20T23:59:59Z');
      }
    );
  });

  await t.test('2.3 Rejects invalid date format with 400 INVALID_DATE_FORMAT', async () => {
    const res = await request(
      '/api/v1/integrations/gas/reports/sales?startDate=not-a-valid-date',
      { headers: gasApiKeyHeaders() }
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_DATE_FORMAT');
  });

  await t.test('2.4 Handles zero orders / empty state gracefully without errors', async () => {
    await withStubs(
      [
        [
          gasRepository,
          {
            getSalesReport: async () => ({
              summary: {},
              paymentMethods: [],
              orderStatuses: [],
              campuses: [],
              dailyTimeline: [],
            }),
          },
        ],
      ],
      async () => {
        const res = await request('/api/v1/integrations/gas/reports/sales', {
          headers: gasApiKeyHeaders(),
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.summary.totalOrders, 0);
        assert.equal(res.body.data.summary.totalGmvKobo, 0);
        assert.equal(res.body.data.summary.fulfillmentRatePercent, 0);
      }
    );
  });
});

test('3. Campus Performance Summaries', async (t) => {
  await t.test('3.1 GET /api/v1/integrations/gas/reports/campus-summary returns campus stats and platform totals', async () => {
    await withStubs(
      [
        [
          gasRepository,
          {
            getCampusSummary: async () => SAMPLE_CAMPUS_SUMMARY,
          },
        ],
      ],
      async () => {
        const res = await request('/api/v1/integrations/gas/reports/campus-summary', {
          headers: gasApiKeyHeaders(),
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.campusesCount, 1);
        assert.equal(res.body.data.totals.activeVendors, 15);
        assert.equal(res.body.data.totals.totalOrders, 120);
        assert.equal(res.body.data.campuses[0].campusCode, 'UNIMAID');
      }
    );
  });
});

test('4. Vendor Analytics', async (t) => {
  await t.test('4.1 GET /api/v1/integrations/gas/reports/vendor-analytics returns rankings and metrics', async () => {
    await withStubs(
      [
        [
          gasRepository,
          {
            getVendorAnalytics: async () => SAMPLE_VENDOR_ANALYTICS,
          },
        ],
      ],
      async () => {
        const res = await request(
          '/api/v1/integrations/gas/reports/vendor-analytics?limit=10&offset=0',
          { headers: gasApiKeyHeaders() }
        );
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.vendors.length, 1);
        const vendor = res.body.data.vendors[0];
        assert.equal(vendor.vendorName, 'Mama Put Special');
        assert.equal(vendor.totalOrders, 85);
        assert.equal(vendor.deliveredOrders, 80);
        assert.equal(vendor.fulfillmentRatePercent, 94.1);
        assert.equal(vendor.totalGrossKobo, 48000000);
      }
    );
  });
});

test('5. Backup & Data Export Functionality', async (t) => {
  await t.test('5.1 Exports orders in JSON format', async () => {
    await withStubs(
      [
        [
          gasRepository,
          {
            getExportOrders: async () => SAMPLE_EXPORT_ORDERS,
          },
        ],
      ],
      async () => {
        const res = await request('/api/v1/integrations/gas/export/orders?format=json', {
          headers: gasApiKeyHeaders(),
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.domain, 'orders');
        assert.equal(res.body.data.rowCount, 1);
        assert.equal(res.body.data.data[0].vendor_name, 'Mama Put Special');
      }
    );
  });

  await t.test('5.2 Exports orders in RFC 4180 CSV format', async () => {
    await withStubs(
      [
        [
          gasRepository,
          {
            getExportOrders: async () => SAMPLE_EXPORT_ORDERS,
          },
        ],
      ],
      async () => {
        const res = await request('/api/v1/integrations/gas/export/orders?format=csv', {
          headers: gasApiKeyHeaders(),
        });
        assert.equal(res.statusCode, 200);
        assert.ok(res.headers['content-type'].includes('text/csv'));
        assert.ok(res.headers['content-disposition'].includes('attachment; filename='));
        assert.ok(typeof res.body === 'string');
        assert.ok(res.body.includes('order_id,created_at,order_status'));
        assert.ok(res.body.includes('Mama Put Special'));
      }
    );
  });

  await t.test('5.3 Exports vendors dataset', async () => {
    await withStubs(
      [
        [
          gasRepository,
          {
            getExportVendors: async () => [
              {
                vendor_id: VENDOR_ID,
                vendor_name: 'Mama Put Special',
                slug: 'mama-put-special',
                status: 'ACTIVE',
              },
            ],
          },
        ],
      ],
      async () => {
        const res = await request('/api/v1/integrations/gas/export/vendors', {
          headers: gasApiKeyHeaders(),
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.domain, 'vendors');
        assert.equal(res.body.data.rowCount, 1);
      }
    );
  });

  await t.test('5.4 Rejects unsupported domain with 400 INVALID_EXPORT_DOMAIN', async () => {
    const res = await request('/api/v1/integrations/gas/export/unsupported-domain', {
      headers: gasApiKeyHeaders(),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_EXPORT_DOMAIN');
  });

  await t.test('5.5 GET /api/v1/integrations/gas/export/snapshot returns full platform backup snapshot', async () => {
    await withStubs(
      [
        [
          gasRepository,
          {
            getSystemSnapshot: async () => ({
              profiles_count: 500,
              active_campuses_count: 2,
              active_vendors_count: 35,
              in_stock_products_count: 240,
              active_services_count: 15,
              published_listings_count: 85,
              total_orders_count: 450,
              delivered_orders_count: 410,
              delivery_requests_count: 90,
              service_requests_count: 40,
              successful_payments_count: 420,
              platform_gmv_kobo: 120000000,
              platform_collected_revenue_kobo: 115000000,
            }),
          },
        ],
      ],
      async () => {
        const res = await request('/api/v1/integrations/gas/export/snapshot', {
          headers: gasApiKeyHeaders(),
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.system, 'Campus Life Express (CLX) API');
        assert.equal(res.body.data.metrics.registeredProfiles, 500);
        assert.equal(res.body.data.metrics.totalPlatformGmvKobo, 120000000);
        assert.ok(res.body.data.metrics.totalPlatformGmvFormatted.includes('1,200,000.00'));
      }
    );
  });
});

test('6. Notification Dispatching Hooks & Audit Logs', async (t) => {
  gasService.clearNotificationLogs();

  await t.test('6.1 Dispatches notification hook and logs event', async () => {
    const res = await request('/api/v1/integrations/gas/notifications/dispatch', {
      method: 'POST',
      headers: gasApiKeyHeaders(),
      body: {
        eventType: 'ORDER_CREATED',
        entityId: '00000000-0000-4000-8000-000000000501',
        payload: {
          orderId: '00000000-0000-4000-8000-000000000501',
          totalKobo: 575000,
          vendorName: 'Mama Put Special',
        },
        recipientEmail: 'vendor@unimaid.edu.ng',
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.eventType, 'ORDER_CREATED');
    assert.ok(res.body.data.eventId);
    assert.ok(res.body.data.signature);
  });

  await t.test('6.2 Rejects invalid eventType with 400 INVALID_EVENT_TYPE', async () => {
    const res = await request('/api/v1/integrations/gas/notifications/dispatch', {
      method: 'POST',
      headers: gasApiKeyHeaders(),
      body: {
        eventType: 'UNKNOWN_EVENT_TRIGGER',
        payload: {},
      },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_EVENT_TYPE');
  });

  await t.test('6.3 GET /api/v1/integrations/gas/notifications/logs retrieves logged dispatches', async () => {
    const res = await request('/api/v1/integrations/gas/notifications/logs?limit=10', {
      headers: gasApiKeyHeaders(),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.totalLogs >= 1);
    assert.equal(res.body.data.logs[0].eventType, 'ORDER_CREATED');
  });
});

test('7. Marketplace Moderation Sync from Google Apps Script', async (t) => {
  await t.test('7.1 Approves marketplace listing', async () => {
    let updatedPayload = null;
    await withStubs(
      [
        [
          marketplaceRepository,
          {
            getListingById: async () => SAMPLE_LISTING,
            updateListing: async (id, fields) => {
              updatedPayload = { id, fields };
              return { ...SAMPLE_LISTING, ...fields, updated_at: new Date().toISOString() };
            },
          },
        ],
      ],
      async () => {
        const res = await request('/api/v1/integrations/gas/sync/marketplace-moderation', {
          method: 'POST',
          headers: gasApiKeyHeaders(),
          body: {
            listingId: LISTING_ID,
            action: 'APPROVE',
            moderatorNotes: 'Verified compliant with campus student trade rules',
          },
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.status, 'PUBLISHED');
        assert.equal(res.body.data.action, 'APPROVE');
        assert.equal(updatedPayload.fields.status, 'PUBLISHED');
      }
    );
  });

  await t.test('7.2 Rejects marketplace listing with reason', async () => {
    let updatedPayload = null;
    await withStubs(
      [
        [
          marketplaceRepository,
          {
            getListingById: async () => SAMPLE_LISTING,
            updateListing: async (id, fields) => {
              updatedPayload = { id, fields };
              return { ...SAMPLE_LISTING, ...fields, updated_at: new Date().toISOString() };
            },
          },
        ],
      ],
      async () => {
        const res = await request('/api/v1/integrations/gas/sync/marketplace-moderation', {
          method: 'POST',
          headers: gasApiKeyHeaders(),
          body: {
            listingId: LISTING_ID,
            action: 'REJECT',
            reason: 'Item is prohibited on campus premises',
          },
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.status, 'REJECTED');
        assert.equal(updatedPayload.fields.status, 'REJECTED');
        assert.equal(updatedPayload.fields.rejection_reason, 'Item is prohibited on campus premises');
      }
    );
  });

  await t.test('7.3 Flags suspicious marketplace listing', async () => {
    let updatedPayload = null;
    await withStubs(
      [
        [
          marketplaceRepository,
          {
            getListingById: async () => SAMPLE_LISTING,
            updateListing: async (id, fields) => {
              updatedPayload = { id, fields };
              return { ...SAMPLE_LISTING, ...fields, updated_at: new Date().toISOString() };
            },
          },
        ],
      ],
      async () => {
        const res = await request('/api/v1/integrations/gas/sync/marketplace-moderation', {
          method: 'POST',
          headers: gasApiKeyHeaders(),
          body: {
            listingId: LISTING_ID,
            action: 'FLAG_SUSPICIOUS',
            reason: 'Possible counterfeit item',
          },
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.status, 'SUSPENDED');
        assert.equal(updatedPayload.fields.status, 'SUSPENDED');
      }
    );
  });

  await t.test('7.4 Returns 404 for non-existent listing', async () => {
    await withStubs(
      [
        [
          marketplaceRepository,
          {
            getListingById: async () => null,
          },
        ],
      ],
      async () => {
        const res = await request('/api/v1/integrations/gas/sync/marketplace-moderation', {
          method: 'POST',
          headers: gasApiKeyHeaders(),
          body: {
            listingId: '00000000-0000-4000-8000-000000000999',
            action: 'APPROVE',
          },
        });

        assert.equal(res.statusCode, 404);
        assert.equal(res.body.error.code, 'LISTING_NOT_FOUND');
      }
    );
  });
});

test('8. Dual Route Alias & Error Handling', async (t) => {
  await t.test('8.1 Routes accessible via /api/v1/integrations/google-apps-script alias', async () => {
    const res = await request('/api/v1/integrations/google-apps-script/status', {
      headers: gasApiKeyHeaders(),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
  });

  await t.test('8.2 Repository error returns safe 500 error response', async () => {
    await withStubs(
      [
        [
          gasRepository,
          {
            getSalesReport: async () => {
              throw new Error('Database connection pool timeout');
            },
          },
        ],
      ],
      async () => {
        const res = await request('/api/v1/integrations/gas/reports/sales', {
          headers: gasApiKeyHeaders(),
        });
        assert.equal(res.statusCode, 500);
        assert.equal(res.body.success, false);
      }
    );
  });
});
