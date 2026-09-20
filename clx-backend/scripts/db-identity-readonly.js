// READ-ONLY diagnostic. Does NOT modify anything. Never prints passwords.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const raw = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
const line = raw.split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
const url = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
// URL constructor handles '@' inside the password correctly (last '@' separates host)
const u = new URL(url);
const host = u.hostname;
const ref = host.includes('pooler') ? host.split('.')[1] : host.split('.')[0].replace(/^db\./, '');
console.log('safe host      :', host);
console.log('port           :', u.port || '5432');
console.log('database       :', u.pathname.replace('/', ''));
console.log('user           :', decodeURIComponent(u.username));
console.log('detected ref   :', ref);
console.log('password shown : NO');

(async () => {
  const c = new Client({ user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host, port: +(u.port || 5432), database: u.pathname.replace('/', ''), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const ver = await c.query('select version()');
  console.log('server         :', ver.rows[0].version.split(',')[0]);
  const schemas = await c.query("select nspname from pg_namespace where nspname like '%migration%'");
  console.log('migration schemas:', schemas.rows.map(r => r.nspname).join(', ') || 'none');
  try {
    const mig = await c.query('select count(*)::int n from supabase_migrations.migrations');
    const names = await c.query('select name from supabase_migrations.migrations order by name limit 80');
    console.log('applied migrations:', mig.rows[0].n);
    names.rows.forEach(r => console.log('   -', r.name));
  } catch (e) { console.log('applied migrations: ERR', e.message.split('\n')[0]); }
  const tables = await c.query("select tablename from pg_tables where schemaname='public' order by tablename");
  console.log('public table count:', tables.rows.length);
  console.log('tables:', tables.rows.map(r => r.tablename).join(', '));
  for (const tb of ['campuses', 'categories', 'vendors', 'products', 'services', 'marketplace_listings', 'delivery_zones', 'profiles', 'user_roles']) {
    try {
      const r = await c.query(`select count(*)::int n from "${tb}"`);
      let sample = '';
      if (['campuses', 'vendors', 'user_roles'].includes(tb)) {
        try { const s = await c.query(`select * from "${tb}" limit 3`); sample = ' | ' + s.rows.map(row => Object.values(row).slice(0, 3).join(' ')).join(' ; '); } catch (e) { }
      }
      console.log(tb.padEnd(22), r.rows[0].n, sample);
    } catch (e) { console.log(tb.padEnd(22), 'ERR', e.message.split('\n')[0]); }
  }
  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
