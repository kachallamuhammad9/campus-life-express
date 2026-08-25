const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const deliveryRepository = require('../src/repositories/deliveryRepository');
const campusRepository = require('../src/repositories/campusRepository');
const userRepository = require('../src/repositories/userRepository');
const deliveryService = require('../src/services/deliveryService');
const {
  TEST_USER_ID,
  TEST_ADMIN_ID,
  getAuthHeader,
} = require('./helpers/authHelper');

const OTHER_USER_ID = '00000000-0000-4000-8000-000000000099';
const RIDER_USER_ID = '00000000-0000-4000-8000-000000000077';
const OTHER_RIDER_ID = '00000000-0000-4000-8000-000000000078';
const CAMPUS_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_CAMPUS_ID = '00000000-0000-4000-8000-000000000002';
const ZONE_ID = '00000000-0000-4000-8000-000000000030';
const DELIVERY_ID_1 = '00000000-0000-4000-8000-000000000601';
const DELIVERY_ID_2 = '00000000-0000-4000-8000-000000000602';

const SAMPLE_CAMPUS = {
  id: CAMPUS_ID,
  slug: 'unimaid',
  name: 'University of Maiduguri',
  short_name: 'UNIMAID',
  is_active: true,
};

const SAMPLE_ZONE = {
  id: ZONE_ID,
  campus_id: CAMPUS_ID,
  name: 'Acada Complex',
  base_delivery_fee_kobo: 50000, // 500 NGN
  is_active: true,
};

const SAMPLE_USER_PROFILE = {
  id: TEST_USER_ID,
  email: 'student@unimaid.edu.ng',
  full_name: 'Student Requester',
  phone_number: '08012345678',
  default_campus_id: CAMPUS_ID,
  is_active: true,
};

const SAMPLE_RIDER_PROFILE = {
  id: RIDER_USER_ID,
  email: 'rider@unimaid.edu.ng',
  full_name: 'Express Rider',
  phone_number: '08098765432',
  default_campus_id: CAMPUS_ID,
  is_active: true,
};

