const fs = require('fs');
const path = require('path');
// load root ../../.env
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((l) => {
    const m = l.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}
const { Client } = require('pg');
const QUERY = `select
  (select count(*) from profiles) profiles,
  (select count(*) from vendors) vendors,
  (select count(*) from products) products,
  (select count(*) from services) services,
  (select count(*) from marketplace_listings) listings,
  (select count(*) from campuses) campuses,
  (select count(*) from categories) categories,
  (select count(*) from orders) orders,
  (select count(*) from cart_items) cart_items,
  (select count(*) from delivery_requests) delivery_requests,
  (select count(*) from vendor_applications) vendor_applications,
  (select count(*) from user_roles) user_roles`;
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(QUERY);
  console.log(JSON.stringify(r.rows[0], null, 1));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
