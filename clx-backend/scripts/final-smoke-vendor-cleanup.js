// FINAL smoke-test vendor cleanup. Deletes by EXACT ID with guards, inside a transaction.
const fs = require('fs');
const { Client } = require('pg');
const line = fs.readFileSync(__dirname + '/../.env', 'utf8').split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
const u = new URL(line.slice('DATABASE_URL='.length).trim());

const APP = 'c051df6b-3760-4db7-9de7-2d9a1a248788';
const VENDOR = '867acc84-828a-4ef2-8760-9d01a593c77d';

(async () => {
  const c = new Client({ user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host: u.hostname, port: +(u.port || 5432), database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log('== IDENTITY ==');
  console.log('host:', u.hostname, 'db:', u.pathname, 'user:', decodeURIComponent(u.username));
  const ver = await c.query('select version()');
  console.log('server:', ver.rows[0].version.split(',')[0]);

  console.log('\n== PRE-CHECKS ==');
  const app = await c.query('select id, business_name, status, vendor_id from vendor_applications where id = $1::uuid', [APP]);
  const a = app.rows[0];
  if (!a || a.business_name !== 'Smoke Test Demo Vendor' || a.status !== 'APPROVED' || a.vendor_id !== VENDOR) {
    console.log('APPLICATION CHECK FAILED:', JSON.stringify(a || null)); await c.end(); process.exit(1);
  }
  console.log('application OK:', JSON.stringify(a));
  const vend = await c.query('select id, name, status from vendors where id = $1::uuid', [VENDOR]);
  const v = vend.rows[0];
  if (!v || v.name !== 'Smoke Test Demo Vendor' || v.status !== 'SUSPENDED') {
    console.log('VENDOR CHECK FAILED:', JSON.stringify(v || null)); await c.end(); process.exit(1);
  }
  console.log('vendor OK:', JSON.stringify(v));

  // Dependents re-check
  const deps = await c.query(`select
    (select count(*) from products where vendor_id=$1::uuid) products,
    (select count(*) from services where vendor_id=$1::uuid) services,
    (select count(*) from marketplace_listings where seller_user_id=(select owner_user_id from vendors where id=$1::uuid)) listings,
    (select count(*) from orders where vendor_id=$1::uuid) orders,
    (select count(*) from carts where vendor_id=$1::uuid) carts,
    (select count(*) from vendor_reviews where vendor_id=$1::uuid) vendor_reviews,
    (select count(*) from product_reviews where product_id in (select id from products where vendor_id=$1::uuid)) product_reviews,
    (select count(*) from service_requests where vendor_id=$1::uuid) service_requests,
    (select count(*) from notifications where user_id=$1::uuid) notifications,
    (select count(*) from vendor_campuses where vendor_id=$1::uuid) vendor_campuses`, [VENDOR]);
  const d = deps.rows[0];
  console.log('dependents:', JSON.stringify(d));
  const meaningful = ['products', 'services', 'listings', 'orders', 'carts', 'vendor_reviews', 'product_reviews', 'service_requests', 'notifications']
    .filter(k => +d[k] !== 0);
  if (meaningful.length > 0 || +d.vendor_campuses !== 1) {
    console.log('UNEXPECTED DEPENDENTS:', meaningful.join(', ') || 'vendor_campuses count != 1'); await c.end(); process.exit(1);
  }
  console.log('only dependent is the single vendor_campuses row — safe to proceed');

  const before = await c.query("select (select count(*) from campuses) campuses, (select count(*) from categories) categories, (select count(*) from vendors) vendors, (select count(*) from products) products, (select count(*) from services) services, (select count(*) from marketplace_listings) listings, (select count(*) from delivery_zones) zones, (select count(*) from profiles) profiles, (select count(*) from user_roles) roles, (select count(*) from vendor_applications) applications, (select count(*) from orders) orders, (select count(*) from order_items) order_items");
  console.log('master counts before:', JSON.stringify(before.rows[0]));

  console.log('\n== TRANSACTION ==');
  await c.query('BEGIN');
  try {
    const delApp = await c.query("delete from vendor_applications where id = $1::uuid and status = 'APPROVED' and vendor_id = $2::uuid returning id", [APP, VENDOR]);
    if (delApp.rows.length !== 1) throw new Error('application delete matched ' + delApp.rows.length + ', expected 1');
    console.log('deleted application:', delApp.rows[0].id);

    const delVend = await c.query("delete from vendors where id = $1::uuid and status = 'SUSPENDED' and name = 'Smoke Test Demo Vendor' returning id", [VENDOR]);
    if (delVend.rows.length !== 1) throw new Error('vendor delete matched ' + delVend.rows.length + ', expected 1');
    console.log('deleted vendor:', delVend.rows[0].id);

    const vc = await c.query('select count(*)::int n from vendor_campuses where vendor_id = $1::uuid', [VENDOR]);
    if (vc.rows[0].n !== 0) throw new Error('vendor_campuses cascade did not remove assignment');
    console.log('vendor_campuses cascaded away (0 remaining)');

    const chkA = await c.query('select 1 from vendor_applications where id = $1::uuid', [APP]);
    const chkV = await c.query('select 1 from vendors where id = $1::uuid', [VENDOR]);
    if (chkA.rows.length || chkV.rows.length) throw new Error('post-delete existence check failed');

    await c.query('COMMIT');
    console.log('COMMITTED');
  } catch (e) {
    await c.query('ROLLBACK');
    console.log('ROLLED BACK:', e.message);
    await c.end();
    process.exit(1);
  }

  console.log('\n== POST-VERIFICATION ==');
  const counts = await c.query("select (select count(*) from campuses) campuses, (select count(*) from categories) categories, (select count(*) from vendors) vendors, (select count(*) from products) products, (select count(*) from services) services, (select count(*) from marketplace_listings) listings, (select count(*) from delivery_zones) zones, (select count(*) from profiles) profiles, (select count(*) from user_roles) roles, (select count(*) from vendor_applications) applications, (select count(*) from orders) orders, (select count(*) from order_items) order_items");
  console.log('master counts after:', JSON.stringify(counts.rows[0]));
  console.log('app exists:', (await c.query('select 1 from vendor_applications where id = $1::uuid', [APP])).rows.length);
  console.log('vendor exists:', (await c.query('select 1 from vendors where id = $1::uuid', [VENDOR])).rows.length);
  console.log('vendor_campuses exists:', (await c.query('select 1 from vendor_campuses where vendor_id = $1::uuid', [VENDOR])).rows.length);
  const smokeApps = await c.query("select count(*)::int n from vendor_applications where business_name ilike '%smoke%'");
  console.log('smoke applications remaining:', smokeApps.rows[0].n);
  const smokeVendors = await c.query("select count(*)::int n from vendors where name ilike '%smoke%' or email ilike '%smoke%'");
  console.log('smoke vendors remaining:', smokeVendors.rows[0].n);
  const smokeListings = await c.query("select count(*)::int n from marketplace_listings where title::text ilike '%smoke%'");
  console.log('smoke listings remaining:', smokeListings.rows[0].n);
  const smokeProd = await c.query("select count(*)::int n from products where name ilike '%smoke%'");
  const smokeSvc = await c.query("select count(*)::int n from services where name ilike '%smoke%'");
  console.log('smoke products/services remaining:', smokeProd.rows[0].n, '/', smokeSvc.rows[0].n);
  const demoVendors = await c.query("select count(*)::int n from vendors where legacy_key like 'demo:%' or email like '%@demo.campuslife.express'");
  console.log('demo vendors remaining:', demoVendors.rows[0].n);
  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
