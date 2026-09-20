// Checks whether the connected DB has data (to distinguish disposable vs production).
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const raw = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
const m = raw.match(/DATABASE_URL=(.*)/)[1].trim().match(/^postgresql:\/\/([^:]+):(.*)@([^:@\/]+):(\d+)\/(.+)$/);
const c = new Client({ user: m[1], password: m[2], host: m[3], port: +m[4], database: m[5], ssl: { rejectUnauthorized: false } });
(async () => {
  await c.connect();
  const t = await c.query("select nspname from pg_namespace where nspname like '%migration%'");
  console.log('migration-tracking schemas:', t.rows.map(r => r.nspname).join(',') || 'none');
  for (const tb of ['campuses', 'categories', 'vendors', 'products', 'services', 'marketplace_listings', 'delivery_zones', 'profiles', 'user_roles', 'audit_logs']) {
    try { const r = await c.query('select count(*)::int n from ' + tb); console.log(tb.padEnd(22), r.rows[0].n); }
    catch (e) { console.log(tb.padEnd(22), 'ERR:', e.message.split('\n')[0]); }
  }
  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
