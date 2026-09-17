import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const orders = readFileSync(join(root, 'orders.html'), 'utf8');
const api = readFileSync(join(root, 'js', 'api.js'), 'utf8');
const whatsapp = readFileSync(join(root, 'js', 'customer-orders.js'), 'utf8');
const migration = readFileSync(join(root, '..', 'supabase', 'migrations', '20260917130000_unimaid_delivery_landmarks_flat_fee.sql'), 'utf8');
const zoneRemovalMigration = readFileSync(join(root, '..', 'supabase', 'migrations', '20260917143000_remove_delivery_zone_checkout_requirement.sql'), 'utf8');
let passed = 0;
let failed = 0;
const check = (name, condition) => { if (condition) { passed++; console.log(`PASS: ${name}`); } else { failed++; console.log(`FAIL: ${name}`); } };
const landmarks = ['Acada', 'Park', 'Male Hostels', 'Female Hostels', 'Joints', 'Complex Area', 'Remedial Studies', 'Faculties', 'Commercial Area', 'Postgraduate School', 'UNIMAID Garden', 'El-Kanemi Hall', 'Student Centre', 'NUGA', 'Senate Building', 'Other'];

check('exact approved landmark list is present', landmarks.every((landmark) => orders.includes(`<option>${landmark}</option>`) && migration.includes(`'${landmark}'`)));
check('landmark and exact location are required delivery fields', orders.includes('id="chk-landmark" disabled') && orders.includes('id="chk-location" disabled') && orders.includes('landmark.required = isDelivery') && orders.includes('location.required = isDelivery'));
check('pickup clears and disables delivery fields', orders.includes('landmark.value = ""') && orders.includes('location.value = ""') && orders.includes('landmark.disabled = !isDelivery'));
check('flat delivery fee is 200 naira in integer kobo logic', orders.includes('const deliveryEstimate = fulfillment === "delivery" ? 200 : 0') && migration.includes('v_delivery_fee_kobo := 20000'));
check('delivery does not require a legacy delivery zone', !orders.includes('chk-zone') && zoneRemovalMigration.includes('DELIVERY_LOCATION_REQUIRED') && zoneRemovalMigration.includes('customer_orders_fulfillment_details_check'));
check('summary shows fulfilment, landmark, exact location, fee, and grand total', orders.includes('Fulfilment: <strong>Delivery</strong>') && orders.includes('Nearest Landmark: <strong>') && orders.includes('Exact Delivery Location: <strong>') && orders.includes('Grand Total'));
check('checkout grand total adds the naira fee exactly once', orders.includes('productsSubtotal + deliveryEstimate)}</span>'));
check('RPC payload carries nearest landmark', api.includes('p_nearest_landmark: order.nearestLandmark'));
check('WhatsApp delivery handoff carries landmark and exact location', whatsapp.includes('Landmark: ${response.nearest_landmark}') && whatsapp.includes('Exact Location: ${response.delivery_location}'));
check('pickup handoff omits delivery fields', whatsapp.includes("response.fulfillment_type === 'DELIVERY' && response.nearest_landmark") && whatsapp.includes("response.fulfillment_type === 'DELIVERY' && response.delivery_location"));
check('database stores landmark and enforces pickup zero fee', migration.includes('nearest_landmark') && migration.includes("'PICKUP' and v_delivery_fee_kobo = 0") === false && migration.includes("v_delivery_fee_kobo := 20000"));
check('old checkout RPC is revoked and new signature is granted', migration.includes('revoke all on function public.create_customer_order(jsonb,uuid,text,text,text,text,text,uuid,text)') && migration.includes('grant execute on function public.create_customer_order(jsonb,uuid,text,text,text,text,text,uuid,text,text)'));

console.log(`\nUNIMAID DELIVERY CHECKOUT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
