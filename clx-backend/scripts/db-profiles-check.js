// READ-ONLY: list existing profiles & roles to determine if we can reuse them
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const line = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
const u = new URL(line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, ''));
(async () => {
  const c = new Client({ user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host: u.hostname, port: +(u.port || 5432), database: u.pathname.replace('/', ''), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`select p.id, p.full_name, p.email, p.default_campus_id, array_agg(distinct ur.role) roles from profiles p left join user_roles ur on ur.user_id = p.id group by p.id order by p.created_at`);
  r.rows.forEach(x => console.log(x.id, '|', x.full_name, '|', x.email, '|', Array.isArray(x.roles) ? x.roles.join(',') : String(x.roles)));
  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
