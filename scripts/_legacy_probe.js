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
  await q('EXISTING ROW COUNT', `select count(*) from public.vendor_applications`);
  await q('DISTINCT STATUS VALUES', `select distinct status from public.vendor_applications`);
  await q('FUNCTIONS containing "application" or "vendor_app"', `select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ilike '%application%' or p.proname ilike '%vendor_app%')`);
  await q('SEARCH anywhere for 0026 artifacts', `select to_regclass('public.vendor_applications') as tbl, to_regtype('public.vendor_application_status') as enum, to_regproc('public.submit_vendor_application') as rpc, to_regproc('public._vendor_app_next_number') as helper`);
  await q('CAMPUS COLUMN / FK', `select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.vendor_applications'::regclass and contype='f'`);
  await q('campuses sample (id,slug,is_active)', `select count(*) total, count(*) filter (where is_active) active from public.campuses`);
  await c.end();
})();
