const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const serviceRepository = require('../src/repositories/serviceRepository');
const { getAuthHeader } = require('./helpers/authHelper');

const mockService = {
  id: '00000000-0000-4000-8000-000000000401',
  legacy_key: 'thesis-binding-express',
  slug: 'thesis-binding-express',
  provider_user_id: '00000000-0000-4000-8000-000000000099',
  vendor_id: '00000000-0000-4000-8000-000000000010',
  campus_id: '00000000-0000-4000-8000-000000000001',
  category_id: '00000000-0000-4000-8000-000000000004',
  subcategory_id: null,
  name: 'Express Thesis & Project Binding',
  description: 'Hardcover and softcover spiral project binding for graduating students',
  starting_price_kobo: 150000,
  price_type: 'STARTING_FROM',
  image_url: 'https://example.com/services/binding.jpg',
  turnaround_time: '2-4 hours',
  requires_file_upload: true,
  requires_appointment: false,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  campus_name: 'University of Maiduguri',
  campus_slug: 'unimaid',
  category_name: 'Printing & Stationery',
  category_slug: 'printing-stationery',
  vendor_name: 'Mama Put Special',
  vendor_slug: 'mama-put-special',
  provider_name: 'Usman Garba',
};

const mockServiceRequest = {
  id: '00000000-0000-4000-8000-000000000501',
  service_id: mockService.id,
  requester_user_id: '00000000-0000-4000-8000-000000000088',
  provider_user_id: mockService.provider_user_id,
  vendor_id: mockService.vendor_id,
  campus_id: mockService.campus_id,
  delivery_type: 'PICKUP',
  customer_location: 'Hostel Block C Room 12',
  description: 'Please bind 3 copies of final year project',
  file_url: 'https://example.com/uploads/project_final.pdf',
  estimated_budget_kobo: 450000,
  preferred_date: '2026-02-01',
  preferred_time: '14:00:00',
  status: 'SUBMITTED',
  notes: 'Gold lettering on cover please',
  created_at: '2026-01-05T08:00:00.000Z',
  updated_at: '2026-01-05T08:00:00.000Z',
  completed_at: null,
  service_name: mockService.name,
  service_slug: mockService.slug,
  campus_name: mockService.campus_name,
  campus_slug: mockService.campus_slug,
  vendor_name: mockService.vendor_name,
  vendor_slug: mockService.vendor_slug,
  requester_name: 'Fatima Ali',
  provider_name: 'Usman Garba',
};

const request = (path, options = {}) => new Promise((resolve, reject) => {
  const server = app.listen(0, () => {
    const { port } = server.address();
    const isPost = options.method === 'POST';
    const payload = options.body ? JSON.stringify(options.body) : null;

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: {
        ...(options.headers || {}),
        ...(isPost ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload || ''),
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
    listServices: serviceRepository.listServices,
    getServiceByIdentifier: serviceRepository.getServiceByIdentifier,
    createServiceRequest: serviceRepository.createServiceRequest,
    getServiceRequestById: serviceRepository.getServiceRequestById,
  };

  Object.assign(serviceRepository, stub);
  try {
    return await callback();
  } finally {
    Object.assign(serviceRepository, originals);
  }
};

test('1. GET /api/v1/services returns active services list', async () => {
  const result = await withRepositoryStub({
    listServices: async () => [mockService],
  }, () => request('/api/v1/services'));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.data, [mockService]);
});

test('2. GET /api/v1/services passes campusId filter to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listServices: async (options) => {
      capturedOptions = options;
      return [mockService];
    },
  }, () => request('/api/v1/services?campusId=unimaid'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.campusId, 'unimaid');
  assert.deepEqual(result.body.data, [mockService]);
});

test('3. GET /api/v1/services passes categoryId filter to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listServices: async (options) => {
      capturedOptions = options;
      return [mockService];
    },
  }, () => request('/api/v1/services?categoryId=printing-stationery'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.categoryId, 'printing-stationery');
  assert.deepEqual(result.body.data, [mockService]);
});

test('4. GET /api/v1/services passes search query to repository', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listServices: async (options) => {
      capturedOptions = options;
      return [mockService];
    },
  }, () => request('/api/v1/services?search=thesis'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.search, 'thesis');
  assert.deepEqual(result.body.data, [mockService]);
});

