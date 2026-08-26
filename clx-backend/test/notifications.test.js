const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const notificationRepository = require('../src/repositories/notificationRepository');
const userRepository = require('../src/repositories/userRepository');
const notificationService = require('../src/services/notificationService');
const emailProvider = require('../src/utils/emailProvider');
const gasService = require('../src/services/gasService');
const {
  TEST_USER_ID,
  TEST_ADMIN_ID,
  getAuthHeader,
} = require('./helpers/authHelper');

const OTHER_USER_ID = '00000000-0000-4000-8000-000000000099';
const SAMPLE_NOTIFICATION_ID_1 = '00000000-0000-4000-8000-000000000701';
const SAMPLE_NOTIFICATION_ID_2 = '00000000-0000-4000-8000-000000000702';
const SAMPLE_NOTIFICATION_ID_3 = '00000000-0000-4000-8000-000000000703';

const SAMPLE_NOTIFICATIONS = [
  {
    id: SAMPLE_NOTIFICATION_ID_1,
    user_id: TEST_USER_ID,
    type: 'ORDER_UPDATE',
    title: 'Order Placed',
    message: 'Your food order has been placed successfully.',
    related_order_id: '00000000-0000-4000-8000-000000000101',
    related_service_request_id: null,
    related_delivery_request_id: null,
    is_read: false,
    read_at: null,
    created_at: '2026-08-23T10:00:00.000Z',
  },
  {
    id: SAMPLE_NOTIFICATION_ID_2,
    user_id: TEST_USER_ID,
    type: 'DELIVERY_UPDATE',
    title: 'Delivery In Transit',
    message: 'Rider is on the way with your package.',
    related_order_id: null,
    related_service_request_id: null,
    related_delivery_request_id: '00000000-0000-4000-8000-000000000201',
    is_read: true,
    read_at: '2026-08-23T10:30:00.000Z',
    created_at: '2026-08-23T09:00:00.000Z',
  },
  {
    id: SAMPLE_NOTIFICATION_ID_3,
    user_id: OTHER_USER_ID,
    type: 'MARKETPLACE_UPDATE',
    title: 'Listing Approved',
    message: 'Your calculator listing is now live.',
    related_order_id: null,
    related_service_request_id: null,
    related_delivery_request_id: null,
    is_read: false,
    read_at: null,
    created_at: '2026-08-23T08:00:00.000Z',
  },
];

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
                status: res.statusCode,
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
  const original = {};
  for (const [targetModule, methods] of stubs) {
    original[targetModule] = {};
    for (const [methodName, stubFn] of Object.entries(methods)) {
      original[targetModule][methodName] = targetModule[methodName];
      targetModule[methodName] = stubFn;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [targetModule, methods] of stubs) {
      for (const methodName of Object.keys(methods)) {
        targetModule[methodName] = original[targetModule][methodName];
      }
    }
  }
};

