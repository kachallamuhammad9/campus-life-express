require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const idx = await c.query("select indexname, indexdef from pg_indexes where tablename in ('vendor_campuses','vendor_operating_hours')");
  idx.rows.forEach(r => console.log(r.indexname, '::', r.indexdef));
  const n = await c.query(`select
    (select count(*) from vendor_campuses) vc,
    (select count(*) from vendor_operating_hours) voh,
    (select count(*) from vendors) v`);
  console.log(n.rows[0]);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
