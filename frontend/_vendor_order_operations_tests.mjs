import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const operations = readFileSync(join(root, 'js', 'operations.js'), 'utf8');
const admin = readFileSync(join(root, 'admin.html'), 'utf8');
const migration = readFileSync(join(root, '..', 'supabase', 'migrations', '0025_admin_advance_vendor_order.sql'), 'utf8');
let passed = 0;
let failed = 0;
const check = (name, condition) => { if (condition) { passed++; console.log(`PASS: ${name}`); } else { failed++; console.log(`FAIL: ${name}`); } };

check('1: migration and narrow RPC exist', migration.includes('admin_advance_vendor_order') && migration.includes('p_vendor_order_id uuid') && migration.includes('p_target_status public.order_status'));
check('2: RPC is security definer with hardened search path', /security definer\s+set search_path = pg_catalog, public, pg_temp/is.test(migration));
check('3: authenticated admin actor is enforced', migration.includes('v_actor_id uuid := auth.uid()') && migration.includes('not public.is_admin()'));
const parentLock = migration.search(/from public\.customer_orders\s+where id = v_parent_id\s+for update;/i);
const childLock = migration.search(/from public\.orders\s+where id = p_vendor_order_id and customer_order_id = v_parent\.id\s+for update;/i);
const paymentLock = migration.search(/from public\.customer_order_payments\s+where customer_order_id = v_parent\.id\s+for update;/i);
const parentEligibilityGate = migration.search(/if v_parent\.status is null or v_parent\.status not in \('PAYMENT_CONFIRMED', 'ORDER_CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'READY_FOR_DISPATCH'\) then\s+return jsonb_build_object\('success', false, 'code', 'PARENT_NOT_ELIGIBLE'/s);
const childUpdate = migration.search(/update public\.orders\s+set status = p_target_status\s+where id = v_child\.id;/s);
check('4: parent, target child, and payment are locked in order', parentLock >= 0 && childLock > parentLock && paymentLock > childLock && (migration.match(/for update;/g) || []).length === 3);
check('5: payment gate requires PAID without payment mutation', migration.includes("v_payment_status <> 'PAID'") && !/update public\.customer_order_payments/i.test(migration));
check('6: exact forward transitions are owned', migration.includes("'PENDING' and p_target_status = 'CONFIRMED'") && migration.includes("'CONFIRMED' and p_target_status = 'PREPARING'") && migration.includes("'PREPARING' and p_target_status = 'READY'"));
check('7: skipped and backward transitions are rejected', migration.includes("p_target_status not in ('CONFIRMED', 'PREPARING', 'READY')") && migration.includes("'INVALID_TRANSITION'"));
check('8: IN_TRANSIT, DELIVERED, and CANCELLED are never target states', !/p_target_status = '(IN_TRANSIT|DELIVERED|CANCELLED)'/.test(migration));
check('9: idempotency returns before the update', migration.includes('already_applied') && migration.indexOf('already_applied') < migration.indexOf('update public.orders'));
check('9: same-target idempotency precedes parent eligibility and performs no mutation', migration.indexOf('already_applied') < parentEligibilityGate && parentEligibilityGate < childUpdate);
check('9: only active paid/preparation parent states allow new child progression', parentEligibilityGate >= 0 && ['PAYMENT_CONFIRMED', 'ORDER_CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'READY_FOR_DISPATCH'].every((status) => migration.includes(`'${status}'`)));
check('9: order-received, awaiting-payment, terminal, refund, and later parent states are fail-closed', ['ORDER_RECEIVED', 'AWAITING_PAYMENT', 'CANCELLED', 'PAYMENT_FAILED', 'REFUND_PENDING', 'REFUNDED', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].every((status) => !migration.slice(parentEligibilityGate, childUpdate).includes(`'${status}'`)));
check('9: parent eligibility blocks CONFIRMED-to-PREPARING and PREPARING-to-READY before child update', parentEligibilityGate < migration.indexOf("'CONFIRMED' and p_target_status = 'PREPARING'") && parentEligibilityGate < migration.indexOf("'PREPARING' and p_target_status = 'READY'") && parentEligibilityGate < childUpdate);
check('10: only the target child is updated', /update public\.orders\s+set status = p_target_status\s+where id = v_child\.id;/s.test(migration));
check('11: sibling states drive explicit parent derivation', migration.includes('v_active_child_count') && migration.includes('v_all_confirmed') && migration.includes('v_all_preparing') && migration.includes('v_all_ready'));
check('12: all-confirmed/preparing/ready mappings are correct', migration.includes("'ORDER_CONFIRMED'") && migration.includes("'PREPARING'") && migration.includes("'READY_FOR_PICKUP'") && migration.includes("'READY_FOR_DISPATCH'"));
check('13: parent regression is blocked by lifecycle rank', migration.includes('if v_derived_rank > v_parent_rank then'));
check('14: history uses a valid parent status and triggering child ID only on parent advance', /customer_order_id, vendor_order_id, status, actor_user_id/.test(migration) && migration.includes('v_child.id, v_derived_parent_status, v_actor_id'));
check('15: broad direct orders update policy is removed but select policy is untouched', migration.includes('drop policy if exists "orders_admin_update"') && !migration.includes('orders_select_involved'));
check('16: function EXECUTE excludes public and anon', migration.includes('from public;') && migration.includes('from anon;') && migration.includes('to authenticated, service_role;'));
check('17: frontend calls the secure RPC only', operations.includes(".rpc('admin_advance_vendor_order'") && !/from\('orders'\)[\s\S]{0,300}\.update\(/.test(operations));
check('18: admin actions cover pending, confirmed, and preparing only', admin.includes("PENDING: ['CONFIRMED', 'Confirm Vendor Order']") && admin.includes("CONFIRMED: ['PREPARING', 'Start Preparing']") && admin.includes("PREPARING: ['READY', 'Mark Ready']"));
check('19: frontend requires confirmation and authoritative refresh', admin.includes('window.confirm(`Confirm vendor order update') && admin.includes('await loadOperationsData();'));
check('20: no service role; protected cancellation, refund, and Phase 4F controls remain present', !/service_role/i.test(operations + admin) && /ops-cancel-order|ops-request-refund|ops-confirm-refund|ops-assign-rider|ops-complete-delivery|ops-complete-pickup/i.test(admin));

// SQL contract tests: use the actual migration allowlist, not a duplicate policy.
// These do not execute PL/pgSQL or call a database.
const allowedParents = ['PAYMENT_CONFIRMED', 'ORDER_CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'READY_FOR_DISPATCH'];
const rejectedParents = ['ORDER_RECEIVED', 'AWAITING_PAYMENT', 'CANCELLED', 'PAYMENT_FAILED', 'REFUND_PENDING', 'REFUNDED', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'];
const sql = migration.replace(/--[^\n]*/g, '');
const gate = /if v_parent\.status is null or v_parent\.status not in \(([^)]+)\) then\s+return jsonb_build_object\('success', false, 'code', 'PARENT_NOT_ELIGIBLE'[^;]+;\s+end if;/s.exec(sql);
const sqlAllowedParents = [...(gate?.[1] || '').matchAll(/'([^']+)'/g)].map(match => match[1]);
const gatePosition = gate?.index ?? -1;
const firstMutation = sql.search(/\b(?:update|insert into|delete from) public\./i);
const noOp = /if v_child\.status = p_target_status then\s+return jsonb_build_object\('success', true, 'already_applied', true[^;]+;\s+end if;/s.exec(sql);
const gateBeforeMutation = gatePosition >= 0 && gatePosition < firstMutation;
check('21: exact parent allowlist is extracted from rejecting SQL gate', JSON.stringify(sqlAllowedParents) === JSON.stringify(allowedParents));
check('22: locked-child no-op, eligibility, payment lock, then first mutation', noOp && sql.indexOf('where id = p_vendor_order_id and customer_order_id = v_parent.id') < noOp.index && noOp.index < gatePosition && gatePosition < sql.indexOf('select status into v_payment_status') && sql.indexOf('select status into v_payment_status') < firstMutation && gateBeforeMutation);
const enumMigration = readFileSync(join(root, '..', 'supabase', 'migrations', '0022_phase2_customer_orders.sql'), 'utf8');
const enumValues = [...enumMigration.match(/create type public\.customer_order_status as enum \(([\s\S]*?)\);/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
check('23: every current parent enum value is explicitly classified', JSON.stringify([...enumValues].sort()) === JSON.stringify([...allowedParents, ...rejectedParents].sort()));
for (const parent of rejectedParents) {
  check(`CONFIRMED -> PREPARING rejected before mutation under ${parent}`, gateBeforeMutation && !sqlAllowedParents.includes(parent) && gatePosition < sql.indexOf("v_child.status = 'CONFIRMED' and p_target_status = 'PREPARING'"));
}
for (const parent of ['CANCELLED', 'REFUNDED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED']) {
  check(`PREPARING -> READY rejected before mutation under ${parent}`, gateBeforeMutation && !sqlAllowedParents.includes(parent) && gatePosition < sql.indexOf("v_child.status = 'PREPARING' and p_target_status = 'READY'"));
}
for (const parent of allowedParents) {
  for (const [from, to] of [['CONFIRMED', 'PREPARING'], ['PREPARING', 'READY']]) {
    check(`${from} -> ${to} remains eligible under ${parent}`, sqlAllowedParents.includes(parent) && sql.includes(`v_child.status = '${from}' and p_target_status = '${to}'`));
  }
}
check('24: same-target READY under COMPLETED returns already_applied without any mutation or payment lookup', noOp && noOp.index < gatePosition && noOp.index < firstMutation && !/v_parent\.status|v_payment_status/.test(sql.slice(sql.indexOf('if p_target_status not in'), noOp.index)) && sql.includes("p_target_status not in ('CONFIRMED', 'PREPARING', 'READY')"));
check('25: null and future unclassified parent statuses fail closed', gateBeforeMutation && gate[0].includes('v_parent.status is null') && !sqlAllowedParents.includes('FUTURE_STATUS'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
