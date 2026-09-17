# Campus Life Express (CLX)

## Overview

Campus Life Express (CLX) is the flagship campus commerce and services platform of Dandalin Sauki LTD. The current pilot serves the University of Maiduguri (UNIMAID).

## Core Platform Areas

- Food
- Student Shopping
- Campus Services
- Student Marketplace
- Delivery

## Current Production Architecture

CLX is a Vite-built, static multi-page web frontend hosted on Vercel. Browser code uses Supabase for the current production backend services:

- Supabase Auth for customer and administrator sessions
- PostgreSQL for platform, order, payment, fulfilment, and operational data
- Row Level Security (RLS) for data access boundaries
- protected RPCs for customer-safe and operational mutations
- WhatsApp Business handoff for customer and operations communication

The browser uses only public Supabase frontend configuration. Privileged credentials and database access stay outside browser code.

## Important Directories

- `frontend/` — Vite application, pages, build configuration, and frontend package scripts.
- `frontend/js/` — client modules for Supabase, authentication, catalogue, cart, checkout, orders, and operations.
- `frontend/css/` — frontend stylesheets.
- `supabase/migrations/` — canonical, forward-only database schema and RPC evolution.
- `docs/` — pilot, operations, release, and current-architecture documentation.
- `clx-backend/` — legacy Express/backend material retained for history and reference; it is not the current production request path.

## Local Development

Run this existing package script from `frontend/`:

```sh
npm run dev
```

The development server script uses Vite on port 5173.

## Validation

Run the existing validation scripts from `frontend/`:

```sh
npm run lint
npm run build
npm run test:regression
```

`npm run test:regression` runs the approved safe local regression set. Browser, production/live, and local database integration suites are intentionally separate.

## Production

Production URL: [https://clx.dandalinsauki.com](https://clx.dandalinsauki.com)
