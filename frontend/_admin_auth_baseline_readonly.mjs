// Read-only production verification. No Auth attempts or mutation RPCs.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from 'dotenv';
const require = createRequire(new URL('../package.json', import.meta.url));
const { Client } = require('pg');
const expected = JSON.parse(readFileSync(new URL('../supabase/qa/0029_product_smoke_before.json', import.meta.url)))[0].baseline;
let client;
let stage = 'configuration';
try {
    const env = parse(readFileSync(new URL('../.env', import.meta.url)));
    const url = new URL(env.DATABASE_URL);
    const ref = 'bdjfkuddpupqaswzkrth';
    if (!(url.hostname === `db.${ref}.supabase.co` || (url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${ref}`))) throw new Error('target');
    client = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, statement_timeout: 15000, options: '-c default_transaction_read_only=on' });
    stage = 'database connection';
    await client.connect();
    stage = 'read-only transaction';
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const mode = (await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only;
    if (mode !== 'on') throw new Error('read-only guard');
    console.log(JSON.stringify({ databaseTargetVerified: true, transactionReadOnly: true }));
    let all = true;
    for (const old of expected.tables) {
        if (!/^(public|storage)\.[a-z_]+$/.test(old.entity)) throw new Error('table identifier');
        const sql = `SELECT count(*)::int AS count,
   md5(coalesce(string_agg(j, '' ORDER BY id),'')) AS by_id,
   md5(coalesce(string_agg(j, '' ORDER BY j),'')) AS by_json,
   md5(coalesce(string_agg(h, '' ORDER BY id),'')) AS hashes_by_id,
   md5(coalesce(string_agg(h, '' ORDER BY h),'')) AS hashes_sorted,
   md5(coalesce(string_agg(j, E'\\n' ORDER BY id),'')) AS newline_by_id,
   md5(coalesce(string_agg(j, E'\\n' ORDER BY j),'')) AS newline_by_json
   FROM (SELECT coalesce(to_jsonb(t)->>'id',to_jsonb(t)::text) AS id,to_jsonb(t)::text AS j,md5(to_jsonb(t)::text) AS h FROM ${old.entity} t) s`;
        const r = (await client.query(sql)).rows[0];
        const fingerprintMatches = Object.entries(r).some(([k, v]) => k !== 'count' && v === old.fingerprint);
        all = all && r.count === old.count && fingerprintMatches;
        console.log(JSON.stringify({ table: old.entity, count: r.count, countMatches: r.count === old.count, fingerprintMatches }));
    }
    for (const [kind, table, column] of [['applications', 'vendor_applications', 'application_number'], ['orders', 'customer_orders', 'order_number']]) {
        for (const old of expected[kind]) {
            const r = await client.query(`SELECT md5(to_jsonb(t)::text) AS hash FROM public.${table} t WHERE ${column}=$1`, [old.number]);
            const matches = r.rows.length === 1 && r.rows[0].hash === old.hash;
            all = all && matches;
            console.log(JSON.stringify({ protectedRecord: old.number, unchanged: matches }));
        }
    }
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ baselineUnchanged: all, productMutations: 0, frontendDeployment: 'NOT PERFORMED' }));
    if (!all) process.exitCode = 1;
} catch (error) {
    console.log(JSON.stringify({ baselineVerification: 'FAILED; sensitive details suppressed', stage, errorCode: /^[A-Z0-9_]{3,30}$/.test(error?.code || '') ? error.code : null, productMutations: 0 }));
    process.exitCode = 1;
} finally { await client?.end().catch(() => { }); }
