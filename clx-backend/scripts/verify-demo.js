require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });
  await c.connect();
  const count = async (t) => +(await c.query('select count(*)::int c from ' + t)).rows[0].c;
  const out = {};
  for (const t of ['campuses','categories','vendors','vendor_campuses','vendor_operating_hours','products','services','marketplace_listings','delivery_zones','profiles','user_roles']) out[t] = await count(t);
  console.log('ROW COUNTS', JSON.stringify(out, null, 1));
  const orph = await c.query(`select 'product-no-vendor' k, count(*)::int c from products p left join vendors v on p.vendor_id=v.id where v.id is null union all
    select 'product-no-cat', count(*)::int from products p left join categories ca on p.category_id=ca.id where ca.id is null union all
    select 'service-no-vendor', count(*)::int from services s left join vendors v on s.vendor_id=v.id where v.id is null union all
    select 'listing-no-seller-profile', count(*)::int from marketplace_listings l left join profiles pr on l.seller_user_id=pr.id where pr.id is null union all
    select 'listing-no-campus', count(*)::int from marketplace_listings l left join campuses cm on l.campus_id=cm.id where cm.id is null union all
    select 'vendor-no-campus', count(*)::int from vendors v left join vendor_campuses vc on vc.vendor_id=v.id where vc.vendor_id is null union all
    select 'hours-no-vendor', count(*)::int from vendor_operating_hours h left join vendors v on h.vendor_id=v.id where v.id is null`);
  console.log('ORPHAN CHECK', JSON.stringify(orph.rows));
  const dup = await c.query(`select 'demo-vendors' k, count(*)::int c from vendors where legacy_key like 'demo:vendor:%' union all
    select 'demo-products', count(*)::int from products where legacy_key like 'demo:product:%' union all
    select 'demo-services', count(*)::int from services where legacy_key like 'demo:service:%' union all
    select 'demo-listings', count(*)::int from marketplace_listings where legacy_key like 'demo:listing:%'`);
  console.log('DEMO ROWS BY KEY (should equal seed totals)', JSON.stringify(dup.rows));
  const vc = await c.query("select v.slug, v.name, v.status, v.legacy_key from vendors v left join vendor_campuses x on x.vendor_id=v.id where x.vendor_id is null");
  console.log('VENDOR WITH NO CAMPUS', JSON.stringify(vc.rows));
  await c.end();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
