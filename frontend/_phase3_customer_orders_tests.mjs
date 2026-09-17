const storage = {};
global.localStorage = {
    getItem: (key) => key in storage ? storage[key] : null,
    setItem: (key, value) => { storage[key] = String(value); }
};

const { buildCustomerOrderItems, buildWhatsAppOrderMessage, buildWhatsAppOrderUrl, getSavedTrackingOrders, saveTrackingOrder } = await import('./js/customer-orders.js');
const { CLX_CONFIG } = await import('./js/data.js');
let passed = 0;
let failed = 0;
const test = (name, condition) => {
    if (condition) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}`); }
};

const firstProduct = '11111111-1111-4111-8111-111111111111';
const secondProduct = '22222222-2222-4222-8222-222222222222';
const cart = [{ id: firstProduct, quantity: 2, price: 1, isLiveProduct: true }, { id: secondProduct, quantity: 3, price: 999, isLiveProduct: true }];
const items = buildCustomerOrderItems(cart);
test('single/multi-vendor payload contains product ID and quantity only', JSON.stringify(items) === JSON.stringify([{ product_id: firstProduct, quantity: 2 }, { product_id: secondProduct, quantity: 3 }]));
test('invalid quantities are rejected before RPC', (() => { try { buildCustomerOrderItems([{ id: firstProduct, quantity: 51 }]); return false; } catch { return true; } })());
test('fallback/static products are blocked before RPC without changing the cart', (() => { const fallback = [{ id: 'static-product', quantity: 1 }]; try { buildCustomerOrderItems(fallback); return false; } catch { return fallback.length === 1; } })());

const response = { order_number: 'CLX-2026-0001', fulfillment_type: 'DELIVERY', subtotal_kobo: 250000, delivery_fee_kobo: 40000, service_fee_kobo: 0, total_kobo: 290000, tracking_token: 'secret-token-never-share', vendor_groups: [{ vendor_name: 'Vendor A', items: [{ product_name: 'Rice', quantity: 2 }] }, { vendor_name: 'Vendor B', items: [{ product_name: 'Book', quantity: 1 }] }] };
const message = buildWhatsAppOrderMessage(response, { name: 'Aisha', phone: '08000000000', notes: 'Call first' }, 'CLX Campus');
test('WhatsApp uses confirmed order number', message.includes(response.order_number));
test('WhatsApp never includes tracking token', !message.includes(response.tracking_token));
test('WhatsApp contains database vendor groups', message.includes('Vendor A') && message.includes('Vendor B'));
test('WhatsApp checkout destination uses the official digits-only number', `https://wa.me/${CLX_CONFIG.whatsappNumber}` === 'https://wa.me/2349150736638');

const handoff = new URL(buildWhatsAppOrderUrl(response, { name: 'Aisha', phone: '08000000000', notes: 'Call first' }, 'CLX Campus'));
test('actual checkout URL targets official WhatsApp business number', handoff.origin === 'https://wa.me' && handoff.pathname === '/2349150736638');
test('actual checkout URL preserves confirmed message and excludes tracking token', handoff.searchParams.get('text') === message && !handoff.href.includes(response.tracking_token));
test('WhatsApp handoff rejects missing persisted order number', (() => { try { buildWhatsAppOrderUrl({}, {}, ''); return false; } catch { return true; } })());
saveTrackingOrder({ orderNumber: response.order_number, trackingToken: response.tracking_token });
saveTrackingOrder({ orderNumber: 'CLX-2026-0002', trackingToken: 'another-token' });
test('recent tracking orders persist locally', getSavedTrackingOrders().length === 2 && getSavedTrackingOrders()[0].orderNumber === 'CLX-2026-0002');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);