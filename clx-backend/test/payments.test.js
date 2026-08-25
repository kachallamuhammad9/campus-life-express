const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const paymentRepository = require('../src/repositories/paymentRepository');
const userRepository = require('../src/repositories/userRepository');
const paymentService = require('../src/services/paymentService');
const {
  TEST_USER_ID,
  TEST_ADMIN_ID,
  getAuthHeader,
} = require('./helpers/authHelper');

const OTHER_USER_ID = '00000000-0000-4000-8000-000000000099';
const ORDER_ID_1 = '00000000-0000-4000-8000-000000000501';
const ORDER_ID_2 = '00000000-0000-4000-8000-000000000502';
const PAYMENT_ID_1 = '00000000-0000-4000-8000-000000000701';
const PAYMENT_ID_2 = '00000000-0000-4000-8000-000000000702';
const CAMPUS_ID = '00000000-0000-4000-8000-000000000001';
const VENDOR_ID = '00000000-0000-4000-8000-000000000010';

const SAMPLE_USER_PROFILE = {
  id: TEST_USER_ID,
  email: 'student@unimaid.edu.ng',
  full_name: 'Student Buyer',
  phone_number: '08012345678',
  default_campus_id: CAMPUS_ID,
  is_active: true,
};

const SAMPLE_ORDER = {
  id: ORDER_ID_1,
  user_id: TEST_USER_ID,
  vendor_id: VENDOR_ID,
  campus_id: CAMPUS_ID,
  delivery_zone_id: null,
  delivery_request_id: null,
  delivery_address: 'Hostel A Block 4 Room 12',
  phone_number: '08012345678',
  type: 'DELIVERY',
  subtotal_kobo: 500000,
  delivery_fee_kobo: 50000,
  service_fee_kobo: 25000,
  total_kobo: 575000,
  payment_method: 'CASH_ON_DELIVERY',
  payment_status: 'PENDING',
  status: 'PENDING',
  notes: 'Ring phone on arrival',
  created_at: '2026-08-22T12:00:00.000Z',
  updated_at: '2026-08-22T12:00:00.000Z',
  delivered_at: null,
  cancelled_at: null,
};

const SAMPLE_PAYMENT = {
  id: PAYMENT_ID_1,
  order_id: ORDER_ID_1,
  provider: 'CASH_ON_DELIVERY',
  provider_reference: null,
  amount_kobo: 575000,
  status: 'PENDING',
  paid_at: null,
  created_at: '2026-08-22T12:00:00.000Z',
  user_id: TEST_USER_ID,
  payment_method: 'CASH_ON_DELIVERY',
  total_kobo: 575000,
  order_status: 'PENDING',
  order_payment_status: 'PENDING',
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
});

