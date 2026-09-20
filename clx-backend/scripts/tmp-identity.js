// Temp identity check script (safe, read-only)
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const r = await pool.query('select current_database() db, inet_server_addr()::text host');
  console.log(r.rows[0]);
  const t = await pool.query("select tablename from pg_tables where schemaname='public' order by 1");
  console.log(t.rows.map((x) => x.tablename).join(', '));
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
