// READ-ONLY: check the auth.users rows that correspond to existing profiles
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const line = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
const u = new URL(line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, ''));
(async () => {
  const c = new Client({ user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host: u.hostname, port: +(u.port || 5432), database: u.pathname.replace('/', ''), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`select p.id, p.email, a.id as auth_id, a.email as auth_email, a.deleted_at
    from profiles p left join auth.users a on a.id = p.id order by p.created_at`);
  r.rows.forEach(x => console.log(x.id, '| profile:', x.email, '| auth:', x.auth_email, '| authDeleted:', x.deleted_at !== null));
  // check unique constraint on auth.users email
  const cons = await c.query("select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='auth.users'::regclass and contype='u'");
  cons.rows.forEach(x => console.log('auth constraint:', x.conname, x.pg_get_constraintdef || x.def));
  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