const SAMPLE_DELIVERY_RECORD = {
  id: DELIVERY_ID_1,
  requester_user_id: TEST_USER_ID,
  rider_user_id: null,
  campus_id: CAMPUS_ID,
  task_type: 'ERRAND',
  pickup_location: 'Hostel A Block 4 Room 12',
  dropoff_location: 'Faculty of Science Lab 2',
  description: 'Pick up lecture notes and hand over to lab tech',
  estimated_fee_kobo: 50000,
  actual_fee_kobo: null,
  urgency: 'HIGH',
  preferred_at: '2026-08-23T10:00:00.000Z',
  status: 'REQUESTED',
  notes: 'Call before arriving',
  created_at: '2026-08-22T12:00:00.000Z',
  updated_at: '2026-08-22T12:00:00.000Z',
  picked_up_at: null,
  delivered_at: null,
  campus_name: 'University of Maiduguri',
  campus_slug: 'unimaid',
  requester_name: 'Student Requester',
  requester_phone: '08012345678',
  requester_email: 'student@unimaid.edu.ng',
  rider_name: null,
  rider_phone: null,
  rider_email: null,
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

const riderAuthHeader = () => getAuthHeader({
  sub: RIDER_USER_ID,
  email: 'rider@unimaid.edu.ng',
  app_metadata: { role: 'RIDER' },
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

// Setup default user stubs for authentication resolution
const setupAuthMocks = (extra = {}) => [
  [userRepository, {
    getUserProfileById: async (id) => {
      if (id === TEST_USER_ID) return SAMPLE_USER_PROFILE;
      if (id === RIDER_USER_ID) return SAMPLE_RIDER_PROFILE;
      if (id === TEST_ADMIN_ID) return { id: TEST_ADMIN_ID, email: 'admin@unimaid.edu.ng', full_name: 'Admin', is_active: true };
      if (id === OTHER_USER_ID) return { id: OTHER_USER_ID, email: 'other@unimaid.edu.ng', full_name: 'Other User', is_active: true };
      return null;
    },
    getUserRoles: async (id) => {
      if (id === TEST_USER_ID) return ['CUSTOMER'];
      if (id === RIDER_USER_ID) return ['RIDER'];
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

test('1. POST /api/v1/deliveries rejects unauthenticated request with 401', async () => {
  const response = await request('/api/v1/deliveries', {
    method: 'POST',
    body: {
      campusId: CAMPUS_ID,
      taskType: 'ERRAND',
      pickupLocation: 'Hostel A',
      dropoffLocation: 'Faculty B',
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('2. GET /api/v1/deliveries rejects unauthenticated request with 401', async () => {
  const response = await request('/api/v1/deliveries', { method: 'GET' });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('3. GET /api/v1/deliveries/assigned rejects customer without RIDER role with 403', async () => {
  await withStubs(setupAuthMocks(), async () => {
    const response = await request('/api/v1/deliveries/assigned', {
      method: 'GET',
      headers: { Authorization: customerAuthHeader() },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'FORBIDDEN');
  });
});

test('4. GET /api/v1/deliveries/available rejects customer without RIDER role with 403', async () => {
  await withStubs(setupAuthMocks(), async () => {
    const response = await request('/api/v1/deliveries/available', {
      method: 'GET',
      headers: { Authorization: customerAuthHeader() },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'FORBIDDEN');
  });
});

test('5. POST /api/v1/deliveries/:deliveryId/accept rejects non-rider with 403', async () => {
  await withStubs(setupAuthMocks(), async () => {
    const response = await request(`/api/v1/deliveries/${DELIVERY_ID_1}/accept`, {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'FORBIDDEN');
  });
});

// ==========================================
// 2. DELIVERY CREATION & VALIDATION
// ==========================================

test('6. POST /api/v1/deliveries creates a delivery request with valid payload and delivery zone fee', async () => {
  let createdPayload = null;

  const stubs = [
    ...setupAuthMocks(),
    [campusRepository, {
      getCampusByIdentifier: async (id) => (id === CAMPUS_ID ? SAMPLE_CAMPUS : null),
    }],
    [deliveryRepository, {
      getDeliveryZoneById: async (id) => (id === ZONE_ID ? SAMPLE_ZONE : null),
      createDeliveryRequest: async (payload) => {
        createdPayload = payload;
        return {
          id: DELIVERY_ID_1,
          ...payload,
          created_at: '2026-08-22T12:00:00.000Z',
          updated_at: '2026-08-22T12:00:00.000Z',
        };
      },
      getDeliveryRequestById: async (id) => ({
        ...SAMPLE_DELIVERY_RECORD,
        id,
      }),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/deliveries', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: {
        campusId: CAMPUS_ID,
        taskType: 'ERRAND',
        pickupLocation: 'Hostel A Block 4 Room 12',
        dropoffLocation: 'Faculty of Science Lab 2',
        description: 'Pick up lecture notes and hand over to lab tech',
        deliveryZoneId: ZONE_ID,
        urgency: 'HIGH',
        preferredAt: '2026-08-23T10:00:00.000Z',
        notes: 'Call before arriving',
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.success, true);
    assert.ok(response.body.data.delivery);
    assert.equal(response.body.data.delivery.id, DELIVERY_ID_1);
    assert.equal(response.body.data.delivery.requesterUserId, TEST_USER_ID);
    assert.equal(response.body.data.delivery.estimatedFeeKobo, 50000);
    assert.equal(response.body.data.delivery.status, 'REQUESTED');

    // Verify repository received authoritative user ID and fee
    assert.equal(createdPayload.requesterUserId, TEST_USER_ID);
    assert.equal(createdPayload.estimatedFeeKobo, 50000);
    assert.equal(createdPayload.status, 'REQUESTED');
  });
});

test('7. POST /api/v1/deliveries applies default base fee when no zone is provided', async () => {
  let createdPayload = null;

  const stubs = [
    ...setupAuthMocks(),
    [campusRepository, {
      getCampusByIdentifier: async (id) => (id === CAMPUS_ID ? SAMPLE_CAMPUS : null),
    }],
    [deliveryRepository, {
      createDeliveryRequest: async (payload) => {
        createdPayload = payload;
        return {
          id: DELIVERY_ID_1,
          ...payload,
          created_at: '2026-08-22T12:00:00.000Z',
          updated_at: '2026-08-22T12:00:00.000Z',
        };
      },
      getDeliveryRequestById: async (id) => ({
        ...SAMPLE_DELIVERY_RECORD,
        id,
        estimated_fee_kobo: 40000,
      }),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/deliveries', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: {
        campusId: CAMPUS_ID,
        taskType: 'DELIVERY',
        pickupLocation: 'Main Gate',
        dropoffLocation: 'Female Hostel B',
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.success, true);
    assert.equal(createdPayload.estimatedFeeKobo, 40000);
    assert.equal(response.body.data.delivery.estimatedFeeKobo, 40000);
  });
});

test('8. POST /api/v1/deliveries rejects invalid or inactive campus', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [campusRepository, {
      getCampusByIdentifier: async () => null,
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/deliveries', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: {
        campusId: 'non-existent-campus',
        taskType: 'DELIVERY',
        pickupLocation: 'Main Gate',
        dropoffLocation: 'Female Hostel B',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'INVALID_CAMPUS');
  });
});

test('9. POST /api/v1/deliveries rejects invalid task_type', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [campusRepository, {
      getCampusByIdentifier: async () => SAMPLE_CAMPUS,
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/deliveries', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: {
        campusId: CAMPUS_ID,
        taskType: 'INVALID_TASK_TYPE',
        pickupLocation: 'Main Gate',
        dropoffLocation: 'Female Hostel B',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  });
});

test('10. POST /api/v1/deliveries rejects missing pickup or dropoff locations', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [campusRepository, {
      getCampusByIdentifier: async () => SAMPLE_CAMPUS,
    }],
  ];

  await withStubs(stubs, async () => {
    const response1 = await request('/api/v1/deliveries', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: {
        campusId: CAMPUS_ID,
        taskType: 'DELIVERY',
        pickupLocation: '',
        dropoffLocation: 'Female Hostel B',
      },
    });

    assert.equal(response1.statusCode, 400);
    assert.equal(response1.body.error.code, 'VALIDATION_ERROR');

    const response2 = await request('/api/v1/deliveries', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: {
        campusId: CAMPUS_ID,
        taskType: 'DELIVERY',
        pickupLocation: 'Main Gate',
        dropoffLocation: '   ',
      },
    });

    assert.equal(response2.statusCode, 400);
    assert.equal(response2.body.error.code, 'VALIDATION_ERROR');
  });
});

test('11. POST /api/v1/deliveries rejects delivery zone that does not belong to campus', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [campusRepository, {
      getCampusByIdentifier: async () => SAMPLE_CAMPUS,
    }],
    [deliveryRepository, {
      getDeliveryZoneById: async (id) => ({
        id,
        campus_id: OTHER_CAMPUS_ID, // Mismatched campus
        name: 'Remote Campus Zone',
        base_delivery_fee_kobo: 60000,
        is_active: true,
      }),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/deliveries', {
      method: 'POST',
      headers: { Authorization: customerAuthHeader() },
      body: {
        campusId: CAMPUS_ID,
        taskType: 'DELIVERY',
        pickupLocation: 'Gate 1',
        dropoffLocation: 'Block B',
        deliveryZoneId: ZONE_ID,
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'INVALID_DELIVERY_ZONE');
  });
});

// ==========================================
// 3. CUSTOMER DELIVERY LISTING & DETAILS
// ==========================================

test('12. GET /api/v1/deliveries lists authenticated customer delivery requests', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestsByRequesterId: async (userId, { status, limit, offset }) => {
        assert.equal(userId, TEST_USER_ID);
        return [SAMPLE_DELIVERY_RECORD];
      },
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/deliveries?limit=10&offset=0', {
      method: 'GET',
      headers: { Authorization: customerAuthHeader() },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.deliveries.length, 1);
    assert.equal(response.body.data.deliveries[0].id, DELIVERY_ID_1);
    assert.equal(response.body.data.pagination.limit, 10);
    assert.equal(response.body.data.pagination.count, 1);
  });
});

test('13. GET /api/v1/deliveries/:deliveryId returns delivery details for requester', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestById: async (id) => (id === DELIVERY_ID_1 ? SAMPLE_DELIVERY_RECORD : null),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/deliveries/${DELIVERY_ID_1}`, {
      method: 'GET',
      headers: { Authorization: customerAuthHeader() },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.delivery.id, DELIVERY_ID_1);
    assert.equal(response.body.data.delivery.taskType, 'ERRAND');
    assert.equal(response.body.data.delivery.requester.name, 'Student Requester');
  });
});

test('14. GET /api/v1/deliveries/:deliveryId returns 404 for missing delivery', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestById: async () => null,
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/deliveries/non-existent-id', {
      method: 'GET',
      headers: { Authorization: customerAuthHeader() },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'DELIVERY_NOT_FOUND');
  });
});

test('15. GET /api/v1/deliveries/:deliveryId prevents unauthorized cross-customer access', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestById: async (id) => (id === DELIVERY_ID_1 ? SAMPLE_DELIVERY_RECORD : null),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/deliveries/${DELIVERY_ID_1}`, {
      method: 'GET',
      headers: { Authorization: otherUserAuthHeader() }, // Belongs to TEST_USER_ID
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'DELIVERY_NOT_FOUND');
  });
});

// ==========================================
// 4. RIDER ASSIGNMENT & STATUS TRANSITIONS
// ==========================================

test('16. GET /api/v1/deliveries/assigned returns deliveries assigned to rider', async () => {
  const assignedRecord = {
    ...SAMPLE_DELIVERY_RECORD,
    rider_user_id: RIDER_USER_ID,
    status: 'ACCEPTED',
    rider_name: 'Express Rider',
    rider_phone: '08098765432',
  };

  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getAssignedDeliveriesForRider: async (riderId) => {
        assert.equal(riderId, RIDER_USER_ID);
        return [assignedRecord];
      },
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/deliveries/assigned', {
      method: 'GET',
      headers: { Authorization: riderAuthHeader() },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.deliveries.length, 1);
    assert.equal(response.body.data.deliveries[0].riderUserId, RIDER_USER_ID);
    assert.equal(response.body.data.deliveries[0].status, 'ACCEPTED');
  });
});

