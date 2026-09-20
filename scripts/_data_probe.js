const fs = require('fs'), path = require('path');
const envRaw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
for (const line of envRaw.split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (label, sql) => {
    try { const r = await c.query(sql); console.log(`\n=== ${label} ===`); console.log(JSON.stringify(r.rows, null, 1)); }
    catch (e) { console.log(`\n=== ${label} ERROR ===\n${e.message}`); }
  };
  await q('DISTINCT STATUS', `select status, count(*) from public.vendor_applications group by status`);
  await q('ROW COUNT', `select count(*) from public.vendor_applications`);
  await q('MIN/MAX created_at', `select min(created_at) oldest, max(created_at) newest from public.vendor_applications`);
  await q('SET_UPDATED_AT SRC', `select prosrc, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='set_updated_at'`);
  await q('IS_ADMIN', `select prosrc, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='is_admin'`);
  await q('UPDATED_AT TRIGGERS sample', `select distinct event_object_table, trigger_name from information_schema.triggers where trigger_schema='public' and trigger_name ilike '%updated%' limit 8`);
  await q('CAMPUS COLS', `select column_name from information_schema.columns where table_schema='public' and table_name='campuses' and column_name in ('id','slug','is_active')`);
  await c.end();
})();
