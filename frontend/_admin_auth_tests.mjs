/**
 * CLX Phase 4A — Admin Auth Foundation Tests (static/structural, no credentials).
 * Verifies admin.html and js/admin-auth.js follow the mandated auth model.
 * Run: node _admin_auth_tests.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const adminHtml = readFileSync(join(root, 'admin.html'), 'utf8');
const adminAuth = readFileSync(join(root, 'js', 'admin-auth.js'), 'utf8');
const supabaseJs = readFileSync(join(root, 'js', 'supabase.js'), 'utf8');

let passed = 0, failed = 0;
const check = (name, condition) => {
    if (condition) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}`); }
};

// 1. admin.html no longer references api.auth / Express auth
check('1: admin.html has no api.auth reference', !adminHtml.includes('api.auth'));
check('1: admin.html does not import api.js', !adminHtml.includes("from './js/api.js'"));
check('1: admin.html does not import app.js AuthManager', !adminHtml.includes('js/app.js'));

// 2. auth module uses Supabase Auth
check('2: admin-auth.js uses the shared supabase client', adminAuth.includes("from './supabase.js'"));
check('3: sign-in uses signInWithPassword', adminAuth.includes('signInWithPassword'));
check('4: logout uses supabase.auth.signOut', adminAuth.includes('auth.signOut()'));
check('5: authorization uses database-backed is_admin RPC', adminAuth.includes("rpc('is_admin')"));

// 6. no service_role anywhere
check('6: no service_role reference in admin.html', !/service_role|SUPABASE_SERVICE/i.test(adminHtml));
check('6: no service_role key usage in admin-auth.js (doc mentions allowed)', !adminAuth.includes('SUPABASE_SERVICE') && !adminAuth.includes('SERVICE_ROLE_KEY') && !/createClient\(/.test(adminAuth));

// 7. no hard-coded email-based authorization
const emailAuthRule = /(email\s*===?\s*['"`][^'"`]+['"`])|(['"`][^'"`]*@[^'"`]*\.(com|org|net|ng)['"`]\s*===?)/i;
check('7: no hard-coded email authorization in admin-auth.js', !emailAuthRule.test(adminAuth));
check('7: no hard-coded admin email in admin.html', !emailAuthRule.test(adminHtml));

// 8. no manual password persistence / no admin flags in localStorage
check('8: no localStorage.setItem of password/admin flags', !/localStorage\.setItem\(\s*['"`](?!clx_selected_campus)/i.test(adminAuth) || !/password|admin_authorized|is_admin=true/i.test(adminAuth));
check('8: no manual token persistence in admin-auth.js', !adminAuth.includes('clx_auth_token"'));

// 9. legacy Express API is not called from the admin path
check('9: no fetch to Express endpoints in admin-auth.js', !adminAuth.includes('/auth/login') && !adminAuth.includes('/auth/me') && !adminAuth.includes('clx-backend'));

// 10. logout preserves cart/tracking/campus storage
const signOutSection = adminAuth.slice(adminAuth.indexOf('export async function signOut'));
check('10: cart storage not wiped on logout', !signOutSection.includes('clx_cart_items'));
check('10: tracking credentials not wiped on logout', !signOutSection.includes('clx_tracking_orders'));
check('10: campus preference not wiped on logout', !signOutSection.includes('clx_selected_campus') && !signOutSection.includes('clx_active_campus'));
check('10: only obsolete legacy auth keys removed', /LEGACY_AUTH_KEYS\s*=\s*\[[^\]]*'clx_auth_token'[^\]]*'clx_user_profile'[^\]]*\]/.test(adminAuth));

// Bonus: shared client config is still browser-safe
check('bonus: supabase.js still forbids service secrets', supabaseJs.includes('NEVER place a service_role key'));

// Regression: missing session must render login, never stay on loading
check('regression: resolveState wrapped in try/catch (fail-safe)', /async function resolveState\(\)\s*\{\s*try\s*\{/.test(adminHtml) && /catch \(err\)\s*\{[\s\S]*?showLogin\(/.test(adminHtml));
check('regression: no-session branch renders login via showLogin', /if \(!user\)\s*\{\s*showLogin\(/.test(adminHtml));
check('regression: hard load fail-safe timer exists', /LOAD_FAILSAFE_MS\s*=\s*\d+/.test(adminHtml) && adminHtml.includes('Session check timed out'));
check('regression: init auth calls are timeout-guarded', adminAuth.includes('withTimeout') && adminAuth.includes('INIT_TIMEOUT_MS'));
check('regression: timeout never grants access (defaults deny)', /__timeout[^}]*authorized:\s*false/.test(adminAuth) || /result\?\.__timeout\) return \{ authorized: false/.test(adminAuth));
check('regression: listener callback is deferred, not awaited inline', adminAuth.includes('setTimeout(() => { try { callback(event); }'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
