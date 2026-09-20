const { Client } = require('pg');
require('dotenv').config();
(async () => {
  const u = new URL(process.env.DATABASE_URL);
  const db = new Client({
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: +(u.port || 5432),
    database: u.pathname.replace('/', ''),
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  const r = await db.query(
    "select * from vendor_applications where business_name='Smoke Test Demo Vendor' and status='PENDING' and vendor_id is null order by created_at"
  );
  console.table(r.rows);
  await db.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