const withStubs = async (stubs, fn) => {
  const originals = [];
  for (const [targetModule, methods] of stubs) {
    for (const [methodName, stubFn] of Object.entries(methods)) {
      originals.push({ targetModule, methodName, orig: targetModule[methodName] });
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

const customerAuthHeader = () => getAuthHeader({
  sub: TEST_USER_ID,
  email: 'student@unimaid.edu.ng',
});

const otherUserAuthHeader = () => getAuthHeader({
  sub: OTHER_USER_ID,
  email: 'other@unimaid.edu.ng',
});

const adminAuthHeader = () => getAuthHeader({
  sub: TEST_ADMIN_ID,
  email: 'admin@unimaid.edu.ng',
  app_metadata: { role: 'ADMIN' },
});

const setupAuthMocks = (extra = {}) => [
  [userRepository, {
    getUserProfileById: async (id) => {
      if (id === TEST_USER_ID) return SAMPLE_USER_PROFILE;
      if (id === TEST_ADMIN_ID) return { id: TEST_ADMIN_ID, email: 'admin@unimaid.edu.ng', full_name: 'Admin', is_active: true };
      if (id === OTHER_USER_ID) return { id: OTHER_USER_ID, email: 'other@unimaid.edu.ng', full_name: 'Other User', is_active: true };
      return null;
    },
    getUserRoles: async (id) => {
      if (id === TEST_USER_ID) return ['CUSTOMER'];
      if (id === TEST_ADMIN_ID) return ['ADMIN'];
      if (id === OTHER_USER_ID) return ['CUSTOMER'];
      return ['CUSTOMER'];
    },
    ...extra,
  }],
];

// ==========================================
// 1. AUTHENTICATION & AUTHORIZATION GUARDS
// ==========================================

test('1. POST /api/v1/payments/initialize rejects unauthenticated request with 401', async () => {
  const response = await request('/api/v1/payments/initialize', {
    method: 'POST',
    body: { orderId: ORDER_ID_1 },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('2. GET /api/v1/payments/orders/:orderId rejects unauthenticated request with 401', async () => {
  const response = await request(`/api/v1/payments/orders/${ORDER_ID_1}`, {
    method: 'GET',
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('3. GET /api/v1/payments/:paymentId rejects unauthenticated request with 401', async () => {
  const response = await request(`/api/v1/payments/${PAYMENT_ID_1}`, {
    method: 'GET',
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('4. POST /api/v1/payments/cash-on-delivery rejects unauthenticated request with 401', async () => {
  const response = await request('/api/v1/payments/cash-on-delivery', {
    method: 'POST',
    body: { orderId: ORDER_ID_1 },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

// ==========================================
// 2. PAYMENT INITIALIZATION & SERVER TOTAL ENFORCEMENT
// ==========================================

test('5. POST /api/v1/payments/initialize initializes payment with server-authoritative integer kobo total', async () => {
  let createdPaymentPayload = null;

  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async (id) => (id === ORDER_ID_1 ? SAMPLE_ORDER : null),
      createOrderPayment: async (payload) => {
        createdPaymentPayload = payload;
        return {
          id: PAYMENT_ID_1,
          order_id: payload.orderId,
          provider: payload.provider,
          provider_reference: payload.providerReference,
          amount_kobo: payload.amountKobo,
          status: payload.status,
          paid_at: null,
          created_at: '2026-08-22T12:00:00.000Z',
        };
      },
      updateOrderPaymentInfo: async () => ({ id: ORDER_ID_1 }),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/initialize', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: {
        orderId: ORDER_ID_1,
        paymentMethod: 'CARD',
        amountKobo: 100, // Client attempting to tamper with amount -> MUST be ignored
        status: 'PAID',  // Client attempting to tamper with status -> MUST be ignored
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.amountKobo, 575000); // Authoritative from SAMPLE_ORDER
    assert.equal(response.body.data.amountNgn, 5750);
    assert.equal(response.body.data.paymentStatus, 'PENDING');
    assert.equal(response.body.data.paymentMethod, 'CARD');

    // Verify repository received authoritative total kobo and pending status
    assert.equal(createdPaymentPayload.amountKobo, 575000);
    assert.equal(createdPaymentPayload.status, 'PENDING');
  });
});

test('6. POST /api/v1/payments/orders/:orderId/initialize initializes payment via URL parameter route', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async (id) => (id === ORDER_ID_1 ? SAMPLE_ORDER : null),
      createOrderPayment: async (payload) => ({
        id: PAYMENT_ID_1,
        order_id: payload.orderId,
        provider: payload.provider,
        provider_reference: payload.providerReference,
        amount_kobo: payload.amountKobo,
        status: payload.status,
        paid_at: null,
        created_at: '2026-08-22T12:00:00.000Z',
      }),
      updateOrderPaymentInfo: async () => ({ id: ORDER_ID_1 }),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/payments/orders/${ORDER_ID_1}/initialize`, {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: { paymentMethod: 'BANK_TRANSFER' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.paymentMethod, 'BANK_TRANSFER');
    assert.equal(response.body.data.amountKobo, 575000);
  });
});

test('7. POST /api/v1/payments/initialize rejects when order is cancelled', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async () => ({
        ...SAMPLE_ORDER,
        status: 'CANCELLED',
      }),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/initialize', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: { orderId: ORDER_ID_1, paymentMethod: 'CARD' },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'ORDER_CANCELLED');
  });
});

test('8. POST /api/v1/payments/initialize rejects when order is already paid', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async () => ({
        ...SAMPLE_ORDER,
        payment_status: 'PAID',
      }),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/initialize', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: { orderId: ORDER_ID_1, paymentMethod: 'CARD' },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'ORDER_ALREADY_PAID');
  });
});

test('9. POST /api/v1/payments/initialize rejects invalid payment method', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async () => SAMPLE_ORDER,
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/initialize', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: { orderId: ORDER_ID_1, paymentMethod: 'CRYPTO_UNSUPPORTED' },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  });
});

test('10. POST /api/v1/payments/initialize prevents cross-user access with 404', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async () => SAMPLE_ORDER, // Belongs to TEST_USER_ID
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/initialize', {
      method: 'POST',
      headers: { Authorization: otherUserAuthHeader() },
      body: { orderId: ORDER_ID_1, paymentMethod: 'CARD' },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'ORDER_NOT_FOUND');
  });
});

// ==========================================
// 3. CASH ON DELIVERY HANDLING
// ==========================================

test('11. POST /api/v1/payments/cash-on-delivery confirms Cash on Delivery for order', async () => {
  let createdPaymentPayload = null;

  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async (id) => (id === ORDER_ID_1 ? SAMPLE_ORDER : null),
      getPaymentsByOrderId: async () => [],
      createOrderPayment: async (payload) => {
        createdPaymentPayload = payload;
        return {
          id: PAYMENT_ID_1,
          order_id: payload.orderId,
          provider: payload.provider,
          provider_reference: payload.providerReference,
          amount_kobo: payload.amountKobo,
          status: payload.status,
          paid_at: null,
          created_at: '2026-08-22T12:00:00.000Z',
        };
      },
      updateOrderPaymentInfo: async () => ({ id: ORDER_ID_1 }),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/cash-on-delivery', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: { orderId: ORDER_ID_1 },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.paymentMethod, 'CASH_ON_DELIVERY');
    assert.equal(response.body.data.paymentStatus, 'PENDING');
    assert.equal(response.body.data.totalKobo, 575000);
    assert.equal(createdPaymentPayload.provider, 'CASH_ON_DELIVERY');
    assert.equal(createdPaymentPayload.amountKobo, 575000);
  });
});

test('12. POST /api/v1/payments/orders/:orderId/cash-on-delivery confirms COD via URL parameter route', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async (id) => (id === ORDER_ID_1 ? SAMPLE_ORDER : null),
      getPaymentsByOrderId: async () => [
        {
          id: PAYMENT_ID_1,
          order_id: ORDER_ID_1,
          provider: 'CASH_ON_DELIVERY',
          provider_reference: null,
          amount_kobo: 575000,
          status: 'PENDING',
        },
      ],
      updateOrderPaymentInfo: async () => ({ id: ORDER_ID_1 }),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/payments/orders/${ORDER_ID_1}/cash-on-delivery`, {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.paymentMethod, 'CASH_ON_DELIVERY');
  });
});

test('13. POST /api/v1/payments/cash-on-delivery rejects when order is cancelled', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async () => ({
        ...SAMPLE_ORDER,
        status: 'CANCELLED',
      }),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/cash-on-delivery', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: { orderId: ORDER_ID_1 },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'ORDER_CANCELLED');
  });
});

test('14. POST /api/v1/payments/cash-on-delivery rejects when order is already paid', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async () => ({
        ...SAMPLE_ORDER,
        payment_status: 'PAID',
      }),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/cash-on-delivery', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: { orderId: ORDER_ID_1 },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'ORDER_ALREADY_PAID');
  });
});

test('15. POST /api/v1/payments/cash-on-delivery prevents cross-user access (404)', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async () => SAMPLE_ORDER,
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/cash-on-delivery', {
      method: 'POST',
      headers: { Authorization: otherUserAuthHeader() },
      body: { orderId: ORDER_ID_1 },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'ORDER_NOT_FOUND');
  });
});

// ==========================================
// 4. RETRIEVAL & OWNERSHIP
// ==========================================

test('16. GET /api/v1/payments/orders/:orderId lists payments for order owner', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async (id) => (id === ORDER_ID_1 ? SAMPLE_ORDER : null),
      getPaymentsByOrderId: async (id) => [
        {
          id: PAYMENT_ID_1,
          order_id: ORDER_ID_1,
          provider: 'CASH_ON_DELIVERY',
          provider_reference: null,
          amount_kobo: 575000,
          status: 'PENDING',
          paid_at: null,
          created_at: '2026-08-22T12:00:00.000Z',
        },
      ],
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/payments/orders/${ORDER_ID_1}`, {
      method: 'GET',
      headers: { Authorization: customerAuthHeader() },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.orderId, ORDER_ID_1);
    assert.equal(response.body.data.payments.length, 1);
    assert.equal(response.body.data.payments[0].amountKobo, 575000);
  });
});

test('17. GET /api/v1/payments/orders/:orderId returns 404 for missing order', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async () => null,
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/orders/non-existent-order', {
      method: 'GET',
      headers: { Authorization: customerAuthHeader() },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'ORDER_NOT_FOUND');
  });
});

test('18. GET /api/v1/payments/orders/:orderId prevents cross-user access (404)', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async () => SAMPLE_ORDER,
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/payments/orders/${ORDER_ID_1}`, {
      method: 'GET',
      headers: { Authorization: otherUserAuthHeader() },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'ORDER_NOT_FOUND');
  });
});

