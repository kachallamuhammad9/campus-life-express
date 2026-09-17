// Local static contract checks and SQL NULL truth-table models. No DB connection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const strip = sql => sql.replace(/--[^\n]*/g, '').trim();
const migration = strip(read('supabase/migrations/0027_allow_unowned_vendors.sql'));
const schema = read('supabase/migrations/0004_vendors.sql');
const helpers = read('supabase/migrations/0013_security_helper_functions.sql');
const policies = read('supabase/migrations/0015_rls_policies.sql');
const functionBody = name => helpers.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`, 'i'))?.[1] || '';
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS: ' + name); }
test('migration changes only owner nullability; no DML, grants, helpers or policy changes', () => {
  assert.match(migration, /^alter table public\.vendors alter column owner_user_id drop not null;$/i);
});
test('original owner FK and ordinary UNIQUE remain in the migration chain', () => {
  assert.match(schema, /owner_user_id uuid not null unique references public\.profiles\(id\) on delete restrict/i);
  assert.doesNotMatch(migration, /drop constraint|drop index|references|unique/i);
});
test('owns_vendor requires authenticated uid and exact owner equality', () => {
  const body = functionBody('owns_vendor');
  assert.match(body, /if v_uid is null then\s+return false/i);
  assert.match(body, /return exists\s*\([\s\S]*where id = vendor_id\s+and owner_user_id = v_uid/i);
  assert.doesNotMatch(body, /is_admin|coalesce|owner_user_id is null/i);
});
test('get_user_vendor_ids requires uid and filters by exact equality', () => {
  const body = functionBody('get_user_vendor_ids');
  assert.match(body, /if v_uid is null then\s+return;/i);
  assert.match(body, /where owner_user_id = v_uid;/i);
  assert.doesNotMatch(body, /is_admin|coalesce|owner_user_id is null/i);
});
// Model PostgreSQL ordinary equality and UNIQUE NULLS DISTINCT, not JS null equality.
const sqlEquals = (a, b) => a === null || b === null ? null : a === b;
const owns = (owner, uid) => uid !== null && sqlEquals(owner, uid) === true;
const unique = owners => owners.every((owner, i) => owners.slice(0, i).every(other => sqlEquals(owner, other) !== true));
for (const uid of [null, 'ordinary-user', 'admin-user']) {
  test(`NULL owner grants no ownership to ${uid ?? 'anonymous'}`, () => assert.equal(owns(null, uid), false));
}
test('real owner retained; other users excluded', () => {
  assert.equal(owns('owner', 'owner'), true);
  assert.equal(owns('owner', 'other'), false);
});
test('ordinary UNIQUE permits multiple NULL owners', () => assert.equal(unique([null, null, 'owner']), true));
test('ordinary UNIQUE rejects duplicate non-NULL owners', () => assert.equal(unique([null, 'owner', 'owner']), false));
test('vendor id listing model excludes unowned vendors', () => {
  const rows = [{ id: 1, owner: null }, { id: 2, owner: 'owner' }, { id: 3, owner: null }];
  assert.deepEqual(rows.filter(r => owns(r.owner, 'owner')).map(r => r.id), [2]);
});
test('no permissive NULL ownership fallback in policies', () => {
  assert.doesNotMatch(policies, /owner_user_id\s+is\s+null|coalesce\s*\(\s*(?:\w+\.)?owner_user_id/i);
  assert.match(policies, /auth\.uid\(\) IS NOT NULL AND owner_user_id = auth\.uid\(\)/i);
});
for (const table of ['vendors', 'vendor_campuses', 'vendor_operating_hours', 'products', 'product_images', 'services', 'service_requests', 'orders', 'order_items']) {
  test(`${table} ownership access retains separate admin authorization`, () => {
    const blocks = [...policies.matchAll(/CREATE POLICY[\s\S]*?;/gi)].map(m => m[0]).filter(s => new RegExp(`ON public\\.${table}\\s`, 'i').test(s));
    assert(blocks.length > 0);
    assert(blocks.some(s => /owns_vendor/.test(s)));
    for (const block of blocks.filter(s => /owns_vendor/.test(s))) assert.match(block, /public\.is_admin\(\)/);
  });
}
test('Phase 4D order UPDATE bypass removal remains', () => assert.match(read('supabase/migrations/0025_admin_advance_vendor_order.sql'), /drop policy if exists "?orders_admin_update"? on public\.orders/i));
test('backend moderation skips notifications without owner', () => assert.match(read('clx-backend/src/services/adminService.js'), /existing\.status && existing\.owner_user_id/));
test('backend admin and reporting joins preserve unowned vendors', () => {
  for (const file of ['adminRepository.js', 'gasRepository.js']) {
    const source = read('clx-backend/src/repositories/' + file);
    assert.match(source, /LEFT JOIN public\.profiles AS p ON p\.id = v\.owner_user_id/);
    assert.doesNotMatch(source, /INNER JOIN public\.profiles AS p ON p\.id = v\.owner_user_id/);
  }
});
console.log(`\n${passed}/${passed} ownership checks passed. Static/model tests; not a PostgreSQL runtime test.`);
