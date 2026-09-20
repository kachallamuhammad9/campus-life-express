// READ-ONLY: check auth.users email unique index
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const line = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
const u = new URL(line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, ''));
(async () => {
  const c = new Client({ user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host: u.hostname, port: +(u.port || 5432), database: u.pathname.replace('/', ''), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("select indexname, indexdef from pg_indexes where schemaname='auth' and tablename='users' and indexdef ilike '%email%'");
  r.rows.forEach(x => console.log(x.indexname, '|', x.indexdef));
  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
