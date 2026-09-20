// Manually invoked, single-use production smoke test. Never part of a test suite.
// Requires a fresh read-only baseline/fingerprint review before --execute-once.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const dir = fileURLToPath(new URL('.', import.meta.url));
const env = { ...parse(readFileSync(dir + '.env')), ...(existsSync(dir + '.env.local') ? parse(readFileSync(dir + '.env.local')) : {}), ...process.env };
const url = env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const key = env.VITE_SUPABASE_ANON_KEY;
const check = (ok, label) => { if (!ok) throw new Error(label); };
const name = 'CLX Phase 4E Product Smoke Test';
const initialDescription = 'Controlled production product-management smoke test. DO NOT USE OPERATIONALLY.';
const updatedDescription = 'Controlled production product-management smoke test verified. DO NOT USE OPERATIONALLY.';
const journalPath = dir + '.vercel/production-product-smoke-attempt.json';
let token;
let journal;

async function request(path, { body, anonymous = false } = {}) {
  // Native fetch makes one HTTP request; no application retry of mutations.
  const response = await fetch(url + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: key, Authorization: `Bearer ${anonymous ? key : token || key}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  check(response.ok, `HTTP ${response.status} at ${path.split('?')[0]}; stop and inspect read-only; never retry create`);
  return response.json();
}
const rows = (table, query = 'select=*', anonymous = false) => request(`/rest/v1/${table}?${query}`, { anonymous });
const save = () => writeFileSync(journalPath, JSON.stringify(journal, null, 2));

async function main() {
  check(url === 'https://bdjfkuddpupqaswzkrth.supabase.co' && key, 'Wrong project or missing public configuration');
  check(!existsSync(journalPath), 'Prior attempt journal exists: STOP, read-only reconciliation required');
  check(env.CLX_QA_ADMIN_EMAIL && env.CLX_QA_ADMIN_PASSWORD, 'Normal admin credentials unavailable');
  if (!process.argv.includes('--execute-once')) {
    console.log('Configuration present. Dry preparation only: no network or mutation performed.');
    return;
  }
  const auth = await request('/auth/v1/token?grant_type=password', { body: { email: env.CLX_QA_ADMIN_EMAIL, password: env.CLX_QA_ADMIN_PASSWORD } });
  token = auth.access_token;
  check(token && await request('/rest/v1/rpc/is_admin', { body: {} }) === true, 'Normal authenticated admin gate failed');
  console.log('Normal password authentication succeeded; is_admin() returned true.');
  const vendors = await rows('vendors', 'select=*&name=eq.' + encodeURIComponent('CLX Phase 4E Approval Test'));
  check(vendors.length === 1, 'Synthetic vendor not unique');
  const vendor = vendors[0];
  check(vendor.status === 'ACTIVE' && vendor.is_verified === true && vendor.owner_user_id === null, 'Synthetic vendor ineligible');
  const campuses = await rows('campuses', 'select=*&name=eq.' + encodeURIComponent('University of Maiduguri'));
  check(campuses.length === 1 && campuses[0].is_active === true, 'Campus ineligible');
  const campus = campuses[0];
  const associations = await rows('vendor_campuses', `select=*&vendor_id=eq.${vendor.id}&campus_id=eq.${campus.id}`);
  check(associations.length === 1 && associations[0].is_active === true, 'Association ineligible');
  const categories = await rows('categories', 'select=*&is_active=eq.true');
  const root = categories.find(c => c.slug === 'food' && c.parent_id === null);
  const child = categories.find(c => c.slug === 'food-campus-vendors' && c.parent_id === root?.id);
  check(root && child, 'Authoritative Food child missing');
  for (const [table, count] of Object.entries({ products: 44, services: 23, vendors: 14, vendor_campuses: 19, vendor_applications: 3 })) {
    check((await rows(table, table === 'vendor_campuses' ? 'select=vendor_id,campus_id' : 'select=id')).length === count, `Baseline changed: ${table}`);
  }
  check((await rows('products', `select=id&vendor_id=eq.${vendor.id}`)).length === 0, 'SYNTHETIC VENDOR BASELINE CHANGED');
  check((await rows('services', `select=id&vendor_id=eq.${vendor.id}`)).length === 0, 'Synthetic services baseline changed');
  mkdirSync(dir + '.vercel', { recursive: true });
  journal = { startedAt: new Date().toISOString(), stage: 'create-request-about-to-send', createRequests: 1, updateRequests: 0 };
  writeFileSync(journalPath, JSON.stringify(journal, null, 2), { flag: 'wx' });
  const created = await request('/rest/v1/rpc/admin_create_product', { body: {
    p_vendor_id: vendor.id, p_campus_id: campus.id, p_category_id: root.id, p_subcategory_id: child.id,
    p_name: name, p_description: initialDescription, p_price_kobo: 10000,
    p_original_price_kobo: null, p_image_url: null, p_is_in_stock: false, p_stock_quantity: 0,
  } });
  journal.productId = created.id;
  journal.stage = 'created'; save();
  check(created.id && created.name === name && created.price_kobo === 10000 && created.is_in_stock === false && created.vendor_id === vendor.id && created.campus_id === campus.id, 'Create response mismatch');
  async function verify(price, description) {
    const products = await rows('products', `select=*&vendor_id=eq.${vendor.id}`);
    check(products.length === 1, 'Synthetic product count mismatch');
    const p = products[0];
    check(p.id === created.id && p.name === name && p.vendor_id === vendor.id && p.campus_id === campus.id, 'Product identity mismatch');
    check(p.category_id === root.id && p.subcategory_id === child.id, 'Product category mismatch');
    check(p.price_kobo === price && p.description === description && p.original_price_kobo === null && p.image_url === null, 'Product values mismatch');
    check(p.is_in_stock === false && p.stock_quantity === 0, 'QUARANTINE FAILED');
    check(typeof p.slug === 'string' && p.slug.length > 0 && Number(p.rating) === 0 && p.review_count === 0 && p.is_popular === false, 'Server defaults mismatch');
    check((await rows('products', `select=id&id=eq.${created.id}`, true)).length === 0, 'OUT-OF-STOCK PRODUCT PUBLICLY VISIBLE');
  }
  await verify(10000, initialDescription);
  journal.stage = 'update-request-about-to-send'; journal.updateRequests = 1; save();
  await request('/rest/v1/rpc/admin_update_product', { body: { p_product_id: created.id, p_patch: { description: updatedDescription, price_kobo: 12500 } } });
  await verify(12500, updatedDescription);
  journal.stage = 'null-patch-about-to-send'; journal.updateRequests = 2; save();
  await request('/rest/v1/rpc/admin_update_product', { body: { p_product_id: created.id, p_patch: { description: null } } });
  await verify(12500, null);
  check((await rows('products', 'select=id')).length === 45, 'Final product count mismatch');
  journal.stage = 'rpc-checks-passed-awaiting-independent-fingerprints'; save();
  console.log('One create and two updates verified on the same quarantined product. Anonymous visibility checks passed. Independent side-effect fingerprints still required.');
}
main().catch(error => {
  // Do not serialize HTTP bodies, auth responses, environment, tokens, or stack traces.
  console.error('BLOCKED: ' + (error instanceof Error ? error.message : 'Smoke runner failed'));
  process.exitCode = 1;
});
