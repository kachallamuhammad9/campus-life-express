import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapCustomerOrder } from './js/api.js';

const root = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(root, '..', 'supabase', 'migrations', '0033_customer_order_payments_customer_select.sql'), 'utf8');
const api = readFileSync(join(root, 'js', 'api.js'), 'utf8');
const orders = readFileSync(join(root, 'orders.html'), 'utf8');
const auth = readFileSync(join(root, 'js', 'admin-auth.js'), 'utf8');
const paymentRpc = readFileSync(join(root, '..', 'supabase', 'migrations', '0024_verify_customer_order_payment.sql'), 'utf8');
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS: ${name}`); };

const baseOrder = { order_number: 'CLX-2026-0026', status: 'PREPARING', total_kobo: 50000, orders: [] };

test('migration creates customer-owned SELECT policy', () => {
    assert.match(migration, /create policy customer_order_payments_select_own/i);
    assert.match(migration, /for select\s+to authenticated/i);
    assert.match(migration, /co\.id = customer_order_payments\.customer_order_id/i);
    assert.match(migration, /co\.customer_user_id = auth\.uid\(\)/i);
});

test('migration does not add customer payment writes', () => {
    assert.doesNotMatch(migration, /for insert|for update|for delete|with check/i);
});

test('admin SELECT path and admin verification remain present', () => {
    assert.match(readFileSync(join(root, '..', 'supabase', 'migrations', '0022_phase2_customer_orders.sql'), 'utf8'), /customer_order_payments_select_admin/);
    assert.match(paymentRpc, /not public\.is_admin\(\)/);
    assert.match(paymentRpc, /grant execute on function public\.verify_customer_order_payment\(uuid\) to authenticated, service_role/);
});

test('customer mapper preserves actual PENDING and PAID statuses', () => {
    assert.equal(mapCustomerOrder({ ...baseOrder, customer_order_payments: { status: 'PENDING', payment_method: 'BANK_TRANSFER' } }).paymentStatus, 'PENDING');
    assert.equal(mapCustomerOrder({ ...baseOrder, customer_order_payments: { status: 'PAID', payment_method: 'BANK_TRANSFER' } }).paymentStatus, 'PAID');
});

test('customer mapper uses neutral state when payment relation is unavailable', () => {
    assert.equal(mapCustomerOrder(baseOrder).paymentStatus, 'Payment status unavailable');
});

test('dead View payment control is removed', () => {
    assert.doesNotMatch(orders, /payment-status-btn|View payment/);
});

test('customer order ownership and admin authorization code remain unchanged', () => {
    assert.match(api, /eq\('customer_user_id', userId\)/);
    assert.match(auth, /supabase\.rpc\('is_admin'\)/);
});

test('no service-role or direct payment mutation was added to Web files', () => {
    assert.doesNotMatch(api, /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY\s*=/i);
    assert.doesNotMatch(orders, /customer_order_payments.*\.(insert|update|delete|upsert)/i);
});

console.log(`\n${passed} passed, 0 failed`);
