# CLX Backend - Campus Life Express API Server

**Flagship Product of Dandalin Sauki Ltd**

Campus Life Express (CLX) Backend is a Node.js + Express REST API server that powers the CLX campus commerce platform. This is **Phase 1: Backend Foundation & Database Connection**.

---

## Overview

This backend provides the core API infrastructure for the CLX platform, which operates across 5 main business domains:

- **Food** - Campus restaurants and vendors
- **Student Shopping** - Fashion, tech, books, stationery
- **Campus Services** - Printing, laundry, barbing, repairs, photography
- **Student Marketplace** - Peer-to-peer buying/selling of used items
- **Delivery & Errands** - Campus-wide delivery and courier services

---

## Phase 1 Scope: Backend Foundation

### What's Implemented ✅

- Express.js server with professional middleware stack
- PostgreSQL connection via Supabase with connection pooling
- Health check endpoint (`GET /api/v1/health`) for deployment verification
- Centralized error handling with consistent JSON response format
- CORS configuration for frontend integration
- Request logging with Morgan
- Security headers with Helmet
- Environment variable management with dotenv
- Graceful server shutdown handling

### What's NOT Implemented ❌

Phase 1 intentionally excludes:

- Database schema and migrations
- User authentication and JWT
- API endpoints (except health check)
- Data models or repositories
- Business logic for any domain
- Validation schemas
- Google Apps Script integration
- Payment processing
- Notifications system
- Admin features

These will be implemented in subsequent phases (2-19) after approval of Phase 1.

---

## Requirements

- **Node.js:** 18.0.0 or higher
- **PostgreSQL:** 13 or higher (via Supabase recommended)
- **npm** or **yarn** for package management

---

## Installation

### 1. Clone or Navigate to Backend Directory

```bash
cd clx-backend
```

### 2. Install Dependencies

```bash
npm install
```

This installs:
- `express` - Web framework
- `pg` - PostgreSQL client
- `cors` - Cross-Origin Resource Sharing
- `dotenv` - Environment variable management
- `helmet` - Security headers
- `morgan` - HTTP request logging
- `nodemon` - Development server (auto-restart on changes)

### 3. Create Environment Configuration

Copy the example configuration:

```bash
cp .env.example .env
```

### 4. Configure Database URL

Edit `.env` and set your Supabase PostgreSQL connection string:

```env
DATABASE_URL=postgresql://user:password@host:port/database
```

**Getting your Supabase DATABASE_URL:**

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to Settings → Database
4. Copy the "Connection string" (use Session mode for local development)
5. Add it to your `.env` file

**Note:** If you don't have DATABASE_URL configured, the server will start but database operations will fail. This is acceptable during initial development.

---

## Development

### Start Development Server

```bash
npm run dev
```

This starts the server with automatic reload on file changes (via nodemon).

Expected output:

```
═══════════════════════════════════════════════════════════════
  Campus Life Express (CLX) - Backend API Server
  Powered by Dandalin Sauki Ltd
═══════════════════════════════════════════════════════════════
  Status: RUNNING
  Environment: development
  Port: 3000
  URL: http://localhost:3000
  Health: http://localhost:3000/api/v1/health
  Frontend Origin: http://localhost:5173
───────────────────────────────────────────────────────────────
```

### Test Health Endpoint

Open your browser or use curl:

```bash
curl http://localhost:3000/api/v1/health
```

Expected response (when database is connected):

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-08-20T10:30:00.000Z",
    "environment": "development",
    "database": "connected"
  }
}
```

Status code: **200 OK**

If DATABASE_URL is not configured:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-08-20T10:30:00.000Z",
    "environment": "development",
    "database": "disconnected"
  }
}
```

Status code: **503 Service Unavailable** (server is running, but database unavailable)

---

## Production

### Start Production Server

```bash
npm start
```

This runs the server without auto-reload. Suitable for deployment to production environments (Heroku, Render, etc.).

---

## API Endpoints (Phase 1)

### Root Endpoint

```
GET /
```

Returns basic API information.

### Health Check

```
GET /api/v1/health
```

**Purpose:** Verify server and database connectivity

**Returns:**
- `200 OK` - Server and database are healthy
- `503 Service Unavailable` - Database connection failed

**Response Format:**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-08-20T10:30:00.000Z",
    "environment": "development",
    "database": "connected"
  }
}
```

---

## Error Response Format

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  },
  "timestamp": "2026-08-20T10:30:00.000Z"
}
```

Common HTTP Status Codes:

- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error
- `503` - Service Unavailable

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment (development/production) |
| `FRONTEND_URL` | No | `http://localhost:5173` | Frontend origin for CORS |
| `DATABASE_URL` | Yes (production) | None | Supabase PostgreSQL connection string |

---

## Directory Structure

```
clx-backend/
├── src/
│   ├── config/
│   │   ├── database.js      # PostgreSQL connection pool
│   │   └── env.js           # Environment configuration
│   │
│   ├── middleware/
│   │   ├── cors.js          # CORS configuration
│   │   ├── errorHandler.js  # Error handling middleware
│   │   └── (logger.js)      # Logging (via morgan)
│   │
│   ├── routes/
│   │   ├── health.js        # Health check endpoint
│   │   └── index.js         # Main route organizer
│   │
│   ├── app.js              # Express app configuration
│   └── index.js            # Server entry point
│
├── .env.example            # Environment template
├── .gitignore             # Git ignore rules
├── package.json           # Dependencies and scripts
├── package-lock.json      # Dependency lock file
└── README.md              # This file
```

