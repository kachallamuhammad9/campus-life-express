import { readFile } from 'node:fs/promises';

const [api, orders, delivery, config] = await Promise.all([
    readFile(new URL('./js/api.js', import.meta.url), 'utf8'),
    readFile(new URL('./orders.html', import.meta.url), 'utf8'),
    readFile(new URL('./delivery.html', import.meta.url), 'utf8'),
    readFile(new URL('./vite.config.js', import.meta.url), 'utf8')
]);
let passed = 0;
let failed = 0;
const test = (name, condition) => {
    if (condition) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}`); }
};

test('legacy transport makes no fetch call', !api.includes('fetch(') && api.includes("code: 'RETIRED_API'"));
test('no active Express base URL remains', !api.includes('API_BASE') && !api.includes('VITE_API_BASE_URL'));
test('orders page does not load legacy orders or deliveries', !orders.includes('api.orders.list()') && !orders.includes('api.delivery.list()'));
test('delivery page does not request retired delivery API', !delivery.includes('api.delivery.requestDelivery'));
test('Supabase customer order V2 RPC remains', api.includes("rpc('create_customer_order_v2'"));
test('Supabase tracking RPC remains', api.includes("rpc('get_customer_order_tracking'"));
test('Vite remains static without Express middleware', !config.includes('clx-backend') && !config.includes('configureServer'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);