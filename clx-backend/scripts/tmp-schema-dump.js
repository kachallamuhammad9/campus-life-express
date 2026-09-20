// READ-ONLY schema dump helper. Never prints secrets.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

let raw;
try { raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8'); } catch (e) { raw = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8'); }
const line = raw.split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
const url = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
const u = new URL(url);
const tables = process.argv.slice(2);

(async () => {
  const c = new Client({
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    host: u.hostname, port: +(u.port || 5432), database: u.pathname.replace('/', ''),
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  for (const t of tables) {
    const cols = await c.query(
      "select column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position", [t]);
    console.log('== ' + t);
    cols.rows.forEach(r => console.log('  ' + r.column_name + ' | ' + r.data_type + ' | null:' + r.is_nullable + ' | def:' + (r.column_default || '')));
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
