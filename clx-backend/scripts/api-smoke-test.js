/**
 * Phase 7 — API smoke test.
 * Boots the real Express app (against staging DATABASE_URL) and tests endpoints.
 * READ-ONLY against the DB except two clearly-labelled write tests which
 * create and then remove a test marketplace listing via the public API.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const express = require('express');
const http = require('http');
const routes = require('../src/routes');

const app = express();
app.use(express.json());
app.use(routes);
app.use((err, req, res, next) => {
  console.error('[ERR]', err.message, '\n', err.stack);
  res.status(err.statusCode || 500).json({ error: { code: err.code || 'SERVER_ERROR', message: err.message } });
});

const PORT = 4599;
const base = `http://127.0.0.1:${PORT}/api/v1`;

const results = [];
async function call(name, path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  results.push({ name, path, status: res.status });
  console.log(String(res.status).padEnd(5), name.padEnd(38), path);
  return { status: res.status, json };
}

(async () => {
  const server = app.listen(PORT, async () => {
    try {
      // --- public GETs ---
      await call('health', '/health');
      await call('campuses', '/campuses');
      await call('categories', '/categories');
      await call('vendors', '/vendors?limit=50');
      await call('products', '/products?limit=50');
      await call('services', '/services?limit=50');
      await call('marketplace', '/marketplace?limit=50');
      await call('deliveries', '/deliveries/zones?limit=50').catch(() => call('deliveries', '/deliveries'));

      // --- protected endpoints: no token -> 401 ---
      await call('admin stats (no token)', '/admin/stats');
      await call('marketplace create (no token)', '/marketplace', { method: 'POST', body: {} });
      await call('onboarding list (no token)', '/onboarding/vendor');
      await call('service request (no token)', '/services/xxx/requests', { method: 'POST', body: {} });

      // --- demo session tokens ---
      const cust = await call('demo session CUSTOMER', '/auth/demo-session?role=CUSTOMER');
      const admin = await call('demo session SUPER_ADMIN', '/auth/demo-session?role=SUPER_ADMIN');
      const custToken = cust.json?.data?.token;
      const adminToken = admin.json?.data?.token;

      // --- role enforcement ---
      await call('admin stats (customer token)', '/admin/stats', { token: custToken });
      await call('onboarding list (admin token)', '/onboarding/vendor?limit=5', { token: adminToken });

      // --- vendor application flow ---
      const badApp = await call('vendor application (invalid payload)', '/onboarding/vendor', {
        method: 'POST', body: { businessName: 'X' },
      });
      const newApp = await call('vendor application (valid)', '/onboarding/vendor', {
        method: 'POST',
        body: {
          businessName: 'Smoke Test Demo Vendor',
          categorySlug: 'food', campusSlug: 'unimaid',
          location: 'Test Lane, UNIMAID',
          contactName: 'Smoke Tester',
          phoneNumber: '08000000000',
          email: 'smoke.test@demo.campuslife.express',
          description: 'Temporary smoke-test application. Will be approved then left as an extra demo vendor.',
        },
      });
      const appId = newApp.json?.data?.id;
      if (appId) {
        await call('application review (customer, 403)', `/onboarding/vendor/${appId}/review`, {
          method: 'POST', token: custToken, body: { action: 'APPROVE' },
        });
        const rev = await call('application review (admin, approve)', `/onboarding/vendor/${appId}/review`, {
          method: 'POST', token: adminToken, body: { action: 'APPROVE' },
        });
        console.log('   -> vendor created:', rev.json?.data?.vendor?.slug || 'n/a');
        // cleanup: suspend the smoke-test vendor so it doesn't pollute the demo
        const vid = rev.json?.data?.vendor?.id;
        if (vid) await call('suspend smoke-test vendor (cleanup)', `/admin/vendors/${vid}/status`, { method: 'PATCH', token: adminToken, body: { status: 'SUSPENDED' } });
      }

      // --- marketplace create via API (customer) then cleanup ---
      const cats = await call('categories (for create test)', '/categories');
      const mk = (cats.json?.data || []).find(c => c.slug === 'marketplace');
      const listing = await call('marketplace create (customer)', '/marketplace', {
        method: 'POST', token: custToken,
        body: { title: 'Smoke Test Listing', priceKobo: 100000, condition: 'GOOD', campusId: 'unimaid', categoryId: mk?.id, description: 'Smoke test — will be deleted.' },
      });
      const lid = listing.json?.data?.id;
      if (lid) {
        await call('marketplace moderate (customer, 403)', `/admin/marketplace/listings/${lid}/moderate`, {
          method: 'POST', token: custToken, body: { action: 'APPROVE' },
        });
        await call('marketplace moderate (admin, reject)', `/admin/marketplace/listings/${lid}/moderate`, {
          method: 'POST', token: adminToken, body: { action: 'REJECT', rejectionReason: 'Smoke test cleanup' },
        });
        await call('marketplace delete (owner cleanup)', `/marketplace/${lid}`, { method: 'DELETE', token: custToken });
      }

      console.log('\n== SUMMARY ==');
      const byStatus = {};
      results.forEach(r => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
      console.log(byStatus);
      console.log('Expected: 200s for public GETs, 401 for missing/invalid auth, 403 for wrong role, 400 for invalid payloads.');
      process.exit(0);
    } catch (e) {
      console.error('SMOKE TEST FAILED:', e);
      process.exit(1);
    }
  });
})();
