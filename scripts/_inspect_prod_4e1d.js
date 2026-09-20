// Temporary Phase 4E.1 probe D (read-only).
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
  await q('types like vendor_application%', `select typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and typname like 'vendor%'`);
  await q('functions like %vendor%', `select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ilike '%vendor%'`);
  await q('tables like %counter%', `select tablename from pg_tables where schemaname='public' and tablename like '%counter%'`);
  await q('sequences', `select sequencename from pg_sequences where schemaname='public'`);
  await q('updated_at helpers', `select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ilike '%updated%' or p.proname ilike '%touch%')`);
  await q('is_admin', `select p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_admin'`);
  await q('row count + statuses', `select count(*) as n, count(status) as status_nonnull, count(distinct status) as distinct_status from public.vendor_applications`);
  await q('distinct statuses', `select status, count(*) from public.vendor_applications group by status`);
  await q('updated_at triggers on vendor_applications', `select tgname from pg_trigger where tgrelid='public.vendor_applications'::regclass and not tgisinternal`);
  await q('campuses columns', `select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='campuses' order by ordinal_position`);
  await q('campuses rows (id, slug, is_active?)', `select * from public.campuses`);
  await q('set_updated_at def', `select pg_get_functiondef('public.set_updated_at'::regproc) as def`);
  await q('is_admin def', `select pg_get_functiondef('public.is_admin'::regproc) as def`);
  await q('profiles cols', `select column_name from information_schema.columns where table_schema='public' and table_name='profiles' order by ordinal_position limit 8`);
  await c.end();
})();
