const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
  await c.connect();
  const tables = ['campuses', 'categories', 'vendors', 'vendor_onboarding_applications', 'products', 'product_submissions', 'services', 'service_submissions', 'marketplace_listings', 'orders', 'order_items', 'carts', 'cart_items', 'delivery_zones', 'delivery_requests', 'profiles'];
  console.log('== FINAL COUNTS ==');
  for (const t of tables) {
    try {
      const r = await c.query('select count(*)::int as n from ' + t);
      console.log(t + ': ' + r.rows[0].n);
    } catch (e) { console.log(t + ': ERR ' + e.message); }
  }
  console.log('== TEMP RECORDS REMAINING ==');
  console.log('temp products: ' + (await c.query("select count(*)::int as n from products where name like 'TEMP-%'")).rows[0].n);
  console.log('temp vendors: ' + (await c.query("select count(*)::int as n from vendors where slug like 'temp-%'")).rows[0].n);
  console.log('temp listings: ' + (await c.query("select count(*)::int as n from marketplace_listings where title like 'TEMP-%'")).rows[0].n);
  console.log('== ORPHANS ==');
  try {
    const o1 = await c.query('select count(*)::int as n from products p left join vendors v on v.id=p.vendor_id where v.id is null');
    console.log('orphan products: ' + o1.rows[0].n);
    const o2 = await c.query('select count(*)::int as n from order_items oi left join orders o on o.id=oi.order_id where o.id is null');
    console.log('orphan order_items: ' + o2.rows[0].n);
    const o3 = await c.query('select count(*)::int as n from cart_items ci left join carts ca on ca.id=ci.cart_id where ca.id is null');
    console.log('orphan cart_items: ' + o3.rows[0].n);
  } catch (e) { console.log('orphan check skipped: ' + e.message); }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
