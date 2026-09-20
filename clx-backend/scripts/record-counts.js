const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '..', '.env');
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const tables = ['profiles', 'user_roles', 'campuses', 'categories', 'vendors', 'vendor_campuses', 'vendor_operating_hours', 'vendor_applications', 'products', 'product_images', 'services', 'service_requests', 'marketplace_listings', 'listing_images', 'carts', 'cart_items', 'orders', 'order_items', 'order_payments', 'delivery_zones', 'delivery_requests', 'notifications'];
  for (const t of tables) {
    try { const r = await c.query(`select count(*) n from ${t}`); console.log(t + ':', r.rows[0].n); }
    catch (e) { console.log(t + ': ERR ' + e.message); }
  }
  await c.end();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
