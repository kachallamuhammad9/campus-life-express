// Independent database reads only; never authenticates as or impersonates a user.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from 'dotenv';
const { Client } = createRequire(new URL('../package.json', import.meta.url))('pg');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
export async function snapshot(excludeProductId = null) {
    const env = parse(readFileSync(new URL('../.env', import.meta.url)));
    const url = new URL(env.DATABASE_URL), ref = 'bdjfkuddpupqaswzkrth';
    assert(url.hostname === `db.${ref}.supabase.co` || (url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${ref}`), 'Database target mismatch');
    const db = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, statement_timeout: 20000, options: '-c default_transaction_read_only=on' });
    try {
        await db.connect();
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY');
        assert((await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only === 'on', 'Read-only guard failed');
        const tables = (await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','storage') ORDER BY schemaname,tablename")).rows;
        const fingerprints = {};
        for (const t of tables) {
            assert(/^[a-z_]+$/.test(t.schemaname) && /^[a-z_0-9]+$/.test(t.tablename), 'Unexpected identifier');
            const table = `${t.schemaname}.${t.tablename}`;
            const excluded = table === 'public.products' && excludeProductId;
            fingerprints[table] = (await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) AS hash FROM ${table} t ${excluded ? 'WHERE id <> $1' : ''}`, excluded ? [excludeProductId] : [])).rows[0];
        }
        const vendors = (await db.query("SELECT id,status,is_verified,owner_user_id FROM public.vendors WHERE name='CLX Phase 4E Approval Test'")).rows;
        assert(vendors.length === 1, 'Synthetic vendor not unique');
        const vendor = vendors[0];
        assert(vendor.status === 'ACTIVE' && vendor.is_verified === true && vendor.owner_user_id === null, 'Synthetic vendor ineligible');
        const counts = (await db.query('SELECT (SELECT count(*)::int FROM public.products WHERE vendor_id=$1) AS products,(SELECT count(*)::int FROM public.services WHERE vendor_id=$1) AS services', [vendor.id])).rows[0];
        const fn = (await db.query("SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_customer_order'")).rows;
        const guard = "if not v_product.is_in_stock or (v_product.stock_quantity is not null and v_product.stock_quantity < v_quantity) then return jsonb_build_object('success', false, 'code', 'PRODUCT_UNAVAILABLE'";
        assert(fn.length === 1 && fn[0].prosrc.includes(guard) && fn[0].prosrc.indexOf(guard) < fn[0].prosrc.indexOf('insert into public.customer_orders'), 'Production checkout guard not confirmed');
        const migrations = (await db.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version')).rows.map(r => r.version);
        assert(migrations.at(-1) === '0029', 'Migration history changed');
        const result = { fingerprints, vendor: { ...vendor, ...counts }, checkoutRejectsOutOfStock: true, migrationLatest: '0029' };
        await db.query('ROLLBACK');
        return result;
    } finally {
        await db.end().catch(() => {});
    }
}
