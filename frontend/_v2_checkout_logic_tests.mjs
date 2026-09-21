const storage = {};
global.localStorage = {
    getItem: (key) => key in storage ? storage[key] : null,
    setItem: (key, value) => { storage[key] = String(value); },
    removeItem: (key) => { delete storage[key]; }
};

// Use internal node webcrypto if available, or just skip mock if already present
import { webcrypto } from 'node:crypto';
if (!global.crypto) {
    global.crypto = webcrypto;
}

const { buildCustomerOrderItems, generateIdempotencyKey, generateTrackingToken } = await import('./js/customer-orders.js');
const { api } = await import('./js/api.js');

let passed = 0;
let failed = 0;
const test = (name, condition) => {
    if (condition) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}`); }
};

console.log('=== CLX V2 Checkout Logic Tests ===');

// 1. Idempotency Key Generation
const idKey = generateIdempotencyKey();
test('generateIdempotencyKey returns a UUID string', typeof idKey === 'string' && idKey.length === 36);

// 2. Tracking Token Generation
const token = generateTrackingToken();
test('generateTrackingToken returns 64 lowercase hex characters', /^[0-9a-f]{64}$/.test(token));

// 3. Payload Contract (V2)
const cart = [
    { id: '11111111-1111-4111-8111-111111111111', quantity: 2, price: 2500, isLiveProduct: true }
];
const items = buildCustomerOrderItems(cart);
test('buildCustomerOrderItems includes client_unit_price_kobo', items[0].client_unit_price_kobo === 250000);

// 4. API V2 Integration check (static inspection)
const apiStr = (await import('fs')).readFileSync('./js/api.js', 'utf8');
test('api.js calls create_customer_order_v2', apiStr.includes("rpc('create_customer_order_v2'"));
test('api.js passes p_idempotency_key', apiStr.includes("p_idempotency_key: order.idempotencyKey"));
test('api.js passes p_tracking_token', apiStr.includes("p_tracking_token: order.trackingToken"));

console.log(`\nV2 Logic Summary: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
