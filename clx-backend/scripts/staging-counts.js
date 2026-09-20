require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await c.connect();
  const t = await c.query("select tablename from pg_tables where schemaname='public' order by 1");
  for (const r of t.rows) {
    try {
      const n = await c.query(`select count(*)::int as n from "${r.tablename}"`);
      console.log(r.tablename, n.rows[0].n);
    } catch (e) { console.log(r.tablename, 'ERR', e.message); }
  }
  const id = await c.query("select current_database() db, inet_server_addr()::text host, version() v");
  console.log('DB_IDENTITY', JSON.stringify(id.rows[0]));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
