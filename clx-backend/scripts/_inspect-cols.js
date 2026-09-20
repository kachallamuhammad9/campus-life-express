const { Client } = require('pg');
require('dotenv').config();
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  for (const t of ['vendor_applications', 'vendors', 'marketplace_listings']) {
    const r = await c.query('select column_name from information_schema.columns where table_name=$1 order by ordinal_position', [t]);
    console.log(t + ':', r.rows.map(x => x.column_name).join(', '));
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
