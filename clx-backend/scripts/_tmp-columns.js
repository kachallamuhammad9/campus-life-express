const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("select table_name, column_name from information_schema.columns where table_name in ('vendor_applications','vendors','marketplace_listings') order by table_name, ordinal_position");
  let last = '';
  for (const row of r.rows) { if (row.table_name !== last) { last = row.table_name; console.log('\n' + last + ':'); } process.stdout.write(row.column_name + ' '); }
  console.log();
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
