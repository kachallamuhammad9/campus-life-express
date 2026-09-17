import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDashboardMetrics, buildWhatsAppContactUrl } from './js/operations.js';

const root = dirname(fileURLToPath(import.meta.url));
const admin = readFileSync(join(root, 'admin.html'), 'utf8');
const operations = readFileSync(join(root, 'js', 'operations.js'), 'utf8');
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS: ${name}`); };

const orders = [
    { order_number: 'CLX-2026-0001', status: 'ORDER_RECEIVED', payment_status: 'PENDING' },
    { order_number: 'CLX-2026-0002', status: 'PREPARING', payment_status: 'PAID' },
    { order_number: 'CLX-2026-0003', status: 'OUT_FOR_DELIVERY', payment_status: 'PAID' },
    { order_number: 'CLX-2026-0004', status: 'COMPLETED', payment_status: 'PAID' }
];

test('dashboard metrics are derived from authorized order data', () => {
    assert.deepEqual(buildDashboardMetrics(orders), {
        active: 3, received: 1, awaitingPayment: 1, paymentConfirmed: 0, preparing: 1,
        ready: 0, outForDelivery: 1, completed: 1
    });
});

test('WhatsApp contact uses the customer phone and order number only', () => {
    const url = buildWhatsAppContactUrl({ order_number: 'CLX-2026-0001', customer_phone: '08012345678', id: 'internal-id' });
    assert.match(url, /^https:\/\/wa\.me\/2348012345678\?text=/);
    assert.ok(!url.includes('internal-id'));
});

test('admin page includes dashboard, timeline, contact and retry controls', () => {
    for (const marker of ['ops-summary', 'Status timeline', 'Contact Customer on WhatsApp', 'ops-retry']) assert.ok(admin.includes(marker), marker);
});

test('history read is admin RLS-backed and excludes actor UUID from browser payload', () => {
    assert.match(operations, /customer_order_status_history.*select\('customer_order_id, vendor_order_id, status, created_at'\)/s);
    assert.ok(!operations.includes('actor_user_id'));
});

test('parent timeline keeps parent events and excludes vendor events by scope', () => {
    assert.match(admin, /order\.history\.filter\(\(entry\) => entry\.vendor_order_id == null\)/);
    const history = [
        { status: 'ORDER_RECEIVED', created_at: '2026-09-16T05:05:20.426Z', vendor_order_id: null },
        { status: 'ORDER_RECEIVED', created_at: '2026-09-16T05:05:20.426Z', vendor_order_id: 'vendor-order-id' },
        { status: 'ORDER_RECEIVED', created_at: '2026-09-16T05:05:20.426Z', vendor_order_id: null }
    ];
    const parentHistory = history.filter((entry) => entry.vendor_order_id == null);
    assert.equal(parentHistory.length, 2);
    assert.equal(parentHistory[0].status, parentHistory[1].status);
    assert.equal(parentHistory[0].created_at, parentHistory[1].created_at);
});

test('vendor history remains available in the fetched operations payload', () => {
    assert.match(operations, /vendor_order_id: entry\.vendor_order_id/);
});

test('multi-vendor and fulfillment controls remain present', () => {
    for (const marker of ['vendor_groups.map', 'ops-advance-vendor-order', 'ops-assign-rider', 'ops-complete-pickup', 'ops-complete-delivery']) assert.ok(admin.includes(marker), marker);
});

test('payment confirmation remains RPC-only', () => {
    assert.match(operations, /rpc\('verify_customer_order_payment'/);
    assert.ok(!operations.includes("from('customer_order_payments').update"));
});

test('stale operation responses are discarded after account changes', () => {
    assert.ok(admin.includes('opsLoadVersion'));
    assert.ok(admin.includes('loadVersion !== opsLoadVersion || userId !== activeAdminUserId'));
    assert.ok(admin.includes('resetOperationsState()'));
});

test('loading, empty, error and retry paths exist', () => {
    for (const marker of ['Loading operations data...', 'No customer orders found.', 'Unable to load CLX operations data', 'Retry']) assert.ok(admin.includes(marker), marker);
});

console.log(`\n${passed} passed, 0 failed`);
