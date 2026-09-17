import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { customerProgressForOrder, customerStatusForOrder, mapCustomerOrder } from './js/api.js';

const order = mapCustomerOrder({
  id: 'internal-id', order_number: 'CLX-2026-0031', fulfillment_type: 'PICKUP', total_kobo: 70000, status: 'PREPARING',
  orders: [
    { vendor: { name: "Scholar's Café" }, order_items: [{ product_name_snapshot: 'Bottled Water', vendor_name_snapshot: "Scholar's Café", quantity: 1, unit_price_kobo: 20000, total_price_kobo: 20000 }] },
    { vendor: { name: 'Campus Bites' }, order_items: [{ product_name_snapshot: 'Meat Pie', vendor_name_snapshot: 'Campus Bites', quantity: 1, unit_price_kobo: 50000, total_price_kobo: 50000 }] }
  ]
});
assert.equal(order.title, '2 items');
assert.deepEqual(order.items.map(item => item.name), ['Bottled Water', 'Meat Pie']);
assert.deepEqual(order.vendorGroups.map(group => group.vendorName), ["Scholar's Café", 'Campus Bites']);
assert.equal(order.items.reduce((sum, item) => sum + item.lineTotalKobo, 0), 70000);
assert.equal(customerStatusForOrder({ fulfillment_type: 'DELIVERY', status: 'RIDER_ASSIGNED', delivery_status: 'PICKED_UP' }), 'Ready for Dispatch');
assert.equal(customerStatusForOrder({ fulfillment_type: 'DELIVERY', status: 'OUT_FOR_DELIVERY', delivery_status: 'IN_TRANSIT' }), 'Out for Delivery');
assert.equal(customerProgressForOrder({ fulfillment_type: 'DELIVERY', status: 'RIDER_ASSIGNED', delivery_status: 'PICKED_UP' }).currentStep, 3);
assert.equal(customerProgressForOrder({ fulfillment_type: 'DELIVERY', status: 'OUT_FOR_DELIVERY', delivery_status: 'IN_TRANSIT' }).currentStep, 4);
assert.equal(customerStatusForOrder({ fulfillment_type: 'DELIVERY', status: 'COMPLETED', delivery_status: 'DELIVERED' }), 'Completed');
const ordersPage = readFileSync(new URL('./orders.html', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260916124502_fix_delivery_transit_timeline.sql', import.meta.url), 'utf8');
assert.match(ordersPage, /View all items \(\$\{order\.items\?\.length \|\| 0\}\)/);
assert.match(ordersPage, /item\.unitPriceKobo/);
assert.match(migration, /p_target_status='PICKED_UP'.*return jsonb_build_object/s);
assert.match(migration, /p_target_status='IN_TRANSIT' then next_parent:='OUT_FOR_DELIVERY'/);
assert.doesNotMatch(migration, /values\(p_customer_order_id,'RIDER_ASSIGNED',v_actor\)/);
console.log('CUSTOMER ORDER HARDENING: 13/13 PASS');