test('17. GET /api/v1/deliveries/available returns unassigned requests for rider', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getAvailableDeliveriesForCampus: async (campusId) => [SAMPLE_DELIVERY_RECORD],
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/deliveries/available?campusId=${CAMPUS_ID}`, {
      method: 'GET',
      headers: { Authorization: riderAuthHeader() },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.deliveries.length, 1);
    assert.equal(response.body.data.deliveries[0].status, 'REQUESTED');
    assert.equal(response.body.data.deliveries[0].riderUserId, null);
  });
});

test('18. POST /api/v1/deliveries/:deliveryId/accept assigns rider and updates status to ACCEPTED', async () => {
  let assignedRiderId = null;
  let deliveryRecord = { ...SAMPLE_DELIVERY_RECORD };

  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestById: async (id) => deliveryRecord,
      assignRiderToDelivery: async (id, riderId) => {
        assignedRiderId = riderId;
        deliveryRecord = {
          ...deliveryRecord,
          rider_user_id: riderId,
          status: 'ACCEPTED',
          rider_name: 'Express Rider',
        };
        return deliveryRecord;
      },
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/deliveries/${DELIVERY_ID_1}/accept`, {
      method: 'POST',
      headers: { Authorization: riderAuthHeader() },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(assignedRiderId, RIDER_USER_ID);
    assert.equal(response.body.data.delivery.status, 'ACCEPTED');
    assert.equal(response.body.data.delivery.riderUserId, RIDER_USER_ID);
  });
});