test('5. GET /api/v1/services respects pagination limit and offset', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listServices: async (options) => {
      capturedOptions = options;
      return [mockService];
    },
  }, () => request('/api/v1/services?limit=10&offset=20'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.limit, 10);
  assert.equal(capturedOptions.offset, 20);
});

test('6. Invalid pagination parameters are safely normalized', async () => {
  let capturedOptions;
  const result = await withRepositoryStub({
    listServices: async (options) => {
      capturedOptions = options;
      return [];
    },
  }, () => request('/api/v1/services?limit=-5&offset=invalid'));

  assert.equal(result.statusCode, 200);
  assert.equal(capturedOptions.limit, 20);
  assert.equal(capturedOptions.offset, 0);
});

test('7. GET /api/v1/services/:serviceId supports lookup by UUID', async () => {
  const result = await withRepositoryStub({
    getServiceByIdentifier: async (id) => {
      assert.equal(id, mockService.id);
      return mockService;
    },
  }, () => request(`/api/v1/services/${mockService.id}`));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.id, mockService.id);
});

test('8. GET /api/v1/services/:serviceId supports lookup by slug', async () => {
  const result = await withRepositoryStub({
    getServiceByIdentifier: async (slug) => {
      assert.equal(slug, 'thesis-binding-express');
      return mockService;
    },
  }, () => request('/api/v1/services/thesis-binding-express'));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.slug, 'thesis-binding-express');
});

test('9. GET /api/v1/services/:serviceId supports lookup by legacy key', async () => {
  const result = await withRepositoryStub({
    getServiceByIdentifier: async (key) => {
      assert.equal(key, 'thesis-binding-express');
      return mockService;
    },
  }, () => request('/api/v1/services/thesis-binding-express'));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.legacy_key, 'thesis-binding-express');
});

test('10. GET /api/v1/services/:serviceId returns 404 SERVICE_NOT_FOUND for missing service', async () => {
  const result = await withRepositoryStub({
    getServiceByIdentifier: async () => null,
  }, () => request('/api/v1/services/non-existent-service'));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'SERVICE_NOT_FOUND');
});

test('11. GET /api/v1/services/:serviceId returns 404 SERVICE_NOT_FOUND for inactive service', async () => {
  const result = await withRepositoryStub({
    getServiceByIdentifier: async () => null,
  }, () => request('/api/v1/services/inactive-service'));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error.code, 'SERVICE_NOT_FOUND');
});

test('12. GET /api/v1/services returns empty array when no services match', async () => {
  const result = await withRepositoryStub({
    listServices: async () => [],
  }, () => request('/api/v1/services'));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, []);
});

test('13. Service repository failure returns safe 500 internal server error', async () => {
  const result = await withRepositoryStub({
    listServices: async () => { throw new Error('database connection failure'); },
  }, () => request('/api/v1/services'));

  assert.equal(result.statusCode, 500);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'INTERNAL_SERVER_ERROR');
});

test('14. Service details retrieval includes provider, category, and campus information', async () => {
  const result = await withRepositoryStub({
    getServiceByIdentifier: async () => mockService,
  }, () => request(`/api/v1/services/${mockService.id}`));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.provider_name, 'Usman Garba');
  assert.equal(result.body.data.category_name, 'Printing & Stationery');
  assert.equal(result.body.data.campus_name, 'University of Maiduguri');
});

test('15. Service request creation validates requesterUserId and deliveryType', async () => {
  const resMissingDelivery = await withRepositoryStub({
    getServiceByIdentifier: async () => mockService,
  }, () => request(`/api/v1/services/${mockService.id}/requests`, {
    method: 'POST',
    headers: { Authorization: getAuthHeader() },
    body: {
      description: 'Test request',
    },
  }));

  assert.equal(resMissingDelivery.statusCode, 400);
  assert.equal(resMissingDelivery.body.error.code, 'VALIDATION_ERROR');

  const resInvalidDelivery = await withRepositoryStub({
    getServiceByIdentifier: async () => mockService,
  }, () => request(`/api/v1/services/${mockService.id}/requests`, {
    method: 'POST',
    headers: { Authorization: getAuthHeader() },
    body: {
      deliveryType: 'TELEPORTATION',
      description: 'Test request',
    },
  }));

  assert.equal(resInvalidDelivery.statusCode, 400);
  assert.equal(resInvalidDelivery.body.error.code, 'VALIDATION_ERROR');
});

