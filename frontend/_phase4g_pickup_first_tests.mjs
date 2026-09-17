import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildWhatsAppOrderMessage } from './js/customer-orders.js';
import { isQaOrder } from './js/operations.js';

const root = dirname(fileURLToPath(import.meta.url));
const ordersHtml = readFileSync(join(root, 'orders.html'), 'utf8');
const adminHtml = readFileSync(join(root, 'admin.html'), 'utf8');
let passed = 0;
let failed = 0;
const check = (name, condition) => {
    if (condition) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}`); }
};

check('pickup is the initial selector option and checkout state', /<select id="chk-fulfillment"[\s\S]{0,500}<option value="pickup">Pickup - collect from vendor\(s\)<\/option>[\s\S]{0,180}<option value="delivery">Delivery - deliver to my location<\/option>/.test(ordersHtml) && ordersHtml.includes('document.getElementById("chk-fulfillment").value = "pickup";'));
check('pickup clears and disables landmark and exact-location delivery fields', /landmark\.required = isDelivery;[\s\S]{0,180}location\.required = isDelivery;[\s\S]{0,180}landmark\.disabled = !isDelivery;[\s\S]{0,180}location\.disabled = !isDelivery;[\s\S]{0,240}landmark\.value = "";[\s\S]{0,100}location\.value = "";/.test(ordersHtml));
check('checkout payload sends no landmark or exact location for pickup and no legacy zone', /deliveryLocation: fulfillmentType === "DELIVERY" \? document\.getElementById\("chk-location"\)\.value\.trim\(\) : null,[\s\S]{0,160}deliveryZoneId: null,[\s\S]{0,160}nearestLandmark: fulfillmentType === "DELIVERY" \? document\.getElementById\("chk-landmark"\)\.value \|\| null : null/.test(ordersHtml) && !ordersHtml.includes('chk-zone'));

const pickupResponse = { order_number: 'CLX-TEST-1', fulfillment_type: 'PICKUP', subtotal_kobo: 10000, delivery_fee_kobo: 0, service_fee_kobo: 0, total_kobo: 10000, delivery_zone_name: 'Wrong Zone', delivery_location: 'Wrong Address', vendor_groups: [{ vendor_name: 'Vendor A', items: [{ product_name: 'Rice', quantity: 1 }] }] };
const pickupMessage = buildWhatsAppOrderMessage(pickupResponse, { name: 'Customer', phone: '08000000000', notes: 'Gate pickup' }, 'UNIMAID');
check('pickup WhatsApp handoff identifies pickup without delivery-only fields', pickupMessage.includes('Fulfillment: Pickup') && !pickupMessage.includes('Delivery Zone:') && !pickupMessage.includes('Delivery Location:'));
check('QA helper identifies the two controlled records', isQaOrder({ customer_name: 'CLX Phase 4F Pickup Smoke Test', notes: 'CONTROLLED PHASE 4F PICKUP FULFILLMENT SMOKE TEST — DO NOT FULFIL PHYSICALLY' }) && isQaOrder({ customer_name: 'MUHAMMAD ALI', notes: 'Phase 4C payment verification smoke test — DO NOT FULFIL' }));
check('QA helper rejects ordinary customer metadata', !isQaOrder({ customer_name: 'Aisha Testimony', notes: 'Please test the intercom before arrival.' }));
check('QA badge appears only in admin operations UI', adminHtml.includes('QA / TEST') && !ordersHtml.includes('QA / TEST'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