test('19. POST /api/v1/deliveries/:deliveryId/accept rejects when already assigned', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestById: async () => ({
        ...SAMPLE_DELIVERY_RECORD,
        rider_user_id: OTHER_RIDER_ID,
        status: 'ACCEPTED',
      }),
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/deliveries/${DELIVERY_ID_1}/accept`, {
      method: 'POST',
      headers: { Authorization: riderAuthHeader() },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'DELIVERY_ALREADY_ASSIGNED');
  });
});

test('20. PATCH /api/v1/deliveries/:deliveryId/status allows rider to transition ACCEPTED -> PICKED_UP', async () => {
  let deliveryRecord = {
    ...SAMPLE_DELIVERY_RECORD,
    rider_user_id: RIDER_USER_ID,
    status: 'ACCEPTED',
  };

  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestById: async () => deliveryRecord,
      updateDeliveryStatus: async (id, status) => {
        deliveryRecord = {
          ...deliveryRecord,
          status,
          picked_up_at: '2026-08-22T13:00:00.000Z',
        };
        return deliveryRecord;
      },
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/deliveries/${DELIVERY_ID_1}/status`, {
      method: 'PATCH',
      headers: { Authorization: riderAuthHeader() },
      body: { status: 'PICKED_UP' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.delivery.status, 'PICKED_UP');
    assert.ok(response.body.data.delivery.pickedUpAt);
  });
});