test('Phase 14 - In-App & Email Notifications Test Suite', async (t) => {
  // Reset sent emails before running test suite
  emailProvider.clearSentEmails();

  await t.test('1. Authentication & Access Control', async (t2) => {
    await t2.test('1.1 Should return 401 UNAUTHORIZED when no auth header is provided', async () => {
      const res = await request('/api/v1/notifications');
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
    });

    await t2.test('1.2 Should return 401 UNAUTHORIZED when malformed token is provided', async () => {
      const res = await request('/api/v1/notifications', {
        headers: { Authorization: 'Bearer invalid-token-string' },
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    await t2.test('1.3 Should succeed with valid Bearer token and return user notifications', async () => {
      const authHeader = getAuthHeader({ sub: TEST_USER_ID });

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({
                id,
                email: 'student@unimaid.edu.ng',
                is_active: true,
              }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
          [
            notificationRepository,
            {
              getNotificationsByUser: async (userId) => {
                assert.equal(userId, TEST_USER_ID);
                return [SAMPLE_NOTIFICATIONS[0], SAMPLE_NOTIFICATIONS[1]];
              },
              getUnreadCountByUser: async (userId) => {
                assert.equal(userId, TEST_USER_ID);
                return 1;
              },
            },
          ],
        ],
        async () => {
          const res = await request('/api/v1/notifications', {
            headers: { Authorization: authHeader },
          });

          assert.equal(res.status, 200);
          assert.equal(res.body.success, true);
          assert.equal(res.body.data.notifications.length, 2);
          assert.equal(res.body.data.unreadCount, 1);
          assert.equal(res.body.data.notifications[0].id, SAMPLE_NOTIFICATION_ID_1);
          assert.equal(res.body.data.notifications[0].type, 'ORDER_UPDATE');
        }
      );
    });

    await t2.test('1.4 Should return unread notification count badge for authenticated user', async () => {
      const authHeader = getAuthHeader({ sub: TEST_USER_ID });

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
          [
            notificationRepository,
            {
              getUnreadCountByUser: async (userId) => {
                assert.equal(userId, TEST_USER_ID);
                return 5;
              },
            },
          ],
        ],
        async () => {
          const res = await request('/api/v1/notifications/unread-count', {
            headers: { Authorization: authHeader },
          });

          assert.equal(res.status, 200);
          assert.equal(res.body.success, true);
          assert.equal(res.body.data.unreadCount, 5);
        }
      );
    });

    await t2.test('1.5 Should retrieve a single notification by ID if owned by user', async () => {
      const authHeader = getAuthHeader({ sub: TEST_USER_ID });

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
          [
            notificationRepository,
            {
              getNotificationById: async (id) => {
                assert.equal(id, SAMPLE_NOTIFICATION_ID_1);
                return SAMPLE_NOTIFICATIONS[0];
              },
            },
          ],
        ],
        async () => {
          const res = await request(`/api/v1/notifications/${SAMPLE_NOTIFICATION_ID_1}`, {
            headers: { Authorization: authHeader },
          });

          assert.equal(res.status, 200);
          assert.equal(res.body.success, true);
          assert.equal(res.body.data.notification.id, SAMPLE_NOTIFICATION_ID_1);
          assert.equal(res.body.data.notification.title, 'Order Placed');
        }
      );
    });

    await t2.test('1.6 Should return 404 NOT_FOUND when requesting another user\'s notification', async () => {
      const authHeader = getAuthHeader({ sub: TEST_USER_ID });

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
          [
            notificationRepository,
            {
              getNotificationById: async (id) => {
                // Notification belongs to OTHER_USER_ID
                return SAMPLE_NOTIFICATIONS[2];
              },
            },
          ],
        ],
        async () => {
          const res = await request(`/api/v1/notifications/${SAMPLE_NOTIFICATION_ID_3}`, {
            headers: { Authorization: authHeader },
          });

          assert.equal(res.status, 404);
          assert.equal(res.body.success, false);
          assert.equal(res.body.error.code, 'NOTIFICATION_NOT_FOUND');
        }
      );
    });

    await t2.test('1.7 Should allow admin user to view any user\'s notification', async () => {
      const authHeader = getAuthHeader({ sub: TEST_ADMIN_ID });

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['ADMIN'],
            },
          ],
          [
            notificationRepository,
            {
              getNotificationById: async () => SAMPLE_NOTIFICATIONS[2],
            },
          ],
        ],
        async () => {
          const res = await request(`/api/v1/notifications/${SAMPLE_NOTIFICATION_ID_3}`, {
            headers: { Authorization: authHeader },
          });

          assert.equal(res.status, 200);
          assert.equal(res.body.success, true);
          assert.equal(res.body.data.notification.id, SAMPLE_NOTIFICATION_ID_3);
        }
      );
    });
  });

  await t.test('2. Read/Unread State Transitions', async (t2) => {
    await t2.test('2.1 PATCH /:id/read should mark notification as read with timestamp', async () => {
      const authHeader = getAuthHeader({ sub: TEST_USER_ID });
      let markCalled = false;

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
          [
            notificationRepository,
            {
              getNotificationById: async () => SAMPLE_NOTIFICATIONS[0], // is_read: false
              markAsRead: async (id, userId) => {
                markCalled = true;
                assert.equal(id, SAMPLE_NOTIFICATION_ID_1);
                assert.equal(userId, TEST_USER_ID);
                return {
                  ...SAMPLE_NOTIFICATIONS[0],
                  is_read: true,
                  read_at: '2026-08-23T11:00:00.000Z',
                };
              },
            },
          ],
        ],
        async () => {
          const res = await request(`/api/v1/notifications/${SAMPLE_NOTIFICATION_ID_1}/read`, {
            method: 'PATCH',
            headers: { Authorization: authHeader },
          });

          assert.equal(res.status, 200);
          assert.equal(res.body.success, true);
          assert.equal(markCalled, true);
          assert.equal(res.body.data.notification.isRead, true);
          assert.ok(res.body.data.notification.readAt);
        }
      );
    });

    await t2.test('2.2 PATCH /:id/read on already-read notification returns current state gracefully', async () => {
      const authHeader = getAuthHeader({ sub: TEST_USER_ID });
      let markCalled = false;

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
          [
            notificationRepository,
            {
              getNotificationById: async () => SAMPLE_NOTIFICATIONS[1], // is_read: true already
              markAsRead: async () => {
                markCalled = true;
              },
            },
          ],
        ],
        async () => {
          const res = await request(`/api/v1/notifications/${SAMPLE_NOTIFICATION_ID_2}/read`, {
            method: 'PATCH',
            headers: { Authorization: authHeader },
          });

          assert.equal(res.status, 200);
          assert.equal(res.body.success, true);
          assert.equal(markCalled, false); // Didn't need unnecessary DB write
          assert.equal(res.body.data.notification.isRead, true);
        }
      );
    });

    await t2.test('2.3 PATCH /:id/read should prevent marking another user\'s notification', async () => {
      const authHeader = getAuthHeader({ sub: TEST_USER_ID });

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
          [
            notificationRepository,
            {
              getNotificationById: async () => SAMPLE_NOTIFICATIONS[2], // Owned by OTHER_USER_ID
            },
          ],
        ],
        async () => {
          const res = await request(`/api/v1/notifications/${SAMPLE_NOTIFICATION_ID_3}/read`, {
            method: 'PATCH',
            headers: { Authorization: authHeader },
          });

          assert.equal(res.status, 404);
          assert.equal(res.body.success, false);
        }
      );
    });

    await t2.test('2.4 PATCH /read-all and POST /read-all should mark all notifications as read', async () => {
      const authHeader = getAuthHeader({ sub: TEST_USER_ID });
      let markAllCount = 0;

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
          [
            notificationRepository,
            {
              markAllAsRead: async (userId) => {
                assert.equal(userId, TEST_USER_ID);
                markAllCount += 1;
                return {
                  updatedCount: 3,
                  updatedIds: [SAMPLE_NOTIFICATION_ID_1],
                };
              },
            },
          ],
        ],
        async () => {
          // Test PATCH
          const patchRes = await request('/api/v1/notifications/read-all', {
            method: 'PATCH',
            headers: { Authorization: authHeader },
          });
          assert.equal(patchRes.status, 200);
          assert.equal(patchRes.body.success, true);
          assert.equal(patchRes.body.data.updatedCount, 3);

          // Test POST
          const postRes = await request('/api/v1/notifications/read-all', {
            method: 'POST',
            headers: { Authorization: authHeader },
          });
          assert.equal(postRes.status, 200);
          assert.equal(postRes.body.success, true);
          assert.equal(markAllCount, 2);
        }
      );
    });

    await t2.test('2.5 DELETE /:id should delete notification belonging to user', async () => {
      const authHeader = getAuthHeader({ sub: TEST_USER_ID });
      let deletedCalled = false;

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
          [
            notificationRepository,
            {
              getNotificationById: async () => SAMPLE_NOTIFICATIONS[0],
              deleteNotification: async (id, userId) => {
                deletedCalled = true;
                assert.equal(id, SAMPLE_NOTIFICATION_ID_1);
                assert.equal(userId, TEST_USER_ID);
                return true;
              },
            },
          ],
        ],
        async () => {
          const res = await request(`/api/v1/notifications/${SAMPLE_NOTIFICATION_ID_1}`, {
            method: 'DELETE',
            headers: { Authorization: authHeader },
          });

          assert.equal(res.status, 200);
          assert.equal(res.body.success, true);
          assert.equal(deletedCalled, true);
          assert.equal(res.body.data.deleted, true);
        }
      );
    });
  });

  await t.test('3. Query Filtering & Validation', async (t2) => {
    const authHeader = getAuthHeader({ sub: TEST_USER_ID });

    await t2.test('3.1 Should filter unread notifications with unreadOnly=true', async () => {
      let passedFilter = null;

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
          [
            notificationRepository,
            {
              getNotificationsByUser: async (userId, options) => {
                passedFilter = options.isRead;
                return [SAMPLE_NOTIFICATIONS[0]];
              },
              getUnreadCountByUser: async () => 1,
            },
          ],
        ],
        async () => {
          const res = await request('/api/v1/notifications?unreadOnly=true', {
            headers: { Authorization: authHeader },
          });

          assert.equal(res.status, 200);
          assert.equal(passedFilter, false);
        }
      );
    });

    await t2.test('3.2 Should filter notifications by type', async () => {
      let passedType = null;

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
          [
            notificationRepository,
            {
              getNotificationsByUser: async (userId, options) => {
                passedType = options.type;
                return [SAMPLE_NOTIFICATIONS[0]];
              },
              getUnreadCountByUser: async () => 1,
            },
          ],
        ],
        async () => {
          const res = await request('/api/v1/notifications?type=ORDER_UPDATE', {
            headers: { Authorization: authHeader },
          });

          assert.equal(res.status, 200);
          assert.equal(passedType, 'ORDER_UPDATE');
        }
      );
    });

    await t2.test('3.3 Should reject invalid notification type with 400', async () => {
      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
        ],
        async () => {
          const res = await request('/api/v1/notifications?type=INVALID_RANDOM_TYPE', {
            headers: { Authorization: authHeader },
          });

          assert.equal(res.status, 400);
          assert.equal(res.body.success, false);
          assert.equal(res.body.error.code, 'INVALID_NOTIFICATION_TYPE');
        }
      );
    });
  });

  await t.test('4. Administrative Broadcast', async (t2) => {
    await t2.test('4.1 Non-admin user receives 403 FORBIDDEN on broadcast', async () => {
      const studentAuth = getAuthHeader({ sub: TEST_USER_ID });

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
        ],
        async () => {
          const res = await request('/api/v1/notifications/broadcast', {
            method: 'POST',
            headers: { Authorization: studentAuth },
            body: {
              targetUserIds: [TEST_USER_ID],
              title: 'Test Broadcast',
              message: 'Campus power maintenance notice.',
            },
          });

          assert.equal(res.status, 403);
          assert.equal(res.body.success, false);
          assert.equal(res.body.error.code, 'FORBIDDEN');
        }
      );
    });

    await t2.test('4.2 Admin can broadcast system announcements to multiple users', async () => {
      const adminAuth = getAuthHeader({ sub: TEST_ADMIN_ID });
      const createdList = [];

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['ADMIN'],
            },
          ],
          [
            notificationRepository,
            {
              createNotification: async (payload) => {
                createdList.push(payload);
                return {
                  id: `notif-${createdList.length}`,
                  ...payload,
                  created_at: new Date().toISOString(),
                };
              },
            },
          ],
        ],
        async () => {
          const res = await request('/api/v1/notifications/broadcast', {
            method: 'POST',
            headers: { Authorization: adminAuth },
            body: {
              targetUserIds: [TEST_USER_ID, OTHER_USER_ID],
              title: 'Campus Notice',
              message: 'Exam schedule released for semester 2.',
            },
          });

          assert.equal(res.status, 200);
          assert.equal(res.body.success, true);
          assert.equal(res.body.data.broadcastCount, 2);
          assert.equal(res.body.data.successCount, 2);
          assert.equal(createdList.length, 2);
        }
      );
    });
  });

  await t.test('5. Email Provider Abstraction & Stub Handling', async (t2) => {
    await t2.test('5.1 emailProvider.sendEmail records into buffer in stub mode', async () => {
      emailProvider.clearSentEmails();

      const result = await emailProvider.sendEmail({
        to: 'student@unimaid.edu.ng',
        subject: 'Order Confirmation #12345',
        text: 'Your order has been placed.',
        html: '<p>Your order has been placed.</p>',
        metadata: { orderId: '12345' },
      });

      assert.equal(result.success, true);
      assert.equal(result.provider, 'stub');
      assert.ok(result.messageId);

      const buffer = emailProvider.getSentEmails();
      assert.equal(buffer.length, 1);
      assert.equal(buffer[0].to, 'student@unimaid.edu.ng');
      assert.equal(buffer[0].subject, 'Order Confirmation #12345');
    });

    await t2.test('5.2 emailProvider validates email address and rejects invalid emails', async () => {
      assert.equal(emailProvider.isValidEmail('valid@unimaid.edu.ng'), true);
      assert.equal(emailProvider.isValidEmail('not-an-email'), false);
      assert.equal(emailProvider.isValidEmail(''), false);

      const res = await emailProvider.sendEmail({
        to: 'invalid-email-string',
        subject: 'Test Subject',
      });
      assert.equal(res.success, false);
      assert.match(res.error, /Invalid email recipient/);
    });

    await t2.test('5.3 Custom provider registration and invocation', async () => {
      let customInvoked = false;
      emailProvider.registerCustomProvider('test_custom', async (payload) => {
        customInvoked = true;
        return {
          success: true,
          provider: 'test_custom',
          customTag: 'CUSTOM_SENT',
          to: payload.to,
        };
      });

      // Override config provider temporarily
      const originalProvider = emailProvider.getEmailProviderStatus().configuredProvider;
      require('../src/config/env').emailProvider = 'test_custom';

      try {
        const customRes = await emailProvider.sendEmail({
          to: 'customer@unimaid.edu.ng',
          subject: 'Custom Provider Test',
        });
        assert.equal(customRes.success, true);
        assert.equal(customInvoked, true);
        assert.equal(customRes.provider, 'test_custom');
      } finally {
        require('../src/config/env').emailProvider = originalProvider;
      }
    });

    await t2.test('5.4 GET /api/v1/notifications/email-status returns diagnostics', async () => {
      const authHeader = getAuthHeader({ sub: TEST_USER_ID });

      await withStubs(
        [
          [
            userRepository,
            {
              getUserProfileById: async (id) => ({ id, is_active: true }),
              getUserRoles: async () => ['STUDENT'],
            },
          ],
        ],
        async () => {
          const res = await request('/api/v1/notifications/email-status', {
            headers: { Authorization: authHeader },
          });

          assert.equal(res.status, 200);
          assert.equal(res.body.success, true);
          assert.ok(res.body.data.configuredProvider);
          assert.ok(res.body.data.defaultSender);
        }
      );
    });

    await t2.test('5.5 SMTP mode requires complete provider configuration', async () => {
      const env = require('../src/config/env');
      const originalProvider = env.emailProvider;
      const originalHost = env.smtpHost;
      const originalUser = env.smtpUser;
      const originalPass = env.smtpPass;

      env.emailProvider = 'smtp';
      env.smtpHost = null;
      env.smtpUser = null;
      env.smtpPass = null;

      try {
        const status = emailProvider.getEmailProviderStatus();
        const result = await emailProvider.sendEmail({
          to: 'student@unimaid.edu.ng',
          subject: 'SMTP configuration test',
        });
        assert.equal(status.isConfigured, false);
        assert.equal(result.success, false);
        assert.equal(result.provider, 'smtp');
      } finally {
        env.emailProvider = originalProvider;
        env.smtpHost = originalHost;
        env.smtpUser = originalUser;
        env.smtpPass = originalPass;
      }
    });
  });

  await t.test('6. Event Triggers, GAS Integration & Fault Tolerance', async (t2) => {
    await t2.test('6.1 notifyOrderCreated sends in-app notice, email and dispatches GAS hook', async () => {
      let createdNotif = null;
      let gasDispatched = null;

      emailProvider.clearSentEmails();

      await withStubs(
        [
          [
            notificationRepository,
            {
              createNotification: async (payload) => {
                createdNotif = payload;
                return {
                  id: SAMPLE_NOTIFICATION_ID_1,
                  ...payload,
                  created_at: new Date().toISOString(),
                };
              },
            },
          ],
          [
            gasService,
            {
              dispatchNotificationHook: async (envelope) => {
                gasDispatched = envelope;
                return { success: true };
              },
            },
          ],
        ],
        async () => {
          const sampleOrder = {
            id: '00000000-0000-4000-8000-000000000555',
            user_id: TEST_USER_ID,
            total_kobo: 250000,
            payment_method: 'CASH_ON_DELIVERY',
          };

          const results = await notificationService.notifyOrderCreated(sampleOrder, {
            customerEmail: 'student@unimaid.edu.ng',
          });

          assert.equal(Array.isArray(results), true);
          assert.ok(createdNotif);
          assert.equal(createdNotif.userId || createdNotif.user_id, TEST_USER_ID);
          assert.equal(createdNotif.type, 'ORDER_UPDATE');
          assert.equal(createdNotif.relatedOrderId || createdNotif.related_order_id, sampleOrder.id);

          // Verify GAS hook received ORDER_CREATED
          assert.ok(gasDispatched);
          assert.equal(gasDispatched.eventType, 'ORDER_CREATED');

          // Verify Email Buffer received confirmation
          const sentEmails = emailProvider.getSentEmails();
          assert.ok(sentEmails.length >= 1);
          assert.equal(sentEmails[0].to, 'student@unimaid.edu.ng');
        }
      );
    });

    await t2.test('6.2 notifyOrderStatusChanged creates status notification', async () => {
      let createdNotif = null;

      await withStubs(
        [
          [
            notificationRepository,
            {
              createNotification: async (payload) => {
                createdNotif = payload;
                return {
                  id: SAMPLE_NOTIFICATION_ID_1,
                  ...payload,
                  created_at: new Date().toISOString(),
                };
              },
            },
          ],
          [
            gasService,
            {
              dispatchNotificationHook: async () => ({ success: true }),
            },
          ],
        ],
        async () => {
          const sampleOrder = {
            id: '00000000-0000-4000-8000-000000000555',
            user_id: TEST_USER_ID,
          };

          await notificationService.notifyOrderStatusChanged(sampleOrder, 'PREPARING', 'IN_TRANSIT');

          assert.ok(createdNotif);
          assert.equal(createdNotif.type, 'ORDER_UPDATE');
          assert.match(createdNotif.message, /is on the way/);
        }
      );
    });

    await t2.test('6.3 notifyDeliveryStatusChanged creates delivery update notification', async () => {
      let createdNotif = null;

      await withStubs(
        [
          [
            notificationRepository,
            {
              createNotification: async (payload) => {
                createdNotif = payload;
                return {
                  id: SAMPLE_NOTIFICATION_ID_2,
                  ...payload,
                  created_at: new Date().toISOString(),
                };
              },
            },
          ],
          [
            gasService,
            {
              dispatchNotificationHook: async () => ({ success: true }),
            },
          ],
        ],
        async () => {
          const delivery = {
            id: '00000000-0000-4000-8000-000000000999',
            requester_user_id: TEST_USER_ID,
            status: 'DELIVERED',
          };

          await notificationService.notifyDeliveryStatusChanged(delivery);

          assert.ok(createdNotif);
          assert.equal(createdNotif.type, 'DELIVERY_UPDATE');
          assert.equal(createdNotif.relatedDeliveryRequestId || createdNotif.related_delivery_request_id, delivery.id);
        }
      );
    });

    await t2.test('6.4 Safe failure handling: GAS or Email errors never throw or break operations', async () => {
      let createdNotif = null;

      await withStubs(
        [
          [
            notificationRepository,
            {
              createNotification: async (payload) => {
                createdNotif = payload;
                return {
                  id: SAMPLE_NOTIFICATION_ID_1,
                  ...payload,
                  created_at: new Date().toISOString(),
                };
              },
            },
          ],
          [
            gasService,
            {
              dispatchNotificationHook: async () => {
                throw new Error('GAS webhook timeout / network offline');
              },
            },
          ],
          [
            emailProvider,
            {
              sendEmail: async () => {
                throw new Error('SMTP host unreachable');
              },
            },
          ],
        ],
        async () => {
          // Should not throw
          const res = await notificationService.safeNotify({
            userId: TEST_USER_ID,
            type: 'ORDER_UPDATE',
            title: 'Order Placed',
            message: 'Your order was placed.',
            emailRecipient: 'student@unimaid.edu.ng',
            sendEmail: true,
            dispatchGas: true,
            gasEventType: 'ORDER_CREATED',
          });

          assert.ok(res);
          assert.ok(createdNotif);
          assert.equal(res.notification.id, SAMPLE_NOTIFICATION_ID_1);
          assert.equal(res.emailResult.success, false);
          assert.equal(res.gasResult.success, false);
        }
      );
    });
  });
});
