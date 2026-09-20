const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
for (const l of env.split(/\r?\n/)) { const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (label, sql) => {
    try { const r = await c.query(sql); console.log(`\n=== ${label} ===`); console.log(JSON.stringify(r.rows, null, 1)); }
    catch (e) { console.log(`\n=== ${label} ERROR ===\n${e.message}`); }
  };
  await q('old helpers exist?', `select p.proname, pg_get_function_identity_arguments(p.oid) args, prosecdef, regexp_replace(pg_get_functiondef(p.oid), '.*', '') dummy from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('_vendor_app_next_number','submit_vendor_application','_clx_normalize_ng_phone','normalize_ng_phone')`);
  await q('old helper defs', `select p.proname, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('_vendor_app_next_number','submit_vendor_application')`);
  await q('sequences', `select sequencename from pg_sequences where schemaname='public' and sequencename ilike '%vendor%'`);
  await q('tables', `select tablename from pg_tables where schemaname='public' and (tablename ilike '%vendor_application%' or tablename ilike '%counter%')`);
  await q('vendor_application_status type', `select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder) labels from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname in ('vendor_application_status') group by t.typname`);
  await q('triggers on vendor_applications', `select tgname, pg_get_triggerdef(t.oid) def from pg_trigger t where t.tgrelid='public.vendor_applications'::regclass and not t.tgisinternal`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
