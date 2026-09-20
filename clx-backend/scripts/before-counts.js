const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
(async () => {
  const ssl = process.env.PGSSLMODE !== 'disable';
  const c = new Client({ connectionString: process.env.DATABASE_URL, ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}) });
  await c.connect();
  const r = await c.query(`select
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
    (select count(*) from user_roles) user_roles`);
  console.log(JSON.stringify(r.rows[0], null, 1));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
