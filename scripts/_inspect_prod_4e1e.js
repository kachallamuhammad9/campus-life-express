const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
for (const l of env.split(/\r?\n/)) { const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`select p.proname, pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('set_updated_at','next_customer_order_number')`);
  for (const row of r.rows) { console.log('=== ' + row.proname + ' ==='); console.log(row.pg_get_functiondef); }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
