const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode') ? { rejectUnauthorized: false } : false });
  await c.connect();
  const a = await c.query("select id,business_name,status,vendor_id,created_at from vendor_applications where business_name ilike '%temp%' or business_name ilike '%smoke%' order by created_at desc limit 10");
  console.log('temp vendor_applications:', JSON.stringify(a.rows, null, 1));
  const v = await c.query("select id,name,slug,owner_user_id,status,created_at from vendors where name ilike '%temp%' or slug like 'temp-%' order by created_at desc limit 10");
  console.log('temp vendors:', JSON.stringify(v.rows, null, 1));
  const l = await c.query("select id,title,status from marketplace_listings where title ilike '%temp%' or title ilike '%test%' order by created_at desc limit 10");
  console.log('temp listings:', JSON.stringify(l.rows, null, 1));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
