import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWhatsAppOrderMessage } from './js/customer-orders.js';

const root = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(root, '..', 'supabase', 'migrations', '0031_fulfillment_delivery_operations.sql'), 'utf8');
const operations = readFileSync(join(root, 'js', 'operations.js'), 'utf8');
const admin = readFileSync(join(root, 'admin.html'), 'utf8');
const customerOrders = readFileSync(join(root, 'js', 'customer-orders.js'), 'utf8');
const orders = readFileSync(join(root, 'orders.html'), 'utf8');
let passed = 0;
let failed = 0;
const check = (name, condition) => { if (condition) { passed++; console.log(`PASS: ${name}`); } else { failed++; console.log(`FAIL: ${name}`); } };

check('rider registry has private normalized phone, campus restriction, and availability', /create table public\.riders/i.test(migration) && /phone text not null check \(phone ~ .*234/i.test(migration) && /campus_id uuid not null references public\.campuses\(id\) on delete restrict/i.test(migration) && /is_active boolean not null/i.test(migration) && /is_available boolean not null/i.test(migration));
check('riders have RLS with an admin-only read policy and no browser write grant', /alter table public\.riders enable row level security/i.test(migration) && /create policy riders_admin_select/i.test(migration) && /revoke all on public\.riders from public, anon, authenticated/i.test(migration));
check('checkout delivery link retains legacy rider_user_id and adds rider_id', /add column rider_id uuid references public\.riders\(id\) on delete restrict/i.test(migration) && !/drop column rider_user_id/i.test(migration));
check('checkout-linked direct delivery updates are denied by policy', /delivery_requests_update_legacy_involved/i.test(migration) && /customer_order_id is null/i.test(migration));
check('only the six required fulfillment RPCs are exposed', ['admin_create_rider', 'admin_update_rider', 'admin_assign_delivery_rider', 'admin_advance_delivery_request', 'admin_complete_pickup_order', 'admin_complete_delivery_order'].every((name) => migration.includes(`function public.${name}`)) && !migration.includes('admin_delete_rider') && !migration.includes('admin_update_customer_order_status'));
check('operational RPCs are security definer with hardened search path', (migration.match(/security definer set search_path=pg_catalog,public,pg_temp/g) || []).length >= 7);
check('rider inputs use Nigerian normalization and duplicate protection', /_admin_normalize_ng_phone/i.test(migration) && /riders_normalized_phone_unique/i.test(migration) && /A rider with this phone already exists/i.test(migration));
check('assignment requires paid, ready delivery dispatch state and compatible rider', /parent_status'\s*<>\s*'READY_FOR_DISPATCH'/i.test(migration) && /payment_status'\s*<>\s*'PAID'/i.test(migration) && /delivery_status'\s*<>\s*'REQUESTED'/i.test(migration) && /not r\.is_active or not r\.is_available/i.test(migration) && /Rider campus does not match/i.test(migration));
check('assignment atomically accepts request, assigns rider, marks unavailable, and records parent history', /set rider_id=r\.id,status='ACCEPTED'/i.test(migration) && /set is_available=false/i.test(migration) && /set status='RIDER_ASSIGNED'/i.test(migration) && /'RIDER_ASSIGNED',v_actor/i.test(migration));
check('delivery transitions are strictly accepted to picked up to transit to delivered', /'ACCEPTED' and p_target_status='PICKED_UP'/i.test(migration) && /'PICKED_UP' and p_target_status='IN_TRANSIT'/i.test(migration) && /'IN_TRANSIT' and p_target_status='DELIVERED'/i.test(migration));
check('delivery parent history is not duplicated at in-transit', /p_target_status='DELIVERED' then next_parent:='DELIVERED'; else return jsonb_build_object/i.test(migration));
check('completion gates and restores rider availability only after delivered delivery', /parent_status'\s*<>\s*'DELIVERED'/i.test(migration) && /delivery_status'\s*<>\s*'DELIVERED'/i.test(migration) && /set is_available=true/i.test(migration) && /p\.fulfillment_type\s*<>\s*'PICKUP'/i.test(migration) && /p\.status\s*<>\s*'READY_FOR_PICKUP'/i.test(migration));
check('tracking keeps its input contract and returns only safe rider/history fields', /get_customer_order_tracking\(p_order_number text,p_tracking_token text\)/i.test(migration) && /'rider_name'/i.test(migration) && /'history'/i.test(migration) && !/jsonb_build_object\([^;]*(tracking_token_hash|rider_user_id|actor_user_id)/is.test(migration));
check('frontend writes through Phase 4F RPCs only', /supabase\.rpc\(name, payload\)/.test(operations) && ['admin_create_rider', 'admin_update_rider', 'admin_assign_delivery_rider', 'admin_advance_delivery_request', 'admin_complete_pickup_order', 'admin_complete_delivery_order'].every((name) => operations.includes(`operationsRpc('${name}'`)) && !/from\('riders'\)[\s\S]{0,200}\.(insert|update|delete)/i.test(operations));
check('admin requires confirmation and refresh for fulfillment writes', /ops-assign-rider/i.test(admin) && /ops-complete-pickup/i.test(admin) && /ops-complete-delivery/i.test(admin) && /window\.confirm\(`Confirm \$\{action\}/i.test(admin) && /await loadOperationsData\(\)/i.test(admin));
const deliveryWhatsApp = buildWhatsAppOrderMessage({
    order_number: 'CLX-TEST-DELIVERY', fulfillment_type: 'DELIVERY', nearest_landmark: 'Male Hostels', delivery_location: 'D Block',
    subtotal_kobo: 50000, delivery_fee_kobo: 20000, service_fee_kobo: 0, total_kobo: 70000,
    vendor_groups: [{ vendor_name: 'Test Vendor', items: [{ product_name: 'Rice', quantity: 1 }] }]
}, { name: 'Test Customer', phone: '08000000000', notes: '' }, 'UNIMAID');
const pickupWhatsApp = buildWhatsAppOrderMessage({
    order_number: 'CLX-TEST-PICKUP', fulfillment_type: 'PICKUP', nearest_landmark: 'Male Hostels', delivery_location: 'D Block',
    subtotal_kobo: 50000, delivery_fee_kobo: 0, service_fee_kobo: 0, total_kobo: 50000,
    vendor_groups: [{ vendor_name: 'Test Vendor', items: [{ product_name: 'Rice', quantity: 1 }] }]
}, { name: 'Test Customer', phone: '08000000000', notes: '' }, 'UNIMAID');
check('customer WhatsApp handoff identifies Delivery with landmark and exact location, not a legacy zone',
    deliveryWhatsApp.includes('Fulfillment: Delivery') && deliveryWhatsApp.includes('Landmark: Male Hostels') && deliveryWhatsApp.includes('Exact Location: D Block') && !deliveryWhatsApp.includes('Delivery Zone:'));
check('customer WhatsApp handoff excludes delivery-only location fields for Pickup',
    pickupWhatsApp.includes('Fulfillment: Pickup') && !pickupWhatsApp.includes('Landmark:') && !pickupWhatsApp.includes('Exact Location:'));
check('customer WhatsApp handoff exposes no internal identifiers or tracking secrets',
    !/(tracking_token|tracking token|tracking_token_hash|rider_user_id|actor_user_id|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i.test(deliveryWhatsApp));
check('customer tracking renders safe server history and rider display name', /buildTrackingTimeline/i.test(customerOrders) && /buildTrackingTimeline\(order\)/i.test(orders) && /order\.rider_name/i.test(orders) && !/rider_user_id|tracking_token_hash/.test(orders));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
