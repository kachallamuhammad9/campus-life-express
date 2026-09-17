import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapCustomerOrder } from './js/api.js';

const uuid = '348328a7-09a9-4e3e-8ab6-642f72d3dffa';
const base = {
    id: uuid,
    order_number: 'CLX-2026-0012',
    fulfillment_type: 'PICKUP', total_kobo: 50000,
    status: 'ORDER_RECEIVED', created_at: '2026-09-16T12:00:00Z',
    customer_order_payments: [{ payment_method: 'BANK_TRANSFER', status: 'PENDING' }]
};
const map = (orders, extra = {}) => mapCustomerOrder({ ...base, ...extra, orders });

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS: ${name}`); }

test('uses customer order number, not UUID, as customer reference', () => {
    const result = map([]);
    assert.equal(result.referenceLabel, 'Order #CLX-2026-0012');
    assert.equal(result.id, uuid); // retained for internal payment action only
    assert(!result.referenceLabel.includes(uuid));
});
test('uses live vendor name for a one-vendor order', () => {
    assert.equal(map([{ vendor: { name: 'Zobo Hub' }, order_items: [{ product_name_snapshot: 'Zobo', vendor_name_snapshot: 'Old Zobo Hub' }] }]).vendor, 'Zobo Hub');
});
test('lists every vendor for a multi-vendor order', () => {
    assert.equal(map([{ vendor: { name: 'Vendor A' }, order_items: [] }, { vendor: { name: 'Vendor B' }, order_items: [] }]).vendor, 'Vendor A • Vendor B');
});
test('uses immutable vendor snapshot when live relation is unavailable', () => {
    assert.equal(map([{ order_items: [{ vendor_name_snapshot: 'Snapshot Vendor' }] }]).vendor, 'Snapshot Vendor');
});
test('has professional fallbacks without exposing UUID', () => {
    const result = map([], { order_number: null });
    assert.equal(result.referenceLabel, 'Order details');
    assert.equal(result.vendor, 'Vendor details unavailable');
    assert(!JSON.stringify({ referenceLabel: result.referenceLabel, vendor: result.vendor }).includes(uuid));
});
test('authenticated history remains server scoped with no local-order merge', () => {
    const source = readFileSync(new URL('./js/api.js', import.meta.url), 'utf8');
    assert.match(source, /from\('customer_orders'\)[\s\S]*?\.eq\('customer_user_id', userId\)/);
    assert.doesNotMatch(source.slice(source.indexOf('async listCustomerOrders'), source.indexOf('async getCheckoutCampus')), /localStorage|STORAGE_KEYS\.ORDERS/);
});
test('orders UI renders customer reference and rejects stale session responses', () => {
    const source = readFileSync(new URL('./orders.html', import.meta.url), 'utf8');
    assert.match(source, /\$\{order\.referenceLabel\}/);
    assert.doesNotMatch(source, /\$\{order\.id\}\s*•\s*\$\{order\.type/);
    assert.match(source, /currentUser\.id !== user\.id\) return/);
});
console.log(`MY ORDERS DISPLAY: ${passed}/${passed} PASS`);
