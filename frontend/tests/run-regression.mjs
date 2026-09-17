import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const suites = [
    '_admin_auth_tests.mjs',
    '_admin_lifecycle_tests.mjs',
    '_admin_order_operations_mvp_tests.mjs',
    '_admin_product_management_tests.mjs',
    '_admin_rider_error_tests.mjs',
    '_admin_service_management_tests.mjs',
    '_cart_tests.mjs',
    '_customer_order_hardening_tests.mjs',
    '_customer_payment_visibility_tests.mjs',
    '_customer_progress_tracker_tests.mjs',
    '_fulfillment_delivery_operations_tests.mjs',
    '_legacy_api_cleanup_tests.mjs',
    '_live_catalogue_safety_tests.mjs',
    '_live_services_catalogue_tests.mjs',
    '_my_orders_display_tests.mjs',
    '_operations_readonly_tests.mjs',
    '_order_cancellation_hardening_tests.mjs',
    '_payment_verification_tests.mjs',
    '_phase1_live_tests.mjs',
    '_phase1_tests.mjs',
    '_phase3_customer_orders_tests.mjs',
    '_phase4g_pickup_first_tests.mjs',
    '_product_availability_hardening_tests.mjs',
    '_unimaid_delivery_checkout_tests.mjs',
    '_vendor_application_admin_tests.mjs',
    '_vendor_onboarding_tests.mjs',
    '_vendor_order_operations_tests.mjs',
    '_vendor_ownership_tests.mjs'
];

const run = (name, args) => new Promise((resolveRun) => {
    const started = performance.now();
    console.log(`\n=== ${name} ===`);
    const child = spawn(process.execPath, args, { cwd: frontendRoot, stdio: 'inherit' });
    child.on('error', (error) => resolveRun({ name, passed: false, error, duration: performance.now() - started }));
    child.on('close', (code, signal) => resolveRun({ name, passed: code === 0, code, signal, duration: performance.now() - started }));
});

const selfCheck = process.argv.includes('--verify-failure-exit');
const planned = selfCheck
    ? [{ name: 'runner failure-exit self-check', args: ['-e', "console.error('intentional runner self-check failure'); process.exit(1)"] }]
    : suites.map((suite) => ({ name: suite, args: [suite] }));

const results = [];
for (const suite of planned) {
    const result = await run(suite.name, suite.args);
    results.push(result);
    const duration = (result.duration / 1000).toFixed(1);
    if (result.passed) console.log(`PASS: ${suite.name} (${duration}s)`);
    else console.log(`FAIL: ${suite.name} (${duration}s)${result.signal ? ` signal=${result.signal}` : ` exit=${result.code ?? 'spawn-error'}`}`);
}

const failed = results.filter((result) => !result.passed);
console.log('\nCLX REGRESSION SUMMARY');
console.log(`Passed: ${results.length - failed.length}`);
console.log(`Failed: ${failed.length}`);
console.log(`Total: ${results.length}`);
if (failed.length) console.log(`Failed suites: ${failed.map((result) => result.name).join(', ')}`);

process.exitCode = failed.length ? 1 : 0;