test('16. Service request creation enforces file upload requirement when configured', async () => {
  const resMissingFile = await withRepositoryStub({
    getServiceByIdentifier: async () => mockService, // requires_file_upload: true
  }, () => request(`/api/v1/services/${mockService.id}/requests`, {
    method: 'POST',
    headers: { Authorization: getAuthHeader() },
    body: {
      deliveryType: 'PICKUP',
      description: 'Need project printed',
    },
  }));

  assert.equal(resMissingFile.statusCode, 400);
  assert.equal(resMissingFile.body.error.code, 'VALIDATION_ERROR');
  assert.match(resMissingFile.body.error.message, /file_url is required/i);
});

test('17. Service request creation succeeds with 201 status and server-determined context', async () => {
  let capturedInsert;
  const result = await withRepositoryStub({
    getServiceByIdentifier: async () => mockService,
    createServiceRequest: async (params) => {
      capturedInsert = params;
      return mockServiceRequest;
    },
  }, () => request(`/api/v1/services/${mockService.id}/requests`, {
    method: 'POST',
    headers: { Authorization: getAuthHeader() },
    body: {
      deliveryType: 'PICKUP',
      description: 'Please bind 3 copies of final year project',
      fileUrl: 'https://example.com/uploads/project_final.pdf',
      estimatedBudgetKobo: 450000,
      notes: 'Gold lettering on cover please',
    },
  }));

  assert.equal(result.statusCode, 201);
  assert.equal(result.body.success, true);
  assert.equal(capturedInsert.serviceId, mockService.id);
  assert.equal(capturedInsert.providerUserId, mockService.provider_user_id);
  assert.equal(capturedInsert.campusId, mockService.campus_id);
  assert.equal(capturedInsert.vendorId, mockService.vendor_id);
  assert.deepEqual(result.body.data, mockServiceRequest);
});

test('18. GET /api/v1/services/requests/:requestId retrieves existing request', async () => {
  const result = await withRepositoryStub({
    getServiceRequestById: async (id) => {
      assert.equal(id, mockServiceRequest.id);
      return mockServiceRequest;
    },
  }, () => request(`/api/v1/services/requests/${mockServiceRequest.id}`));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.data, mockServiceRequest);
});

test('19. GET /api/v1/services/requests/:requestId returns 404 for missing request', async () => {
  const result = await withRepositoryStub({
    getServiceRequestById: async () => null,
  }, () => request('/api/v1/services/requests/non-existent-request-id'));

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'SERVICE_REQUEST_NOT_FOUND');
});

test('20. Invalid budget parameter is safely rejected', async () => {
  const result = await withRepositoryStub({
    getServiceByIdentifier: async () => mockService,
  }, () => request(`/api/v1/services/${mockService.id}/requests`, {
    method: 'POST',
    headers: { Authorization: getAuthHeader() },
    body: {
      deliveryType: 'PICKUP',
      description: 'Binding project',
      fileUrl: 'https://example.com/file.pdf',
      estimatedBudgetKobo: -100,
    },
  }));

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.error.code, 'VALIDATION_ERROR');
  assert.match(result.body.error.message, /estimated_budget_kobo must be a non-negative integer/i);
});

test('21. Service appointment validation enforces preferred_date when required', async () => {
  const appointmentService = {
    ...mockService,
    requires_file_upload: false,
    requires_appointment: true,
  };

  const result = await withRepositoryStub({
    getServiceByIdentifier: async () => appointmentService,
  }, () => request(`/api/v1/services/${appointmentService.id}/requests`, {
    method: 'POST',
    headers: { Authorization: getAuthHeader() },
    body: {
      deliveryType: 'IN_PERSON',
      description: 'Hostel AC maintenance consultation',
    },
  }));

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.error.code, 'VALIDATION_ERROR');
  assert.match(result.body.error.message, /preferred_date is required/i);
});
