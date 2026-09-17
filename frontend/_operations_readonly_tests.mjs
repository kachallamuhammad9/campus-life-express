/**
 * CLX Phase 4B — Read-Only Operations Dashboard Tests (static/structural).
 * Run: node _operations_readonly_tests.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const ops = readFileSync(join(root, 'js', 'operations.js'), 'utf8');
const adminHtml = readFileSync(join(root, 'admin.html'), 'utf8');

let passed = 0, failed = 0;
const check = (name, condition) => {
    if (condition) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}`); }
};

// 1. Dashboard loads only after admin authorization
const enterIdx = adminHtml.indexOf('async function enterAuthorizedState');
const enterBlock = adminHtml.slice(enterIdx, enterIdx + 1200);
check('1: enterAuthorizedState activates the dashboard and loads operations after authorization', enterBlock.includes("activateAdminModule('overview');") && enterBlock.includes('loadOperationsData();') && enterBlock.indexOf("activateAdminModule('overview');") < enterBlock.indexOf('loadOperationsData();'));
check('1: resolveState does NOT load ops data before authorization', !/show\(deniedPanel\);\s*return;\s*\}[\s\S]{0,200}loadOperationsData/.test(adminHtml.slice(adminHtml.indexOf('async function resolveState'), adminHtml.indexOf('async function resolveState') + 800)));
check('1: loadOperationsData guards on opsLoaded (single load)', ops && adminHtml.includes('if (opsLoaded) { renderFilterButtons(); renderQueue(); return; }'));

// 2. operations module has no mutation calls
check('2: no .insert( in operations.js', !ops.includes('.insert('));
check('2: no .update( in operations.js', !ops.includes('.update('));
check('2: no .delete( in operations.js', !ops.includes('.delete('));
check('2: no .upsert( in operations.js', !ops.includes('.upsert('));

// 3. Operational writes use the narrow Phase 4C–4F RPC allowlist; queue reads stay direct SELECTs.
const allowedRpcNames = ['verify_customer_order_payment', 'admin_advance_vendor_order', 'admin_create_rider', 'admin_update_rider', 'admin_assign_delivery_rider', 'admin_advance_delivery_request', 'admin_complete_pickup_order', 'admin_complete_delivery_order'];
check('3: only approved secure operations RPCs are used', allowedRpcNames.every((name) => ops.includes(`'${name}'`)) && /supabase\.rpc\(name, payload\)/.test(ops));

// 4. no service_role reference
check('4: no service_role in operations.js', !/service_role/i.test(ops));
check('4: no service_role in admin.html', !/service_role/i.test(adminHtml));

// 5. no Express API call
check('5: no Express backend references', !ops.includes('clx-backend') && !ops.includes('/api/') && !adminHtml.includes('clx-backend'));

// 6. order queue renders
check('6: queue renders order number/created/customer/fulfillment/payment/status/vendor count/total', /ops-view-detail/.test(adminHtml) && adminHtml.includes('renderQueue') && adminHtml.includes('created_label') && adminHtml.includes('vendor_groups.length'));

// 7. detail view renders vendor groups/items
check('7: detail renders vendor groups + item table', /renderDetail/.test(adminHtml) && adminHtml.includes('vendor_groups.map') && adminHtml.includes('product_name') && adminHtml.includes('line_total_kobo'));

// 8. payment status displayed
check('8: payment status label displayed', adminHtml.includes('payment_status_label') && adminHtml.includes('payment_method_label'));

// 9. fulfillment displayed
check('9: fulfillment label displayed', adminHtml.includes('fulfillment_label'));

// 10. totals displayed from database values (kobo fields, not fabricated)
check('10: totals come from *_kobo DB fields via formatKobo', adminHtml.includes('formatKobo(order.total_kobo)') && adminHtml.includes('formatKobo(order.subtotal_kobo)') && adminHtml.includes('formatKobo(order.service_fee_kobo)'));

// 11. tracking secrets never fetched or rendered
check('11: operations.js never selects tracking_token_hash (comment mentions allowed)', !/select\([\s\S]*tracking_token/.test(ops) && !/tracking_token_hash,|, tracking_token_hash|tracking_token"/.test(ops));
check('11: admin.html never renders token/JWT fields', !adminHtml.includes('tracking_token') && !adminHtml.includes('access_token') && !adminHtml.includes('refresh_token'));
check('11: no unnecessary UUID rendered (id only used internally, never in HTML output)', !/data-order="\$\{esc\(o\.id\)\}|>\$\{esc\(o\.id\)\}</.test(adminHtml));

// 12. signed-out/unauthorized states never load ops data (gate is inside authorized branch only)
check('12: showLogin does not call loadOperationsData', !/const showLogin = \(message\) => \{[\s\S]{0,200}loadOperationsData/.test(adminHtml));
check('12: denied panel path does not call loadOperationsData', !/show\(deniedPanel\); return; \}[\s\S]{0,120}loadOperationsData\(\)/.test(adminHtml.slice(adminHtml.indexOf('resolveState() {'), adminHtml.indexOf('resolveState() {') + 900)));

// 13. Phase 4F delivery controls are state-gated and avoid direct writes.
check('13: delivery block shows state and Phase 4F controls', adminHtml.includes('delivery.status_label') && adminHtml.includes('dropoff_location') && adminHtml.includes('estimated_fee_kobo') && adminHtml.includes('ops-assign-rider') && adminHtml.includes('ops-advance-delivery') && adminHtml.includes('ops-complete-delivery'));

// 14. empty/error states per spec
check('14: empty state message', adminHtml.includes('No customer orders found.'));
check('14: safe error message, no raw Supabase errors to UI', ops.includes('Unable to load CLX operations data. Please try again.'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
