// Temporary Phase 1 identity check. Reads DATABASE_URL from root .env.
// Never prints the password. Verifies target DB is EMPTY before migrations.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  const map = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
}

function parseDbUrl(raw) {
  // Password may contain unencoded '@'. Split safely: postgresql://user:pass@host:port/db
  const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@\/]+):(\d+)\/(.+)$/);
  if (!m) throw new Error('DATABASE_URL format not recognized');
  return { user: m[1], password: m[2], host: m[3], port: Number(m[4]), database: m[5] };
}

(async () => {
  const env = loadEnv();
  if (!env.DATABASE_URL) { console.error('BLOCKER: DATABASE_URL missing'); process.exit(2); }
  const cfg = parseDbUrl(env.DATABASE_URL);
  console.log('Target host :', cfg.host);
  console.log('Target port :', cfg.port);
  console.log('Target db   :', cfg.database);
  console.log('Target user :', cfg.user);
  const client = new Client({ ...cfg, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const { rows: ver } = await client.query('select version() as v');
    console.log('Server      :', ver[0].v.split(',')[0]);
    const { rows: t } = await client.query(
      "select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
    );
    console.log('Public tables existing:', t[0].n);
    const { rows: s } = await client.query(
      "select count(*)::int as n from pg_catalog.pg_namespace where nspname not in ('pg_catalog','information_schema') and nspname not like 'pg_toast%' and nspname not like 'supabase%'"
    );
    console.log('Custom schemas:', s[0].n);
    if (t[0].n === 0) {
      console.log('VERDICT: EMPTY — safe to treat as disposable target.');
    } else {
      const { rows: names } = await client.query(
        "select table_name from information_schema.tables where table_schema='public' order by table_name limit 40"
      );
      console.log('Existing tables:', names.map((r) => r.table_name).join(', '));
      console.log('VERDICT: NOT EMPTY — do not assume disposable.');
    }
  } catch (e) {
    console.error('CONNECTION FAILED:', e.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
})();