---

## Logging

### Development

In development mode, all requests are logged to the console using Morgan's "dev" format:

```
GET /api/v1/health 200 2.345 ms - 156
```

### Production

In production mode, Morgan uses "combined" format which includes IP address, timestamp, and other HTTP details.

### Custom Logging

The error handler logs:
- Error message
- Stack trace (development only)
- Request path and method
- Timestamp

---

## Security

### Phase 1 Security Features

✅ **Helmet** - Sets security HTTP headers
✅ **CORS** - Restricted to configured frontend origin
✅ **Request Size Limits** - 10MB limit on JSON and URL-encoded bodies
✅ **Graceful Error Handling** - No stack traces exposed in production

The request ID currently uses `Math.random()` for tracking. Replacing it with a
cryptographically secure identifier is reserved for future security hardening.

### Future Security (Phase 17+)

- Input validation
- Authentication (JWT)
- Authorization (RBAC)
- Rate limiting per endpoint
- API key management
- Audit logging
- Request signing
- Payment security

---

## Deployment

### Supabase Setup for Production

1. Create a Supabase project at https://app.supabase.com
2. Get your PostgreSQL connection string (Session mode)
3. Set `DATABASE_URL` in production environment
4. Set `NODE_ENV=production`

### Deployment Platforms

This backend is ready for deployment to:

- **Render** (recommended for beginners)
- **Heroku**
- **Railway**
- **AWS Lambda** (with serverless adapter)
- **Google Cloud Run**
- **DigitalOcean App Platform**

**General deployment steps:**

1. Push code to Git repository (with .env excluded)
2. Set environment variables in deployment platform
3. Install dependencies: `npm install`
4. Run: `npm start`
5. Verify health endpoint: `GET /api/v1/health`

---

## Development Workflow

### Adding a New Endpoint (Future Phases)

1. Create route file in `src/routes/`
2. Define endpoint handler
3. Test with curl or Postman
4. Update documentation
5. Commit to Git

### Making Database Queries (Future Phases)

```javascript
const database = require('../config/database');

const result = await database.query(
  'SELECT * FROM users WHERE id = $1',
  [userId]
);
```

---

## Troubleshooting

### Server won't start

**Problem:** `Error: listen EADDRINUSE: address already in use :::3000`

**Solution:** Another process is using port 3000. Either:
- Kill the process: `lsof -ti:3000 | xargs kill -9`
- Or change PORT: `PORT=3001 npm run dev`

### Database connection fails

**Problem:** `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution:**
- Check DATABASE_URL is set correctly in .env
- Verify Supabase database is running
- Check network connectivity
- Ensure IP is whitelisted in Supabase

### Frontend can't reach backend

**Problem:** CORS errors in browser console

**Solution:**
- Ensure FRONTEND_URL matches your actual frontend URL
- For local dev: `FRONTEND_URL=http://localhost:5173`
- For production: `FRONTEND_URL=https://yourdomain.com`
- Restart server after changing .env

### Port already in use

**Problem:** `Error: listen EADDRINUSE`

**Solution:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

---

## Testing

### Manual Testing (Phase 1)

Test the health endpoint:

```bash
# Test server is running
curl http://localhost:3000/

# Test database connectivity
curl http://localhost:3000/api/v1/health

# Test CORS
curl -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  http://localhost:3000/api/v1/health
```

### Automated Testing

Automated tests are not implemented yet. The `npm test` placeholder remains for
the later testing phase.

---

## Next Steps After Phase 1

The following phases (2-19) will add:

- **Phase 2:** Database schema and migrations
- **Phase 3:** Campuses & Categories API
- **Phase 4:** Vendors API
- **Phase 5:** Products API
- **Phase 6:** Services & Service Requests API
- **Phase 7:** Marketplace API
- **Phase 8:** Authentication & Authorization
- **Phase 9:** Shopping Cart API
- **Phase 10:** Orders API
- **Phase 11:** Delivery API
- **Phase 12:** Payments API
- **Phase 13:** Google Apps Script Integration
- **Phase 14:** Notifications
- **Phase 15:** Admin Features
- **Phase 16:** Frontend Integration Testing
- **Phase 17:** Security Hardening
- **Phase 18:** Automated Testing
- **Phase 19:** Production Deployment

Each phase will be implemented after approval of the previous phase.

---

## Support

For issues or questions:

1. Check the [Architecture Analysis](../ARCHITECTURE_ANALYSIS.md) document
2. Review error messages in server logs
3. Verify .env configuration
4. Ensure Node.js version is 18+

---

## License

ISC License - Dandalin Sauki Ltd

---

## Changelog

### Version 1.0.0 (Phase 1 - 2026-08-20)

- ✅ Express.js server foundation
- ✅ PostgreSQL connection via Supabase
- ✅ Health check endpoint
- ✅ Error handling middleware
- ✅ CORS configuration
- ✅ Request logging
- ✅ Security headers (Helmet)
- ✅ Environment management
- ✅ Graceful shutdown

---

**End of Phase 1 Backend README**

This backend is ready for database schema creation (Phase 2) after approval.
