// Temporary Phase 4E.1 production schema inspector (safe read-only queries).
const envRaw = require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8');
for (const line of envRaw.split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const q = async (label, sql) => {
    try {
      const r = await c.query(sql);
      console.log(`\n=== ${label} ===`);
      console.log(JSON.stringify(r.rows, null, 1));
    } catch (e) { console.log(`\n=== ${label} ERROR ===\n${e.message}`); }
  };

  // Migration history
  await q('MIGRATION HISTORY (last 6)', `select version, name, inserted_at is not null as recorded from supabase_migrations.schema_migrations order by version desc limit 6`);

  // Tables
  await q('TABLES vendor/counter', `select tablename from pg_tables where schemaname='public' and (tablename like 'vendor_app%' or tablename like '%counter%') order by 1`);

  // Columns
  await q('vendor_applications COLUMNS', `select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='vendor_applications' order by ordinal_position`);

  // RLS
  await q('RLS vendor_applications', `select relrowsecurity, relforcerowsecurity from pg_class where relname='vendor_applications' and relnamespace='public'::regnamespace`);

  // Policies
  await q('POLICIES vendor_applications', `select policyname, cmd, roles, qual from pg_policies where tablename='vendor_applications'`);

  // Grants
  await q('GRANTS vendor_applications', `select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='vendor_applications' order by grantee, privilege_type`);

  // Unique constraint on application_number
  await q('CONSTRAINTS vendor_applications', `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.vendor_applications'::regclass`);

  // Functions
  await q('FUNCTIONS vendor app', `select p.proname, p.prosecdef, p.proconfig, pg_get_function_identity_arguments(p.oid) as args, pg_get_userbyid(p.proowner) as owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%vendor_app%' order by 1`);

  // Function ACLs
  await q('RPC ACL submit_vendor_application', `select proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='submit_vendor_application'`);

  // RPC source snippet
  await q('RPC SOURCE submit_vendor_application', `select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='submit_vendor_application'`);

  // Helper ACLs
  await q('HELPER ACL _vendor_app_next_number', `select proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='_vendor_app_next_number'`);

  // Trigger
  await q('TRIGGERS vendor_applications', `select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.vendor_applications'::regclass and not tgisinternal`);

  // Counters table
  await q('COUNTERS TABLE ACL', `select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='vendor_application_counters'`);

  // Enum
  await q('ENUM vendor_application_status', `select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='vendor_application_status' order by enumsortorder`);

  await c.end();
})();
