import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const operations = readFileSync(join(root, 'js', 'operations.js'), 'utf8');
const adminHtml = readFileSync(join(root, 'admin.html'), 'utf8');
const migration = readFileSync(join(root, '..', 'supabase', 'migrations', '0024_verify_customer_order_payment.sql'), 'utf8');
const parentLock = /from public\.customer_orders\s+where id = p_customer_order_id\s+for update;/s;
const paymentLock = /from public\.customer_order_payments\s+where customer_order_id = v_order\.id\s+for update;/s;
const amountCheck = /v_payment\.amount_kobo <> v_order\.total_kobo/;
const pendingEligibility = /v_payment\.status <> 'PENDING'\s+or v_order\.status not in \('ORDER_RECEIVED', 'AWAITING_PAYMENT'\)/s;
const paymentUpdate = /update public\.customer_order_payments\s+set status = 'PAID', verified_by_user_id = v_actor_id, verified_at = now\(\), paid_at = coalesce\(paid_at, now\(\)\)\s+where id = v_payment\.id;/s;
const parentUpdate = /update public\.customer_orders\s+set status = 'PAYMENT_CONFIRMED'\s+where id = v_order\.id;/s;
const historyInsert = /insert into public\.customer_order_status_history \(customer_order_id, status, actor_user_id\)\s+values \(v_order\.id, 'PAYMENT_CONFIRMED', v_actor_id\);/s;
let passed = 0;
let failed = 0;
const check = (name, condition) => {
    if (condition) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}`); }
};

check('frontend calls only the payment verification RPC', operations.includes(".rpc('verify_customer_order_payment'"));
check('frontend has no direct payment update', !/from\('customer_order_payments'\)[\s\S]{0,300}\.update\(/.test(operations));
check('frontend has no direct parent order update', !/from\('customer_orders'\)[\s\S]{0,300}\.update\(/.test(operations));
check('verify action is restricted to eligible pending states', adminHtml.includes("order.payment_status === 'PENDING'") && adminHtml.includes("['ORDER_RECEIVED', 'AWAITING_PAYMENT']"));
check('verification requires confirmation', adminHtml.includes('window.confirm('));
check('successful verification reloads authoritative data', adminHtml.includes('opsLoaded = false;') && adminHtml.includes('await loadOperationsData();'));
check('already-paid orders do not show verification action', adminHtml.includes("canVerifyPayment ?"));
check('unauthorized browser calls are rejected by the RPC', migration.includes("not public.is_admin()") && migration.includes('You are not authorized to verify payments.'));
check('no service role or Express dependency exists', !/service_role|clx-backend|\/api\//i.test(operations + adminHtml));
check('cancellation is an explicit unpaid-order admin action; rider assignment remains Phase 4F only', /ops-cancel-order/.test(adminHtml) && /ops-cancel-reason/.test(adminHtml) && /ops-assign-rider/i.test(adminHtml));
check('RPC is security definer with explicit search path', /security definer[\s\S]{0,100}set search_path = pg_catalog, public, pg_temp/i.test(migration));
check('RPC authorizes the authenticated admin', migration.includes('auth.uid()') && migration.includes('public.is_admin()'));
check('RPC locks the specified parent order before the associated payment', parentLock.test(migration) && paymentLock.test(migration) && migration.indexOf('from public.customer_orders') < migration.indexOf('from public.customer_order_payments'));
check('RPC compares the payment amount with the authoritative order total', amountCheck.test(migration));
check('RPC permits only pending payments in pre-payment parent states', pendingEligibility.test(migration));
check('RPC handles idempotency before every update', migration.includes("v_payment.status = 'PAID'") && migration.includes('already_verified') && migration.indexOf('already_verified') < migration.indexOf('update public.customer_order_payments'));
check('RPC explicitly rejects terminal parent statuses', migration.includes("'CANCELLED', 'PAYMENT_FAILED', 'REFUND_PENDING', 'REFUNDED', 'COMPLETED'"));
check('RPC updates only the locked payment and preserves an existing paid timestamp', paymentUpdate.test(migration));
check('RPC transitions only the locked parent order', parentUpdate.test(migration));
check('RPC writes one parent status-history record with the admin actor', historyInsert.test(migration));
check('RPC grants authenticated but not anon or public access', migration.includes('revoke all on function public.verify_customer_order_payment(uuid) from public;') && migration.includes('from anon;') && migration.includes('to authenticated, service_role;'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