test('21. PATCH /api/v1/deliveries/:deliveryId/status allows rider to transition PICKED_UP -> IN_TRANSIT', async () => {
  let deliveryRecord = {
    ...SAMPLE_DELIVERY_RECORD,
    rider_user_id: RIDER_USER_ID,
    status: 'PICKED_UP',
    picked_up_at: '2026-08-22T13:00:00.000Z',
  };

  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestById: async () => deliveryRecord,
      updateDeliveryStatus: async (id, status) => {
        deliveryRecord = { ...deliveryRecord, status };
        return deliveryRecord;
      },
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/deliveries/${DELIVERY_ID_1}/status`, {
      method: 'PATCH',
      headers: { Authorization: riderAuthHeader() },
      body: { status: 'IN_TRANSIT' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.delivery.status, 'IN_TRANSIT');
  });
});

test('22. PATCH /api/v1/deliveries/:deliveryId/status allows rider to transition IN_TRANSIT -> DELIVERED', async () => {
  let deliveryRecord = {
    ...SAMPLE_DELIVERY_RECORD,
    rider_user_id: RIDER_USER_ID,
    status: 'IN_TRANSIT',
    picked_up_at: '2026-08-22T13:00:00.000Z',
    estimated_fee_kobo: 50000,
  };

  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestById: async () => deliveryRecord,
      updateDeliveryStatus: async (id, status, { actualFeeKobo }) => {
        deliveryRecord = {
          ...deliveryRecord,
          status,
          actual_fee_kobo: actualFeeKobo || 50000,
          delivered_at: '2026-08-22T13:30:00.000Z',
        };
        return deliveryRecord;
      },
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/deliveries/${DELIVERY_ID_1}/status`, {
      method: 'PATCH',
      headers: { Authorization: riderAuthHeader() },
      body: { status: 'DELIVERED' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.delivery.status, 'DELIVERED');
    assert.equal(response.body.data.delivery.actualFeeKobo, 50000);
    assert.ok(response.body.data.delivery.deliveredAt);
  });
});

