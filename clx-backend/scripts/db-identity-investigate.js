// READ-ONLY identity investigation. No INSERT/UPDATE/DELETE/DDL anywhere.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Safe parse: URL API handles the '@' inside the password correctly.
const raw = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
const line = raw.split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
const u = new URL(line.slice('DATABASE_URL='.length).trim());
const host = u.hostname;              // non-secret
const projectRef = host.split('.')[0];
const db = u.pathname.slice(1);
console.log('host (safe):', host);
console.log('project ref:', projectRef);
console.log('database   :', db);
console.log('user       :', u.username);

const c = new Client({
  user: u.username, password: decodeURIComponent(u.password),
  host, port: u.port || 5432, database: db,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await c.connect();
  // 1) Migration tracking (read-only)
  const ms = await c.query("select nspname from pg_namespace where nspname like '%migration%'");
  console.log('\nmigration schemas:', ms.rows.map(r => r.nspname).join(',') || 'none');
  for (const s of ms.rows) {
    const nm = s.nspname;
    const tables = await c.query("select tablename from pg_tables where schemaname=$1", [nm]);
    console.log(`  schema ${nm} tables:`, tables.rows.map(r => r.tablename).join(','));
    if (tables.rows.some(r => r.tablename === 'supabase_migrations')) {
      const ver = await c.query(`select count(*)::int n from ${nm}.supabase_migrations`);
      const last = await c.query(`select name, statements, version from ${nm}.supabase_migrations order by version desc limit 5`).catch(() => null);
      console.log(`  applied migration rows:`, ver.rows[0].n);
      if (last) last.rows.forEach(r => console.log(`    - ${r.version} ${r.name}`));
    }
  }

  // 2) Table list + row counts
  const tabs = await c.query("select tablename from pg_tables where schemaname='public' order by tablename");
  console.log('\npublic tables (' + tabs.rows.length + '):', tabs.rows.map(r => r.tablename).join(', '));
  const counts = {};
  for (const { tablename } of tabs.rows) {
    try { const r = await c.query(`select count(*)::int n from "${tablename}"`); counts[tablename] = r.rows[0].n; } catch { counts[tablename] = 'ERR'; }
  }
  console.log('\nrow counts:'); for (const [k, v] of Object.entries(counts)) console.log(' ', k.padEnd(28), v);

  // 3) Identity probes — sample identifying rows
  for (const [tb, cols] of [['campuses', 'id,name,slug,code'], ['vendors', 'id,name,slug'], ['categories', 'id,name,slug'], ['delivery_zones', 'id,name'], ['profiles', 'id,username,full_name']]) {
    try {
      const r = await c.query(`select ${cols} from ${tb} limit 5`);
      console.log(`\n${tb} sample:`);
      r.rows.forEach(row => console.log('  ', JSON.stringify(row)));
    } catch (e) { console.log(`\n${tb} sample ERR:`, e.message.split('\n')[0]); }
  }

  // 4) timestamps to see when data was created
  try { const r = await c.query("select min(created_at) oldest, max(created_at) newest from profiles"); console.log('\nprofiles created_at range:', r.rows[0]); } catch (e) { console.log('\nprofiles created_at: n/a'); }
  try { const r = await c.query("select min(created_at) oldest, max(created_at) newest from products"); console.log('products created_at range:', r.rows[0]); } catch (e) { console.log('products created_at: n/a'); }

  await c.end();
  console.log('\nDONE (read-only, no writes performed)');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
