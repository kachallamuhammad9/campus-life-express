const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '..', '.env');
// load root .env manually
const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
for (const l of lines) {
  const m = l.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].replace(/^["']|["']$/g, '');
    process.env[m[1]] = v;
  }
}
const { Client } = require('pg');
(async () => {
  const u = new URL(process.env.DATABASE_URL);
  console.log('user:', u.username.slice(0, 14) + '***', '| host:', u.hostname, '| port:', u.port, '| db:', u.pathname);
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = await c.query('select current_database() db, current_user usr, inet_server_addr()::text addr');
  console.log('connected:', q.rows[0]);
  const t = await c.query("select table_name from information_schema.tables where table_schema='public' order by 1");
  console.log('tables:', t.rows.map(r => r.table_name).join(', '));
  await c.end();
})().catch(e => { console.error('CONNECT FAIL:', e.message); process.exit(1); });