test('19. GET /api/v1/payments/:paymentId returns payment details for owner', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getPaymentById: async (id) => (id === PAYMENT_ID_1 ? SAMPLE_PAYMENT : null),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/payments/${PAYMENT_ID_1}`, {
      method: 'GET',
      headers: { Authorization: customerAuthHeader() },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.payment.id, PAYMENT_ID_1);
    assert.equal(response.body.data.payment.amountKobo, 575000);
    assert.equal(response.body.data.orderStatus, 'PENDING');
  });
});

test('20. GET /api/v1/payments/:paymentId returns 404 for missing payment', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getPaymentById: async () => null,
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/missing-payment-id', {
      method: 'GET',
      headers: { Authorization: customerAuthHeader() },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'PAYMENT_NOT_FOUND');
  });
});

test('21. GET /api/v1/payments/:paymentId prevents cross-user access (404)', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getPaymentById: async () => SAMPLE_PAYMENT,
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/payments/${PAYMENT_ID_1}`, {
      method: 'GET',
      headers: { Authorization: otherUserAuthHeader() },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'PAYMENT_NOT_FOUND');
  });
});

test('22. Admin user can view payments for any order', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async () => SAMPLE_ORDER,
      getPaymentsByOrderId: async () => [
        {
          id: PAYMENT_ID_1,
          order_id: ORDER_ID_1,
          provider: 'CASH_ON_DELIVERY',
          provider_reference: null,
          amount_kobo: 575000,
          status: 'PENDING',
        },
      ],
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/payments/orders/${ORDER_ID_1}`, {
      method: 'GET',
      headers: { Authorization: adminAuthHeader() },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.payments.length, 1);
  });
});

// ==========================================
// 5. WEBHOOK & IDEMPOTENCY
// ==========================================

test('23. POST /api/v1/payments/webhook receives provider-agnostic webhook without auth in stub mode', async () => {
  const stubs = [
    [paymentRepository, {
      getPaymentByProviderReference: async () => null,
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/webhook', {
      method: 'POST',
      headers: { 'x-payment-provider': 'PAYSTACK' },
      body: {
        event: 'charge.success',
        reference: 'T123456789',
        data: {
          reference: 'T123456789',
          amount: 575000,
          status: 'success',
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.received, true);
    assert.equal(response.body.data.stub, true);
    assert.equal(response.body.data.verified, false);
  });
});

test('24. POST /api/v1/payments/webhook handles idempotency for already processed payment', async () => {
  const stubs = [
    [paymentRepository, {
      getPaymentByProviderReference: async (provider, ref) => ({
        ...SAMPLE_PAYMENT,
        provider,
        provider_reference: ref,
        status: 'PAID',
      }),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/webhook', {
      method: 'POST',
      body: {
        provider: 'GENERIC',
        reference: 'PROCESSED_REF_123',
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.idempotent, true);
    assert.equal(response.body.data.status, 'PAID');
  });
});

test('25. POST /api/v1/payments/webhook rejects empty payload with 400', async () => {
  const response = await request('/api/v1/payments/webhook', {
    method: 'POST',
    body: {},
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'INVALID_WEBHOOK_PAYLOAD');
});

// ==========================================
// 6. PAYMENT STATUS TRANSITIONS & SERVICE LOGIC
// ==========================================

test('26. Payment status transition: PENDING -> PAID updates order status to CONFIRMED', async () => {
  let updatedOrderInfo = null;

  const stubs = [
    [paymentRepository, {
      getPaymentById: async () => ({
        ...SAMPLE_PAYMENT,
        status: 'PENDING',
        order_status: 'PENDING',
      }),
      updatePaymentStatus: async (id, status, { paidAt }) => ({
        ...SAMPLE_PAYMENT,
        status,
        paid_at: paidAt,
      }),
      updateOrderPaymentInfo: async (orderId, payload) => {
        updatedOrderInfo = payload;
        return { id: orderId, ...payload };
      },
    }],
  ];

  await withStubs(stubs, async () => {
    const result = await paymentService.updatePaymentStatus(PAYMENT_ID_1, 'PAID', {
      paidAt: '2026-08-22T13:00:00.000Z',
    });

    assert.equal(result.status, 'PAID');
    assert.equal(result.paidAt, '2026-08-22T13:00:00.000Z');
    assert.equal(updatedOrderInfo.paymentStatus, 'PAID');
    assert.equal(updatedOrderInfo.orderStatus, 'CONFIRMED');
  });
});

test('27. Payment status transition: PENDING -> FAILED does not advance order to CONFIRMED', async () => {
  let updatedOrderInfo = null;

  const stubs = [
    [paymentRepository, {
      getPaymentById: async () => ({
        ...SAMPLE_PAYMENT,
        status: 'PENDING',
        order_status: 'PENDING',
      }),
      updatePaymentStatus: async (id, status) => ({
        ...SAMPLE_PAYMENT,
        status,
      }),
      updateOrderPaymentInfo: async (orderId, payload) => {
        updatedOrderInfo = payload;
        return { id: orderId, ...payload };
      },
    }],
  ];

  await withStubs(stubs, async () => {
    const result = await paymentService.updatePaymentStatus(PAYMENT_ID_1, 'FAILED');
    assert.equal(result.status, 'FAILED');
    assert.equal(updatedOrderInfo.paymentStatus, 'FAILED');
    assert.equal(updatedOrderInfo.orderStatus, null);
  });
});

test('28. Payment status transition rejects invalid transitions (e.g. PENDING -> REFUNDED)', async () => {
  const stubs = [
    [paymentRepository, {
      getPaymentById: async () => ({
        ...SAMPLE_PAYMENT,
        status: 'PENDING',
      }),
    }],
  ];

  await withStubs(stubs, async () => {
    await assert.rejects(
      async () => paymentService.updatePaymentStatus(PAYMENT_ID_1, 'REFUNDED'),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'INVALID_PAYMENT_TRANSITION');
        return true;
      }
    );
  });
});

test('29. Repository failure returns safe 500 internal server error', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [paymentRepository, {
      getOrderById: async () => {
        throw new Error('Database pool connection timeout');
      },
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/payments/initialize', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: { orderId: ORDER_ID_1 },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'INTERNAL_SERVER_ERROR');
  });
});

test('30. Payment service helper units format properly', () => {
  const formatted = paymentService.formatPayment({
    id: PAYMENT_ID_1,
    order_id: ORDER_ID_1,
    provider: 'CARD',
    provider_reference: 'REF_999',
    amount_kobo: 250000,
    status: 'PAID',
    paid_at: '2026-08-22T14:00:00.000Z',
    created_at: '2026-08-22T13:50:00.000Z',
  });

  assert.equal(formatted.id, PAYMENT_ID_1);
  assert.equal(formatted.orderId, ORDER_ID_1);
  assert.equal(formatted.amountKobo, 250000);
  assert.equal(formatted.amountNgn, 2500);
  assert.equal(formatted.status, 'PAID');
});
