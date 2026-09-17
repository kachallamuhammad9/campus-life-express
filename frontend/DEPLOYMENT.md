# CLX Production Deployment

## Architecture

Current production uses a Vercel-hosted CLX frontend with Supabase backend services. Supabase provides Auth, PostgreSQL, RLS, and protected RPCs for the current production request path. WhatsApp Business is used for operational and customer handoff.

The Express/Render/Paystack-oriented material in `../clx-backend/` is legacy reference material, not the current production deployment path.

## Frontend

The Vite multi-page frontend is deployed through the existing Vercel CLX project and production domain:

- [https://clx.dandalinsauki.com](https://clx.dandalinsauki.com)

Use the existing frontend package scripts from `frontend/`:

```sh
npm run lint
npm run build
```

Do not invent or replace Vercel project identifiers, domains, or deployment settings in repository documentation.

## Environment Configuration

The current frontend build configuration recognizes these public Supabase configuration names:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These values are intended for browser delivery and must be limited to the project URL and Supabase anon/publishable key. Do not expose privileged credentials in a Vite variable, frontend source, or build output. In particular, never expose a Supabase service-role key, database password, private API key, admin credential, or tracking-token hash.

## Supabase

Canonical schema evolution is stored in [`../supabase/migrations/`](../supabase/migrations/). Review and apply production migrations forward-only. Do not edit historical migrations that have already been applied to production; use a reviewed corrective migration when a database change is required.

## Deployment Verification

Before an approved production deployment, verify:

- frontend lint and build
- approved permanent regression suite
- Supabase migration parity against the canonical migration directory
- route smoke tests
- manual end-to-end checks where appropriate, including customer and operational flows

## Rollback Principle

Roll back frontend delivery by selecting a known-good Vercel deployment. Do not blindly reverse production database migrations. Database corrections should normally be delivered as reviewed, forward-only migrations.

## Production Safety

Never place service-role keys, database passwords, private credentials, tracking-token hashes, or administrator credentials in source control, frontend configuration, logs, or documentation.
