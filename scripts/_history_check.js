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
  await q('MIGRATION HISTORY (last 8)', `select version, name from supabase_migrations.schema_migrations order by version desc limit 8`);
  await q('ALL vendor-related functions', `select p.proname, p.prosecdef as security_definer, p.proconfig as search_path, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ilike '%vendor%' or p.proname ilike '%application%') order by 1`);
  await q('RPC ACL submit_vendor_application', `select proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='submit_vendor_application'`);
  await q('RPC SOURCE submit_vendor_application', `select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='submit_vendor_application'`);
  await q('HELPER ACL _vendor_app_next_number', `select proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='_vendor_app_next_number'`);
  await q('ENUM vendor_application_status', `select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='vendor_application_status' order by enumsortorder`);
  await c.end();
})();
