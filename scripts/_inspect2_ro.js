const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
for (const l of env.split(/\r?\n/)) { const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
const { Client } = require('pg');
(async () => {
  const u = new URL(process.env.DATABASE_URL.trim().replace(/^"|"$/g, ''));
  u.password = decodeURIComponent(u.password);
  const c = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (label, sql) => {
    try { const r = await c.query(sql); console.log(`\n=== ${label} ===`); console.log(JSON.stringify(r.rows, null, 1)); }
    catch (e) { console.log(`\n=== ${label} ERROR ===\n${e.message}`); }
  };
  await q('campuses columns', `select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='campuses' order by ordinal_position`);
  await q('campuses rows', `select * from public.campuses`);
  await q('rls enabled', `select relname, relrowsecurity, relforcerowsecurity from pg_class where oid='public.vendor_applications'::regclass`);
  await q('policies va', `select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='vendor_applications'`);
  await q('policies campuses', `select policyname, cmd, roles from pg_policies where schemaname='public' and tablename='campuses'`);
  await q('grants va', `select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='vendor_applications' and grantee in ('anon','authenticated','service_role') order by grantee, privilege_type`);
  await q('grants campuses', `select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='campuses' and grantee in ('anon','authenticated','service_role') order by grantee, privilege_type`);
  await q('triggers va', `select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid='public.vendor_applications'::regclass and not tgisinternal`);
  await q('helper fns', `select p.oid::regprocedure fn, p.prosecdef secdef, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~* 'updated_at|is_admin|touch|set_updated') order by 1`);
  await q('all public fns count', `select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`);
  await q('sequences', `select sequencename from pg_sequences where schemaname='public'`);
  await q('counter tables', `select table_name from information_schema.tables where table_schema='public' and table_name ~ 'counter|number|sequence'`);
  await q('existing 4e1 artifacts', `select p.oid::regprocedure fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ 'vendor'`);
  await q('admin roles table?', `select table_name from information_schema.tables where table_schema='public' and (table_name ~* 'admin|role|profile')`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
