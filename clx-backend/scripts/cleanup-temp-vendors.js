const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });
  await c.connect();
  const d = await c.query("delete from vendors where slug like 'temp-second-vendor-%' or slug like 'temp-first-vendor-%' or slug like 'temp-vendor-%' returning slug");
  console.log('deleted vendors:', d.rows.map(r => r.slug));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