test('23. PATCH /api/v1/deliveries/:deliveryId/status allows customer to cancel REQUESTED delivery', async () => {
  let deliveryRecord = { ...SAMPLE_DELIVERY_RECORD, status: 'REQUESTED' };

  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestById: async () => deliveryRecord,
      updateDeliveryStatus: async (id, status) => {
        deliveryRecord = { ...deliveryRecord, status };
        return deliveryRecord;
      },
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/deliveries/${DELIVERY_ID_1}/status`, {
      method: 'PATCH',
      headers: { Authorization: customerAuthHeader() },
      body: { status: 'CANCELLED' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.delivery.status, 'CANCELLED');
  });
});

test('24. PATCH /api/v1/deliveries/:deliveryId/status rejects customer cancelling once in transit', async () => {
  const deliveryRecord = {
    ...SAMPLE_DELIVERY_RECORD,
    rider_user_id: RIDER_USER_ID,
    status: 'IN_TRANSIT',
  };

  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestById: async () => deliveryRecord,
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/deliveries/${DELIVERY_ID_1}/status`, {
      method: 'PATCH',
      headers: { Authorization: customerAuthHeader() },
      body: { status: 'CANCELLED' },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'CANNOT_CANCEL_IN_TRANSIT');
  });
});

test('25. PATCH /api/v1/deliveries/:deliveryId/status rejects invalid state transitions', async () => {
  const deliveryRecord = { ...SAMPLE_DELIVERY_RECORD, status: 'REQUESTED' };

  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestById: async () => deliveryRecord,
    }],
  ];

  await withStubs(stubs, async () => {
    // Attempting direct jump from REQUESTED to DELIVERED
    const response = await request(`/api/v1/deliveries/${DELIVERY_ID_1}/status`, {
      method: 'PATCH',
      headers: { Authorization: adminAuthHeader() },
      body: { status: 'DELIVERED' },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'INVALID_STATUS_TRANSITION');
  });
});

test('26. PATCH /api/v1/deliveries/:deliveryId/status prevents unauthorized rider from updating another rider delivery', async () => {
  const deliveryRecord = {
    ...SAMPLE_DELIVERY_RECORD,
    rider_user_id: OTHER_RIDER_ID,
    status: 'ACCEPTED',
  };

  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestById: async () => deliveryRecord,
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request(`/api/v1/deliveries/${DELIVERY_ID_1}/status`, {
      method: 'PATCH',
      headers: { Authorization: riderAuthHeader() }, // RIDER_USER_ID != OTHER_RIDER_ID
      body: { status: 'PICKED_UP' },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'DELIVERY_NOT_FOUND');
  });
});

test('27. Repository failure returns safe 500 internal server error', async () => {
  const stubs = [
    ...setupAuthMocks(),
    [deliveryRepository, {
      getDeliveryRequestsByRequesterId: async () => {
        throw new Error('Database connection terminated unexpectedly');
      },
    }],
  ];

  await withStubs(stubs, async () => {
    const response = await request('/api/v1/deliveries', {
      method: 'GET',
      headers: { Authorization: customerAuthHeader() },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'INTERNAL_SERVER_ERROR');
  });
});

test('28. Delivery service pagination and state machine helper units pass', () => {
  // Test pagination normalization
  const p1 = deliveryService.normalizePagination('150', '-10');
  assert.equal(p1.limit, 100);
  assert.equal(p1.offset, 0);

  const p2 = deliveryService.normalizePagination('invalid', '30');
  assert.equal(p2.limit, 20);
  assert.equal(p2.offset, 30);

  // Test state machine allowed sets
  assert.ok(deliveryService.ALLOWED_TRANSITIONS.REQUESTED.has('ACCEPTED'));
  assert.ok(deliveryService.ALLOWED_TRANSITIONS.REQUESTED.has('CANCELLED'));
  assert.equal(deliveryService.ALLOWED_TRANSITIONS.DELIVERED.size, 0);
  assert.equal(deliveryService.ALLOWED_TRANSITIONS.CANCELLED.size, 0);
});
