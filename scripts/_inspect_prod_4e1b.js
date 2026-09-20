// Temporary Phase 4E.1 probe B (read-only).
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
  await q('STATUS DISTINCT + COUNT', `select status, count(*)::int as n from public.vendor_applications group by status order by status`);
  await q('NULL STATUS COUNT', `select count(*)::int as nulls from public.vendor_applications where status is null`);
  await q('TOTAL ROWS', `select count(*)::int as total from public.vendor_applications`);
  await q('INDEXES', `select indexname, indexdef from pg_indexes where schemaname='public' and tablename='vendor_applications'`);
  await q('HAS whatsapp / submitted_at / application_number cols', `select column_name from information_schema.columns where table_schema='public' and table_name='vendor_applications' and column_name in ('whatsapp','whatsapp_number','submitted_at','application_number','reviewed_at')`);
  await q('year range', `select min(created_at) as min_c, max(created_at) as max_c from public.vendor_applications`);
  await q('WHATSAPP-LIKE helpers', `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ilike '%whatsapp%' or p.proname ilike '%phone%' or p.proname ilike '%updated_at%')`);
  await q('updated_at trigger funcs in public', `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prorettype='trigger'::regtype`);
  await q('vendor_application_counters exists', `select to_regclass('public.vendor_application_counters') as reg`);
  await q('sequences vendor', `select sequencename from pg_sequences where schemaname='public' and sequencename ilike '%vendor%'`);
  await q('ALL COLUMNS', `select ordinal_position, column_name, data_type, is_nullable, column_default, character_maximum_length from information_schema.columns where table_schema='public' and table_name='vendor_applications' order by ordinal_position`);
await q('CONSTRAINTS', `select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.vendor_applications'::regclass order by conname`);
await q('POLICIES', `select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='vendor_applications'`);
await q('RLS ENABLED', `select relrowsecurity, relforcerowsecurity from pg_class where oid='public.vendor_applications'::regclass`);
await q('GRANTS', `select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='vendor_applications' order by grantee, privilege_type`);
await q('TRIGGERS', `select tgname, pg_get_triggerdef(oid) as def from pg_trigger where tgrelid='public.vendor_applications'::regclass and not tgisinternal`);
await q('FUNDS: submit_rpc / enum / counters / seq', `select
  to_regproc('public.submit_vendor_application') as rpc,
  to_regtype('public.vendor_application_status') as enum,
  to_regclass('public.vendor_application_counters') as counters,
  to_regclass('public.vendor_applications_seq_tmp') as seq,
  to_regproc('public._vendor_app_next_number') as next_num,
  to_regproc('public.is_admin') as is_admin`);
  await c.end();
})();
