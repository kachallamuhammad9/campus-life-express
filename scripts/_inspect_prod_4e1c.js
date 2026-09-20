// Temporary Phase 4E.1 probe C (read-only).
const envRaw = require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8');
for (const line of envRaw.split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (label, sql) => {
    try { const r = await c.query(sql); console.log(`\n=== ${label} ===`); console.log(JSON.stringify(r.rows, null, 1)); }
    catch (e) { console.log(`\n=== ${label} ERROR ===\n${e.message}`); }
  };
  await q('COLUMNS FULL', `select column_name, data_type, is_nullable, column_default, character_maximum_length from information_schema.columns where table_schema='public' and table_name='vendor_applications' order by ordinal_position`);
  await q('CHECK CONSTRAINTS', `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.vendor_applications'::regclass`);
  await q('TRIGGERS', `select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.vendor_applications'::regclass and not tgisinternal`);
  await q('RLS', `select relrowsecurity, relforcerowsecurity from pg_class where oid='public.vendor_applications'::regclass`);
  await q('POLICIES', `select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname='public' and tablename='vendor_applications'`);
  await q('GRANTS', `select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='vendor_applications' order by grantee, privilege_type`);
  await q('campuses cols', `select column_name from information_schema.columns where table_schema='public' and table_name='campuses' and column_name in ('id','is_active','slug','name')`);
  await q('profiles table', `select to_regclass('public.profiles') as reg`);
  await c.end();
})();
