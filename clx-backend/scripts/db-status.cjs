require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = `select current_database() as db, inet_server_addr()::text as host,
 (select count(*) from public.campuses) campuses,
 (select count(*) from public.categories) categories,
 (select count(*) from public.vendors) vendors,
 (select count(*) from public.products) products,
 (select count(*) from public.services) services,
 (select count(*) from public.marketplace_listings) listings,
 (select count(*) from public.delivery_zones) zones,
 (select count(*) from public.vendor_applications) vapps,
 (select count(*) from public.profiles) profiles,
 (select count(*) from public.roles) roles`;
pool.query(q).then(r => { console.log(JSON.stringify(r.rows[0], null, 1)); return pool.end(); })
  .catch(e => { console.error(e.message); process.exit(1); });
