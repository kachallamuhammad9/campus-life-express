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
  await q('updated_at helper fns', `select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ilike '%updated%' or p.proname ilike '%touch%' or p.proname ilike '%set_timestamp%')`);
  await q('campus enum/cols', `select column_name, data_type, udt_name from information_schema.columns where table_schema='public' and table_name='campuses' order by ordinal_position`);
  await q('campus rows', `select id, name, slug, is_active from public.campuses order by name`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
