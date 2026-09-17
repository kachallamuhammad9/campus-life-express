# CLX Regression Commands

Run the safe default regression set from `frontend/`:

```sh
npm run test:regression
```

The runner executes deterministic local/static, mocked, and disposable-PGlite permanent suites. It does not use production URLs, credentials, deployments, migration commands, browser automation, or a live Supabase project.

It intentionally excludes:

- local PostgreSQL/PostgREST integration suites, including the delivery, tracking, and manual-refund runtime tests;
- browser QA suites that require Playwright and a local or remote target;
- production/live diagnostics and one-off QA/smoke tools.

Run those categories only through separately reviewed workflows with explicitly isolated local infrastructure. The default regression command must remain production-safe.
