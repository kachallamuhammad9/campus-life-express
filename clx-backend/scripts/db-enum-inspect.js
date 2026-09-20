// READ-ONLY enum inspector
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const envPath = path.join(__dirname, '..', '..', '.env');
const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
const u = new URL(line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, ''));
(async () => {
  const c = new Client({ user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host: u.hostname, port: +(u.port || 5432), database: u.pathname.replace('/', ''), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder) labels from pg_type t join pg_enum e on e.enumtypid=t.oid group by t.typname order by t.typname");
  r.rows.forEach(x => console.log(x.typname + ': ' + x.labels));
  // also list categories with parents
  const cats = await c.query("select c.slug, c.name, p.slug parent from categories c left join categories p on p.id=c.parent_id order by coalesce(p.sort_order,0), c.sort_order");
  console.log('== categories (' + cats.rows.length + ')');
  cats.rows.forEach(x => console.log('  ' + (x.parent || 'ROOT') + ' > ' + x.slug + ' (' + x.name + ')'));
  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
