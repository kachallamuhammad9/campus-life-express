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
  await q('FULL SCHEMA', `select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='vendor_applications' order by ordinal_position`);
  await q('RLS ENABLED', `select relrowseless from pg_class where oid='public.vendor_applications'::regclass`);
  await q('POLICIES', `select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='vendor_applications'`);
  await q('GRANTS', `select grantee, string_agg(privilege_type, ',' order by privilege_type) privs from information_schema.role_table_grants where table_schema='public' and table_name='vendor_applications' group by grantee`);
  await q('INDEXES', `select indexname, indexdef from pg_indexes where schemaname='public' and tablename='vendor_applications'`);
  await q('TRIGGERS', `select tgname from pg_trigger where tgrelid='public.vendor_applications'::regclass and not tgisinternal`);
  await q('CHECK CONSTRAINTS', `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.vendor_applications'::regclass and contype in ('c','u','p')`);
  await q('DISTINCT STATUS + COUNTS', `select status, count(*) from public.vendor_applications group by status`);
  await q('ROW COUNT', `select count(*) from public.vendor_applications`);
  await q('CAMPUS SLUGS IN ROWS', `select distinct campus_slug from public.vendor_applications order by 1`);
  await q('CAMPUSES TABLE', `select slug, is_active from public.campuses order by 1`);
  await q('IS_ADMIN FN', `select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_admin'`);
  await q('UPDATED_AT TRIGGER FN', `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%updated_at%' or p.proname like '%set_updated%' or p.proname like '%touch%')`);
  await q('MAX VA SUFFIX', `select coalesce(max((regexp_match(slug, '-VA-(\\d+)$'))[1]::int),0) as max_suffix, count(*) va_rows from public.vendor_applications where slug ~ '-VA-\\d+$'`);
  await q('RLS', `select relrowsecurity from pg_class where oid='public.vendor_applications'::regclass`);
  await c.end();
})();
