# CLX Backend Architecture Analysis & Development Roadmap
## Campus Life Express (CLX) 2.0 - Backend Requirements Document

**Date:** 2026-08-20  
**Project:** Campus Life Express (CLX) 2.0  
**Developer:** Dandalin Sauki Ltd  
**Scope:** Production-ready backend for campus commerce platform  

---

## A. CURRENT ARCHITECTURE

### Frontend State
The CLX frontend is **complete and polished**. It includes:
- **18 HTML pages** across 5 major business domains
- **Responsive design** with modern CSS and client-side interactivity
- **Mock data system** (js/data.js) containing comprehensive product/vendor/service data
- **Frontend API layer** (js/api.js) that simulates backend endpoints using `/api/v1/*` structure
- **LocalStorage persistence** for user state (cart, selected campus, orders, marketplace listings)
- **Modular application logic** (js/app.js) handling campus selection, cart management, search

### Current Data Flow
```
Frontend HTML/CSS/JavaScript
    ↓
js/app.js (application logic)
    ↓
js/api.js (API simulation layer)
    ↓
js/data.js (static/mock data) + localStorage (client state)
```

### Frontend Technologies
- **Build Tool:** Vite 6.2.3
- **Language:** TypeScript 5.8.2
- **CSS:** Custom CSS with CSS variables
- **JavaScript Module System:** ES Modules
- **Styling Libraries:** Font Awesome, Google Fonts
- **Frontend Packages:** None (no React/Vue/Angular)

### Frontend Features (Complete)
✅ Campus selection and switching  
✅ Multi-category browsing (Food, Shopping, Services, Marketplace, Delivery)  
✅ Product listing with filters (category, subcategory, campus, search, sort)  
✅ Service browsing and request interface  
✅ Student marketplace listing and creation  
✅ Single-vendor cart with delivery fee calculation  
✅ Order checkout and delivery tracking interface  
✅ Global search across all categories  
✅ Vendor profiles and business listings  
✅ Campus delivery zones definition  
✅ Mobile-responsive navigation  
✅ Account/profile page placeholder  

### LocalStorage Keys (Current Implementation)
```javascript
clx_selected_campus          // Selected campus ID
clx_cart_items              // Cart items (single vendor constraint)
clx_user_orders             // User's orders, service requests, deliveries
clx_user_marketplace_listings  // User-created marketplace listings
clx_user_service_requests   // User's service requests
```

---

## B. BACKEND GAP ANALYSIS

### What Currently Exists (Frontend)
| Component | Current State | Technology |
|-----------|---------------|-----------|
| UI/UX | Complete | HTML, CSS, JavaScript |
| Data Models | Defined | Static JS objects |
| API Contract | Designed | `/api/v1/*` endpoints sketched |
| User Forms | Implemented | HTML form elements |
| State Persistence | Partial | localStorage only |
| Search | Functional | Client-side filtering |
| Cart | Functional | Client-side logic |
| Campus Selection | Functional | Client-side logic |

### What Must Be Built (Backend)
| Component | Requirement | Priority |
|-----------|-------------|----------|
| HTTP Server | Express.js or Node.js | CRITICAL |
| Database | PostgreSQL + Supabase | CRITICAL |
| API Endpoints | Comprehensive REST API | CRITICAL |
| Authentication | JWT-based auth system | HIGH |
| Authorization | Role-based access control | HIGH |
| Data Validation | Input validation middleware | HIGH |
| Error Handling | Centralized error responses | HIGH |
| Logging | Development + audit logging | MEDIUM |
| Payment Integration | Placeholder initially | MEDIUM |
| External Services | Google Apps Script, etc. | LOW (Phase 13+) |

### Production Requirements NOT Currently Met
❌ **Persistent Database** - All data currently in memory or localStorage  
❌ **User Authentication** - No login/registration system  
❌ **Authorization** - No role-based access control  
❌ **Real Transactions** - No actual order processing  
❌ **Payment Processing** - No payment integration  
❌ **Data Validation** - No backend input validation  
❌ **Error Handling** - No centralized error management  
❌ **Audit Trail** - No event logging for compliance  
❌ **Scalability** - Frontend currently self-contained  
❌ **Security** - No HTTPS, no rate limiting, no CORS control  

---

## C. REQUIRED API ENDPOINTS

### API Design Standards
- **Base Path:** `/api/v1`
- **Content-Type:** `application/json`
- **Authentication:** JWT Bearer token (to be added in Phase 8)
- **Error Response Format:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Success Response Format
```json
{
  "success": true,
  "data": {},
  "meta": {
    "timestamp": "2026-08-20T10:30:00Z",
    "requestId": "req-xxx"
  }
}
```

### Authentication Endpoints

#### POST /api/v1/auth/register
**Purpose:** Register new student user  
**Request:**
```json
{
  "email": "student@unimaid.edu.ng",
  "password": "SecurePass123!",
  "fullName": "Amina Sani",
  "campusId": "unimaid",
  "phoneNumber": "08012345678",
  "studentId": "UNIMAID/2024/001234"
}
```
**Response:** User object + JWT token  
**Status Codes:** 201 Created, 400 Bad Request, 409 Conflict (email exists)

#### POST /api/v1/auth/login
**Purpose:** Authenticate user  
**Request:**
```json
{
  "email": "student@unimaid.edu.ng",
  "password": "SecurePass123!"
}
```
**Response:** User object + JWT token  
**Status Codes:** 200 OK, 401 Unauthorized, 404 Not Found

#### POST /api/v1/auth/logout
**Purpose:** Invalidate user session  
**Status Codes:** 200 OK, 401 Unauthorized

#### GET /api/v1/auth/me
**Purpose:** Get current authenticated user  
**Status Codes:** 200 OK, 401 Unauthorized

#### POST /api/v1/auth/refresh-token
**Purpose:** Refresh JWT token  
**Status Codes:** 200 OK, 401 Unauthorized

### Campus Endpoints

#### GET /api/v1/campuses
**Purpose:** List all active campuses  
**Query Parameters:** None  
**Response:** Array of campus objects  
**Status Codes:** 200 OK, 401 Unauthorized

#### GET /api/v1/campuses/:campusId
**Purpose:** Get specific campus details  
**Response:** Campus object with delivery zones  
**Status Codes:** 200 OK, 404 Not Found, 401 Unauthorized

#### GET /api/v1/campuses/:campusId/delivery-zones
**Purpose:** Get delivery zones for campus  
**Response:** Array of zone objects  
**Status Codes:** 200 OK, 404 Not Found

### Category Endpoints

#### GET /api/v1/categories
**Purpose:** List all product categories  
**Query Parameters:** None  
**Response:** Array of category objects with subcategories  
**Status Codes:** 200 OK

#### GET /api/v1/categories/:categoryId
**Purpose:** Get category details  
**Response:** Category object  
**Status Codes:** 200 OK, 404 Not Found

### Vendor Endpoints

#### GET /api/v1/vendors
**Purpose:** List vendors with filtering  
**Query Parameters:**
- `campusId` (string)
- `categoryId` (string)
- `search` (string)
- `limit` (number, default 20)
- `offset` (number, default 0)

**Response:** Array of vendor objects + total count  
**Status Codes:** 200 OK, 400 Bad Request

#### GET /api/v1/vendors/:vendorId
**Purpose:** Get vendor details  
**Response:** Vendor object with rating, reviews, hours  
**Status Codes:** 200 OK, 404 Not Found

#### GET /api/v1/vendors/:vendorId/products
**Purpose:** Get products for a specific vendor  
**Query Parameters:** `limit`, `offset`  
**Response:** Array of product objects  
**Status Codes:** 200 OK, 404 Not Found

#### GET /api/v1/vendors/:vendorId/reviews
**Purpose:** Get vendor reviews and ratings  
**Response:** Array of review objects  
**Status Codes:** 200 OK, 404 Not Found

#### POST /api/v1/vendors
**Purpose:** Register as vendor (Phase 15+)  
**Requires:** Admin or Super Admin role  
**Status Codes:** 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden

### Product Endpoints

#### GET /api/v1/products
**Purpose:** List products with advanced filtering  
**Query Parameters:**
- `categoryId` (string)
- `subcategoryId` (string)
- `vendorId` (string)
- `campusId` (string)
- `search` (string)
- `minPrice` (number)
- `maxPrice` (number)
- `sortBy` (string: price-asc, price-desc, rating, popularity)
- `limit` (number, default 20)
- `offset` (number, default 0)
- `inStock` (boolean)

**Response:** Array of product objects + total count  
**Status Codes:** 200 OK, 400 Bad Request

#### GET /api/v1/products/:productId
**Purpose:** Get product details  
**Response:** Product object with vendor details, reviews  
**Status Codes:** 200 OK, 404 Not Found

#### GET /api/v1/products/:productId/reviews
**Purpose:** Get product reviews  
**Response:** Array of review objects  
**Status Codes:** 200 OK, 404 Not Found

#### POST /api/v1/products/:productId/review
**Purpose:** Submit product review (authenticated)  
**Request:**
```json
{
  "rating": 5,
  "comment": "Great quality food"
}
```
**Status Codes:** 201 Created, 400 Bad Request, 401 Unauthorized

### Service Endpoints

#### GET /api/v1/services
**Purpose:** List campus services with filtering  
**Query Parameters:**
- `categoryId` (string, "services")
- `subcategoryId` (string)
- `campusId` (string)
- `search` (string)
- `limit` (number)
- `offset` (number)

**Response:** Array of service objects  
**Status Codes:** 200 OK, 400 Bad Request

#### GET /api/v1/services/:serviceId
**Purpose:** Get service details  
**Response:** Service object with provider info, pricing  
**Status Codes:** 200 OK, 404 Not Found

#### POST /api/v1/service-requests
**Purpose:** Submit service request (authenticated)  
**Requires:** Authentication  
**Request:**
```json
{
  "serviceId": "s-project-printing",
  "providerId": "v-quickprint-press",
  "campusId": "unimaid",
  "deliveryType": "pickup",
  "description": "3 copies of final year project",
  "fileUrl": "https://storage.../document.pdf",
  "estimatedBudget": 4500,
  "preferredDate": "2026-08-22",
  "preferredTime": "3:00 PM"
}
```
**Response:** Service request object  
**Status Codes:** 201 Created, 400 Bad Request, 401 Unauthorized

#### GET /api/v1/service-requests
**Purpose:** List user's service requests (authenticated)  
**Query Parameters:** `status`, `limit`, `offset`  
**Response:** Array of service request objects  
**Status Codes:** 200 OK, 401 Unauthorized

#### GET /api/v1/service-requests/:requestId
**Purpose:** Get service request details (authenticated)  
**Response:** Service request object with full details  
**Status Codes:** 200 OK, 404 Not Found, 401 Unauthorized

#### PATCH /api/v1/service-requests/:requestId
**Purpose:** Update service request (authenticated, user or provider)  
**Request:**
```json
{
  "status": "in_progress",
  "notes": "Started processing"
}
```
**Status Codes:** 200 OK, 400 Bad Request, 401 Unauthorized, 403 Forbidden

### Marketplace Endpoints

#### GET /api/v1/marketplace
**Purpose:** List marketplace items with filtering  
**Query Parameters:**
- `categoryId` (string, "marketplace")
- `subcategoryId` (string)
- `condition` (string: new, like-new, good, fair)
- `campusId` (string)
- `search` (string)
- `minPrice` (number)
- `maxPrice` (number)
- `limit` (number)
- `offset` (number)

**Response:** Array of listing objects  
**Status Codes:** 200 OK, 400 Bad Request

#### GET /api/v1/marketplace/:listingId
**Purpose:** Get marketplace listing details  
**Response:** Listing object with seller contact info, images  
**Status Codes:** 200 OK, 404 Not Found

#### POST /api/v1/marketplace
**Purpose:** Create new marketplace listing (authenticated)  
**Requires:** Authentication  
**Request:**
```json
{
  "title": "Used Anatomy Textbook",
  "subcategoryId": "Used Textbooks",
  "price": 6500,
  "originalPrice": 18000,
  "condition": "good",
  "description": "Minimal notes, perfect for prep",
  "image": "https://storage.../image.jpg",
  "campusId": "unimaid"
}
```
**Response:** Listing object with status "pending_review"  
**Status Codes:** 201 Created, 400 Bad Request, 401 Unauthorized

#### PATCH /api/v1/marketplace/:listingId
**Purpose:** Update listing (authenticated, owner only)  
**Request:** Partial listing data  
**Status Codes:** 200 OK, 400 Bad Request, 401 Unauthorized, 403 Forbidden

#### DELETE /api/v1/marketplace/:listingId
**Purpose:** Delete listing (authenticated, owner only)  
**Status Codes:** 204 No Content, 401 Unauthorized, 403 Forbidden, 404 Not Found

#### GET /api/v1/marketplace/:listingId/contact
**Purpose:** Get seller contact info (authenticated)  
**Response:** Contact object (phone, email)  
**Status Codes:** 200 OK, 401 Unauthorized, 404 Not Found

### Cart Endpoints

#### GET /api/v1/cart
**Purpose:** Get user's current cart (authenticated)  
**Response:** Cart object with items array  
**Status Codes:** 200 OK, 401 Unauthorized

#### POST /api/v1/cart/items
**Purpose:** Add item to cart (authenticated)  
**Constraint:** Single vendor per cart  
**Request:**
```json
{
  "productId": "p-jollof-chicken",
  "quantity": 2,
  "vendorId": "v-safari-delight"
}
```
**Response:** Updated cart object  
**Status Codes:** 201 Created, 400 Bad Request, 401 Unauthorized, 409 Conflict (vendor change)

#### PATCH /api/v1/cart/items/:itemId
**Purpose:** Update cart item quantity (authenticated)  
**Request:**
```json
{
  "quantity": 3
}
```
**Response:** Updated cart object  
**Status Codes:** 200 OK, 400 Bad Request, 401 Unauthorized, 404 Not Found

#### DELETE /api/v1/cart/items/:itemId
**Purpose:** Remove item from cart (authenticated)  
**Status Codes:** 204 No Content, 401 Unauthorized, 404 Not Found

#### DELETE /api/v1/cart
**Purpose:** Clear entire cart (authenticated)  
**Status Codes:** 204 No Content, 401 Unauthorized

#### GET /api/v1/cart/summary
**Purpose:** Get cart totals (authenticated)  
**Response:**
```json
{
  "subtotal": 5000,
  "deliveryFee": 400,
  "serviceFee": 100,
  "total": 5500,
  "itemCount": 2,
  "vendorId": "v-safari-delight"
}
```
**Status Codes:** 200 OK, 401 Unauthorized

### Order Endpoints

#### POST /api/v1/orders
**Purpose:** Create order from cart (authenticated)  
**Requires:** Authentication, items in cart  
**Request:**
```json
{
  "deliveryAddress": "Hostel C, Room 18",
  "phoneNumber": "08012345678",
  "paymentMethod": "cash_on_delivery",
  "notes": "Please ring bell loudly"
}
```
**Response:** Order object with unique ID, status "pending"  
**Status Codes:** 201 Created, 400 Bad Request, 401 Unauthorized

#### GET /api/v1/orders
**Purpose:** List user's orders (authenticated)  
**Query Parameters:** `status`, `type`, `limit`, `offset`  
**Response:** Array of order objects  
**Status Codes:** 200 OK, 401 Unauthorized

#### GET /api/v1/orders/:orderId
**Purpose:** Get order details (authenticated, owner only)  
**Response:** Order object with full details, items, tracking  
**Status Codes:** 200 OK, 404 Not Found, 401 Unauthorized, 403 Forbidden

#### PATCH /api/v1/orders/:orderId
**Purpose:** Update order (authenticated, admin or owner)  
**Request:**
```json
{
  "status": "confirmed",
  "deliveryFee": 400,
  "notes": "Updated delivery instructions"
}
```
**Status Codes:** 200 OK, 400 Bad Request, 401 Unauthorized, 403 Forbidden

#### DELETE /api/v1/orders/:orderId
**Purpose:** Cancel order (authenticated, owner, must be pending)  
**Status Codes:** 204 No Content, 401 Unauthorized, 403 Forbidden, 400 Bad Request

#### POST /api/v1/orders/:orderId/track
**Purpose:** Get real-time tracking (authenticated)  
**Response:** Tracking object with current status, location, ETA  
**Status Codes:** 200 OK, 404 Not Found, 401 Unauthorized

#### POST /api/v1/orders/:orderId/review
**Purpose:** Leave order review (authenticated)  
**Request:**
```json
{
  "rating": 5,
  "comment": "Excellent service"
}
```
**Status Codes:** 201 Created, 400 Bad Request, 401 Unauthorized

### Delivery Endpoints

#### POST /api/v1/deliveries
**Purpose:** Request campus delivery/errand (authenticated)  
**Requires:** Authentication  
**Request:**
```json
{
  "taskType": "delivery",
  "pickupLocation": "Senate Building",
  "dropoffLocation": "Law Faculty",
  "description": "Deliver documents",
  "estimatedFee": 500,
  "campusId": "unimaid",
  "preferredTime": "3:00 PM"
}
```
**Response:** Delivery request object  
**Status Codes:** 201 Created, 400 Bad Request, 401 Unauthorized

#### GET /api/v1/deliveries
**Purpose:** List user's delivery requests (authenticated)  
**Response:** Array of delivery request objects  
**Status Codes:** 200 OK, 401 Unauthorized

#### GET /api/v1/deliveries/:deliveryId
**Purpose:** Get delivery details (authenticated)  
**Response:** Delivery object with tracking  
**Status Codes:** 200 OK, 404 Not Found, 401 Unauthorized

#### PATCH /api/v1/deliveries/:deliveryId
**Purpose:** Update delivery (authenticated, admin or requester)  
**Status Codes:** 200 OK, 400 Bad Request, 401 Unauthorized, 403 Forbidden

### Search Endpoints

#### GET /api/v1/search
**Purpose:** Global search across all categories  
**Query Parameters:**
- `q` (string, required) - search query
- `campusId` (string)
- `type` (string: products, services, vendors, marketplace, all)
- `limit` (number, default 10)

**Response:**
```json
{
  "products": [...],
  "services": [...],
  "vendors": [...],
  "marketplace": [...],
  "totalResults": 42
}
```
**Status Codes:** 200 OK, 400 Bad Request

#### GET /api/v1/search/suggestions
**Purpose:** Autocomplete search suggestions  
**Query Parameters:** `q`, `type`, `limit`  
**Response:** Array of suggestion objects  
**Status Codes:** 200 OK, 400 Bad Request

### Health & Status Endpoints

#### GET /api/v1/health
**Purpose:** Health check endpoint  
**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-08-20T10:30:00Z",
  "database": "connected",
  "version": "1.0.0"
}
```
**Status Codes:** 200 OK, 503 Service Unavailable

#### GET /api/v1/status
**Purpose:** Detailed system status (admin only)  
**Response:** System metrics, cache status, queue status  
**Status Codes:** 200 OK, 401 Unauthorized, 403 Forbidden

### Webhook Endpoints (Future)

#### POST /api/v1/webhooks/payment-callback
**Purpose:** Payment provider callback (Phase 12)  
**Status Codes:** 200 OK, 400 Bad Request

#### POST /api/v1/webhooks/sms-callback
**Purpose:** SMS provider callback  
**Status Codes:** 200 OK, 400 Bad Request

### Admin Endpoints (Phase 15+)

#### GET /api/v1/admin/users
**Purpose:** List all users (admin only)  
**Status Codes:** 200 OK, 401 Unauthorized, 403 Forbidden

#### GET /api/v1/admin/marketplace-listings
**Purpose:** List pending marketplace listings for moderation (admin only)  
**Status Codes:** 200 OK, 401 Unauthorized, 403 Forbidden

#### PATCH /api/v1/admin/marketplace-listings/:listingId/approve
**Purpose:** Approve marketplace listing (admin only)  
**Status Codes:** 200 OK, 401 Unauthorized, 403 Forbidden

#### PATCH /api/v1/admin/marketplace-listings/:listingId/reject
**Purpose:** Reject marketplace listing with reason (admin only)  
**Status Codes:** 200 OK, 401 Unauthorized, 403 Forbidden

---

## D. DATABASE DESIGN

### Database Technology
- **Engine:** PostgreSQL 13+
- **Hosting:** Supabase (managed PostgreSQL)
- **ORM/Query Builder:** None initially (raw SQL or minimal library)
- **Migrations:** Manual SQL scripts initially

### Entity-Relationship Diagram
```
USERS (1) ←──────→ (M) ADDRESSES
  │
  ├─→ (M) ORDERS
  │
  ├─→ (M) CART_ITEMS
  │
  ├─→ (M) MARKETPLACE_LISTINGS
  │
  ├─→ (M) SERVICE_REQUESTS
  │
  ├─→ (M) DELIVERY_REQUESTS
  │
  ├─→ (M) REVIEWS

VENDORS (1) ←──────→ (M) PRODUCTS
  │
  ├─→ (M) SERVICES
  │
  ├─→ (M) OPERATING_HOURS
  │
  ├─→ (M) REVIEWS

PRODUCTS (1) ←──────→ (M) ORDER_ITEMS
PRODUCTS (1) ←──────→ (M) REVIEWS

SERVICES (1) ←──────→ (M) SERVICE_REQUESTS

CAMPUSES (1) ←──────→ (M) DELIVERY_ZONES
CAMPUSES (1) ←──────→ (M) VENDORS
CAMPUSES (1) ←──────→ (M) PRODUCTS
CAMPUSES (1) ←──────→ (M) SERVICES

CATEGORIES (1) ←──────→ (M) VENDORS
CATEGORIES (1) ←──────→ (M) PRODUCTS
CATEGORIES (1) ←──────→ (M) SERVICES
```

### Core Tables

#### users
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20),
  profile_picture_url VARCHAR(500),
  bio TEXT,
  role VARCHAR(50) NOT NULL DEFAULT 'CUSTOMER', -- CUSTOMER, VENDOR, RIDER, ADMIN, SUPER_ADMIN
  campus_id VARCHAR(100) REFERENCES campuses(id),
  student_id VARCHAR(50) UNIQUE, -- for student users
  vendor_id INTEGER REFERENCES vendors(id), -- for vendor users
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,
  deleted_at TIMESTAMP
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_campus_id ON users(campus_id);
CREATE INDEX idx_users_role ON users(role);
```

#### campuses
```sql
CREATE TABLE campuses (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  short_name VARCHAR(50) NOT NULL UNIQUE,
  location VARCHAR(500),
  description TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### delivery_zones
```sql
CREATE TABLE delivery_zones (
  id SERIAL PRIMARY KEY,
  campus_id VARCHAR(50) NOT NULL REFERENCES campuses(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  base_delivery_fee DECIMAL(10, 2) DEFAULT 400,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(campus_id, name)
);
```

#### categories
```sql
CREATE TABLE categories (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  slug VARCHAR(255) NOT NULL UNIQUE,
  icon VARCHAR(100),
  badge VARCHAR(255),
  description TEXT,
  image_url VARCHAR(500),
  path VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### vendors
```sql
CREATE TABLE vendors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category_id VARCHAR(100) NOT NULL REFERENCES categories(id),
  campus_id VARCHAR(50) NOT NULL REFERENCES campuses(id),
  location VARCHAR(500) NOT NULL,
  phone_number VARCHAR(20),
  email VARCHAR(255),
  description TEXT,
  image_url VARCHAR(500),
  owner_user_id INTEGER REFERENCES users(id),
  opening_time TIME,
  closing_time TIME,
  rating DECIMAL(3, 1) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(name, campus_id, category_id)
);
CREATE INDEX idx_vendors_campus_id ON vendors(campus_id);
CREATE INDEX idx_vendors_category_id ON vendors(category_id);
CREATE INDEX idx_vendors_is_active ON vendors(is_active);
```

#### products
```sql
CREATE TABLE products (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category_id VARCHAR(100) NOT NULL REFERENCES categories(id),
  subcategory VARCHAR(100),
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  price DECIMAL(12, 2) NOT NULL,
  original_price DECIMAL(12, 2),
  description TEXT,
  image_url VARCHAR(500),
  campus_id VARCHAR(50) NOT NULL REFERENCES campuses(id),
  rating DECIMAL(3, 1) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  is_popular BOOLEAN DEFAULT false,
  is_in_stock BOOLEAN DEFAULT true,
  stock_quantity INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(vendor_id, name, campus_id)
);
CREATE INDEX idx_products_vendor_id ON products(vendor_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_campus_id ON products(campus_id);
CREATE INDEX idx_products_is_in_stock ON products(is_in_stock);
```

#### services
```sql
CREATE TABLE services (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category_id VARCHAR(100) DEFAULT 'services' REFERENCES categories(id),
  subcategory VARCHAR(100),
  provider_id INTEGER NOT NULL REFERENCES vendors(id),
  campus_id VARCHAR(50) NOT NULL REFERENCES campuses(id),
  starting_price DECIMAL(12, 2),
  price_type VARCHAR(50), -- 'fixed', 'starting_from', 'quote'
  description TEXT,
  image_url VARCHAR(500),
  turnaround_time VARCHAR(100),
  rating DECIMAL(3, 1) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  requires_file_upload BOOLEAN DEFAULT false,
  requires_appointment BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_services_provider_id ON services(provider_id);
CREATE INDEX idx_services_campus_id ON services(campus_id);
```

#### service_requests
```sql
CREATE TABLE service_requests (
  id VARCHAR(100) PRIMARY KEY,
  service_id VARCHAR(100) NOT NULL REFERENCES services(id),
  provider_id INTEGER NOT NULL REFERENCES vendors(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  campus_id VARCHAR(50) NOT NULL REFERENCES campuses(id),
  description TEXT,
  estimated_budget DECIMAL(12, 2),
  delivery_type VARCHAR(50), -- 'pickup', 'delivery', 'in-person'
  file_url VARCHAR(500),
  preferred_date DATE,
  preferred_time TIME,
  status VARCHAR(50) DEFAULT 'submitted', -- submitted, accepted, in_progress, completed, cancelled
  status_step INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
CREATE INDEX idx_service_requests_user_id ON service_requests(user_id);
CREATE INDEX idx_service_requests_provider_id ON service_requests(provider_id);
CREATE INDEX idx_service_requests_status ON service_requests(status);
```

#### marketplace_listings
```sql
CREATE TABLE marketplace_listings (
  id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category_id VARCHAR(100) DEFAULT 'marketplace' REFERENCES categories(id),
  subcategory VARCHAR(100),
  seller_user_id INTEGER NOT NULL REFERENCES users(id),
  campus_id VARCHAR(50) NOT NULL REFERENCES campuses(id),
  price DECIMAL(12, 2) NOT NULL,
  original_price DECIMAL(12, 2),
  condition VARCHAR(50), -- 'new', 'like_new', 'good', 'fair'
  description TEXT,
  image_url VARCHAR(500),
  status VARCHAR(50) DEFAULT 'pending_review', -- pending_review, published, sold, removed
  is_moderated BOOLEAN DEFAULT false,
  moderated_by INTEGER REFERENCES users(id),
  rejection_reason TEXT,
  date_listed TIMESTAMP DEFAULT NOW(),
  date_sold TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);
CREATE INDEX idx_marketplace_listings_seller_user_id ON marketplace_listings(seller_user_id);
CREATE INDEX idx_marketplace_listings_campus_id ON marketplace_listings(campus_id);
CREATE INDEX idx_marketplace_listings_status ON marketplace_listings(status);
```

#### cart
```sql
CREATE TABLE cart (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cart_user_id ON cart(user_id);
```

#### cart_items
```sql
CREATE TABLE cart_items (
  id SERIAL PRIMARY KEY,
  cart_id INTEGER NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  product_id VARCHAR(100) NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  price DECIMAL(12, 2) NOT NULL,
  added_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(cart_id, product_id)
);
CREATE INDEX idx_cart_items_cart_id ON cart_items(cart_id);
```

#### orders
```sql
CREATE TABLE orders (
  id VARCHAR(100) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  campus_id VARCHAR(50) NOT NULL REFERENCES campuses(id),
  type VARCHAR(50) DEFAULT 'food', -- food, shopping, etc.
  delivery_address VARCHAR(500) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  delivery_zone_id INTEGER REFERENCES delivery_zones(id),
  subtotal DECIMAL(12, 2) NOT NULL,
  delivery_fee DECIMAL(12, 2) DEFAULT 400,
  service_fee DECIMAL(12, 2) DEFAULT 100,
  total DECIMAL(12, 2) NOT NULL,
  payment_method VARCHAR(50), -- cash_on_delivery, card, transfer
  payment_status VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed, refunded
  order_status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, preparing, ready, in_transit, delivered, cancelled
  status_step INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  delivered_at TIMESTAMP,
  cancelled_at TIMESTAMP
);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_vendor_id ON orders(vendor_id);
CREATE INDEX idx_orders_campus_id ON orders(campus_id);
CREATE INDEX idx_orders_order_status ON orders(order_status);
```

#### order_items
```sql
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(100) NOT NULL REFERENCES orders(id),
  product_id VARCHAR(100) NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  total_price DECIMAL(12, 2) NOT NULL,
  added_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
```

#### deliveries
```sql
CREATE TABLE deliveries (
  id VARCHAR(100) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  rider_user_id INTEGER REFERENCES users(id),
  campus_id VARCHAR(50) NOT NULL REFERENCES campuses(id),
  task_type VARCHAR(50), -- delivery, errand
  pickup_location VARCHAR(500) NOT NULL,
  dropoff_location VARCHAR(500) NOT NULL,
  description TEXT,
  estimated_fee DECIMAL(12, 2),
  actual_fee DECIMAL(12, 2),
  status VARCHAR(50) DEFAULT 'requested', -- requested, accepted, picked_up, in_transit, delivered, cancelled
  status_step INTEGER DEFAULT 1,
  preferred_time VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  picked_up_at TIMESTAMP,
  delivered_at TIMESTAMP
);
CREATE INDEX idx_deliveries_user_id ON deliveries(user_id);
CREATE INDEX idx_deliveries_rider_user_id ON deliveries(rider_user_id);
CREATE INDEX idx_deliveries_campus_id ON deliveries(campus_id);
```

#### reviews
```sql
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  reviewer_user_id INTEGER NOT NULL REFERENCES users(id),
  reviewable_type VARCHAR(50), -- product, vendor, order
  reviewable_id VARCHAR(100) NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(reviewer_user_id, reviewable_type, reviewable_id)
);
CREATE INDEX idx_reviews_reviewable ON reviews(reviewable_type, reviewable_id);
CREATE INDEX idx_reviews_reviewer_user_id ON reviews(reviewer_user_id);
```

#### audit_logs
```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(100),
  changes JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

#### notifications
```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title VARCHAR(255),
  message TEXT NOT NULL,
  type VARCHAR(50), -- order_update, service_update, delivery_update, etc.
  related_type VARCHAR(100),
  related_id VARCHAR(100),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
```

#### addresses
```sql
CREATE TABLE addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  label VARCHAR(100), -- home, hostel, office, etc.
  full_address VARCHAR(500) NOT NULL,
  zone_id INTEGER REFERENCES delivery_zones(id),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_addresses_user_id ON addresses(user_id);
```

---

## E. AUTHENTICATION DESIGN

### Authentication Architecture

#### User Roles
1. **CUSTOMER** - Regular student user
   - Can browse and purchase products
   - Can post marketplace listings
   - Can request services
   - Can request deliveries
   - Can leave reviews

2. **VENDOR** - Business/service provider
   - Can manage products/services
   - Can view orders assigned to them
   - Can update order status
   - Can manage service requests
   - Can view analytics

3. **RIDER** - Delivery person
   - Can view assigned delivery requests
   - Can update delivery status
   - Can access GPS tracking

4. **ADMIN** - Campus administrator
   - Can moderate marketplace listings
   - Can view all orders/requests
   - Can manage vendors
   - Can view analytics
   - Can manage support tickets

5. **SUPER_ADMIN** - System administrator
   - Full platform access
   - Can manage users and roles
   - Can manage campuses
   - Can manage all content
   - Can access system settings

#### Authentication Flow

##### Registration
```
Student fills registration form
    ↓
POST /api/v1/auth/register
    ↓
Backend validates input (email format, password strength)
    ↓
Hash password with bcrypt
    ↓
Create user record in database
    ↓
Generate JWT tokens (access + refresh)
    ↓
Return user object + access token
    ↓
Frontend stores access token in localStorage/sessionStorage
```

##### Login
```
Student enters credentials
    ↓
POST /api/v1/auth/login
    ↓
Backend finds user by email
    ↓
Compare submitted password hash with stored hash
    ↓
If match: Generate JWT tokens (access + refresh)
    ↓
Return user object + access token
    ↓
Frontend stores token in sessionStorage/localStorage
```

##### Token Management
- **Access Token**
  - JWT format
  - 15-minute expiration
  - Contains: user_id, email, role, campus_id
  - Sent in Authorization header: `Bearer {token}`

- **Refresh Token**
  - JWT format
  - 7-day expiration
  - Stored securely on backend
  - Used to obtain new access token when expired

#### JWT Payload Example
```json
{
  "sub": "1234567890",
  "email": "student@unimaid.edu.ng",
  "full_name": "Amina Sani",
  "role": "CUSTOMER",
  "campus_id": "unimaid",
  "iat": 1692547200,
  "exp": 1692548100,
  "type": "access"
}
```

### Authorization Rules

#### Public Endpoints
- GET /api/v1/campuses
- GET /api/v1/categories
- GET /api/v1/vendors (public vendor list)
- GET /api/v1/products (public product list)
- GET /api/v1/services (public service list)
- GET /api/v1/marketplace (public listings)
- GET /api/v1/search
- GET /api/v1/health

#### Customer-Only Endpoints
- POST /api/v1/auth/login
- POST /api/v1/auth/register
- POST /api/v1/auth/logout
- GET /api/v1/auth/me
- POST /api/v1/cart/*
- GET /api/v1/cart
- POST /api/v1/orders
- GET /api/v1/orders
- POST /api/v1/marketplace (create listing)
- PATCH /api/v1/marketplace/:id (update own listing)
- POST /api/v1/service-requests

#### Vendor-Only Endpoints
- GET /api/v1/vendors/:id/dashboard (analytics)
- PATCH /api/v1/orders/:id (update order status for own vendor)
- PATCH /api/v1/service-requests/:id (respond to service request)
- GET /api/v1/vendors/:id/orders

#### Rider-Only Endpoints
- GET /api/v1/deliveries/assigned (get assigned deliveries)
- PATCH /api/v1/deliveries/:id (update delivery status)

#### Admin-Only Endpoints
- GET /api/v1/admin/users
- GET /api/v1/admin/marketplace-listings (pending review)
- PATCH /api/v1/admin/marketplace-listings/:id/approve
- PATCH /api/v1/admin/marketplace-listings/:id/reject
- GET /api/v1/admin/analytics

#### Owner-Only Resources
- Cannot access another user's orders/requests
- Can only modify own marketplace listings
- Can only access own addresses

---

## F. GOOGLE APPS SCRIPT ROLE

### What Apps Script Should Do (Future Implementation - Phase 13+)

✅ **Administrative Reporting**
- Generate weekly/monthly sales reports
- Campus performance summaries
- Vendor analytics and dashboards
- Export data to Google Sheets for analysis

✅ **Email Notifications**
- Order confirmation emails to vendors
- Service request acknowledgments
- Delivery status updates via email
- System alerts to admins

✅ **Data Export & Synchronization**
- Scheduled exports to Google Sheets (for admin review)
- Backup data snapshots
- Archive old orders and requests

✅ **Workflow Automation**
- Moderate marketplace listings (flag suspicious items)
- Auto-categorize vendor types
- Generate invoice PDFs
- Schedule recurring reminders

✅ **Lightweight Data Entry**
- Admin dashboard forms (vs. building full admin panel initially)
- Quick vendor onboarding forms
- Campus staff manual order override interface

### What Apps Script Should NOT Do

❌ **Core Transactional Logic**
- DO NOT store primary product/order data in Sheets
- DO NOT make Sheets the database of record
- DO NOT depend on Sheets for real-time operations

❌ **Payment Processing**
- DO NOT handle payment verification in Apps Script
- DO NOT store payment secrets or tokens
- Backend must be the single source of truth for payment status

❌ **User Authentication**
- DO NOT use Apps Script for user auth
- DO NOT verify JWT tokens in Apps Script
- Backend is authoritative for user validation

❌ **Real-Time Operations**
- DO NOT use Sheets for real-time order status
- DO NOT rely on Apps Script for API responses
- Apps Script is asynchronous helper, not primary backend

### Architecture: Apps Script Relationship to Backend
```
CLX Backend (PostgreSQL + Express.js)
    ↓
    ├─→ Apps Script (Event-triggered, scheduled tasks)
    │     ├─→ Google Sheets (Reporting, analytics)
    │     ├─→ Gmail (Notifications)
    │     └─→ Drive (Document storage)
    │
    └─→ External APIs (Payment, SMS, etc.)
```

**Implementation Pattern:**
1. Backend processes core transactions
2. Backend publishes events (order created, service accepted, etc.)
3. Apps Script listens for events via webhook or scheduled check
4. Apps Script performs automation (send email, log to Sheets)
5. Apps Script never blocks backend operations

---

## G. FRONTEND MIGRATION PLAN

### Current State
Frontend API layer (js/api.js) currently:
- Imports mock data from js/data.js
- Simulates async API calls with delays
- Stores state in localStorage
- Returns hardcoded success/error responses

### Migration to Real Backend

#### Phase 0: No Changes
- Frontend remains fully functional with mock data
- Frontend and backend developed in parallel
- No frontend modifications until Phase 1 backend is complete

#### Phase 1: Backend Foundation Complete
- Backend provides /api/v1/campuses, /api/v1/categories endpoints
- Frontend js/api.js begins transitioning from mock to HTTP

#### Migration Strategy: Endpoint-by-Endpoint Swap
```javascript
// BEFORE (Mock)
campuses: {
  async list() {
    await delay();
    return { success: true, data: CAMPUSES };
  }
}

// AFTER (Real Backend)
campuses: {
  async list() {
    const response = await fetch('/api/v1/campuses', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });
    const data = await response.json();
    return data;
  }
}
```

#### Frontend Changes Required (Minimal)
1. Update js/api.js to call real HTTP endpoints
2. Add auth token management to localStorage
3. Update error handling for HTTP errors
4. Add request/response logging for debugging
5. Update headers to include Content-Type, Authorization

**NO changes to:**
- HTML structure
- CSS styling
- Component logic
- User interactions
- Page layouts

#### Token Management in Frontend
```javascript
// Store after login/register
localStorage.setItem('clx_auth_token', response.accessToken);

// Use in API calls
const token = localStorage.getItem('clx_auth_token');
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};

// Clear on logout
localStorage.removeItem('clx_auth_token');
```

#### Frontend State Persistence During Migration
- Cart items: Continue using localStorage temporarily
- Orders: Eventually move to backend (Phase 10)
- Campus selection: Continue using localStorage
- Marketplace listings: Move to backend (Phase 7)

### Rollback Plan
If backend has issues:
1. Comments in js/api.js show mock implementation below real HTTP calls
2. Can quickly swap to mock data by removing fetch() and uncommenting mock
3. Frontend remains fully functional during backend development

---

## H. LOCALSTORAGE MIGRATION

### Current LocalStorage Usage

| Key | Current Use | Migration Plan | Target Phase |
|-----|-------------|-----------------|--------------|
| `clx_selected_campus` | Campus selection | Keep in frontend (session state) | Never (frontend only) |
| `clx_cart_items` | Shopping cart | Move to backend /api/v1/cart | Phase 9 |
| `clx_user_orders` | User's orders | Move to backend /api/v1/orders | Phase 10 |
| `clx_user_marketplace_listings` | User's marketplace items | Move to backend /api/v1/marketplace | Phase 7 |
| `clx_user_service_requests` | Service requests | Move to backend /api/v1/service-requests | Phase 6 |

### Frontend-Only State (Never Backend)
- `clx_selected_campus` - Affects UI display, not persisted on backend
- `clx_search_history` - Local user preference
- `clx_ui_preferences` - Theme, layout settings
- Auth token - Will be in sessionStorage (temporary)

### Backend-Owned State (Move to Database)
Everything else should eventually move to database with API endpoints.

### Migration Timeline
```
PHASE 1-5: Keep using localStorage (parallel development)
PHASE 6-10: Gradually migrate to backend APIs as endpoints become available
PHASE 11+: All stateful data backed by database
```

---

## I. SECURITY REQUIREMENTS

### Input Validation (Backend)
- ✅ All request data validated against schema
- ✅ Email format validation
- ✅ Phone number format validation
- ✅ Price validation (no negative prices, max reasonable values)
- ✅ Image URL validation
- ✅ Text field length limits
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS prevention (sanitize output)
- ✅ Duplicate submission prevention (idempotency keys)

### Authentication Security
- ✅ Passwords hashed with bcrypt (min cost 10)
- ✅ JWT tokens with expiration times
- ✅ Refresh tokens stored securely
- ✅ Rate limiting on auth endpoints (5 login attempts / 15 min)
- ✅ Account lockout after failed attempts
- ✅ Email verification before account activation (future)
- ✅ Password reset via secure token (future)

### Authorization Security
- ✅ Role-based access control (RBAC)
- ✅ Resource-level authorization (owner check)
- ✅ No privilege escalation vectors
- ✅ Backend always validates user role (never trust frontend)

### Order/Payment Security
- ✅ Price calculated on backend, never trust browser price
- ✅ Order total verified server-side
- ✅ Payment status only updated after provider confirmation
- ✅ Delivery fee fixed per zone (no client override)
- ✅ Refund logic centralized on backend
- ✅ No direct payment in MVP (use COD initially)

### Data Security
- ✅ Sensitive fields encrypted at rest (passwords, tokens)
- ✅ No plaintext passwords ever stored
- ✅ No API keys in frontend code
- ✅ No secret keys in git repository
- ✅ .env files not committed
- ✅ SSL/TLS for all transport (HTTPS only production)

### API Security
- ✅ CORS properly configured (only frontend domain)
- ✅ Rate limiting per IP and per user
- ✅ Request size limits
- ✅ Request timeout limits
- ✅ Security headers (Content-Security-Policy, X-Frame-Options, etc.)
- ✅ No stack traces in production responses
- ✅ Error messages don't leak system details

### Audit & Compliance
- ✅ All mutations logged to audit_logs table
- ✅ Timestamps on all records
- ✅ User identity tracked for changes
- ✅ Soft deletes (deleted_at) for data retention
- ✅ GDPR-compliant data export for users

### Network Security
- ✅ HTTPS/TLS required (production)
- ✅ Secure headers configured
- ✅ CORS restricted to trusted origins
- ✅ Cookie security (HttpOnly, Secure, SameSite)
- ✅ No sensitive data in URLs/query parameters

---

## J. DEVELOPMENT PHASES

### Phase Overview

| Phase | Name | Timeline | Status | Deliverables |
|-------|------|----------|--------|--------------|
| 0 | Architecture Analysis | ✅ Complete | Complete | This document |
| 1 | Backend Foundation | 2-3 days | Not Started | Express server, DB connection, health check |
| 2 | Database Setup | 1-2 days | Not Started | PostgreSQL schema, Supabase connection |
| 3 | Campuses & Categories | 1-2 days | Not Started | 2 API endpoints, CRUD operations |
| 4 | Vendors | 2-3 days | Not Started | Vendor endpoints, vendor filtering |
| 5 | Products | 3-4 days | Not Started | Product endpoints, advanced filtering |
| 6 | Services | 2-3 days | Not Started | Service endpoints, service request creation |
| 7 | Marketplace | 2-3 days | Not Started | Marketplace endpoints, moderation queue |
| 8 | Authentication | 3-4 days | Not Started | Auth endpoints, JWT, role management |
| 9 | Cart | 2-3 days | Not Started | Cart endpoints, single-vendor constraint |
| 10 | Orders | 3-4 days | Not Started | Order creation, tracking, status updates |
| 11 | Delivery | 2-3 days | Not Started | Delivery request endpoints, assignment |
| 12 | Payments | 3-4 days | Not Started | Payment endpoint stubs, provider integration |
| 13 | Google Apps Script | 3-4 days | Not Started | Reporting, notifications, automation |
| 14 | Notifications | 2-3 days | Not Started | Email, SMS, in-app notifications |
| 15 | Admin Panel | 3-5 days | Not Started | Moderation, analytics, user management |
| 16 | Frontend Integration | 2-3 days | Not Started | Connect frontend to real API |
| 17 | Security Hardening | 2-3 days | Not Started | Rate limiting, encryption, audit logs |
| 18 | Testing | 3-5 days | Not Started | Unit, integration, e2e tests |
| 19 | Deployment | 2-3 days | Not Started | Production server, CI/CD, monitoring |

### Total Estimated Timeline
**50-60 working days** (10-12 weeks for full production-ready system)

### Phased Rollout Strategy
- **MVP (Phases 1-10):** 2-3 weeks
  - Core marketplace functionality
  - Order management
  - Ready for campus testing

- **Phase 2 (Phases 11-14):** 1-2 weeks
  - Delivery system
  - Notifications
  - Basic automation

- **Phase 3 (Phases 15-19):** 1-2 weeks
  - Admin features
  - Full security
  - Production deployment

---

## K. PHASE 1 SPECIFICATION

### Phase 1: Backend Foundation & Database Connection

**Objective:** Establish functional Express.js backend with database connection and basic infrastructure.

**Duration:** 2-3 days  
**Complexity:** Low to Medium

### Phase 1 Deliverables

#### 1.1 Express Server Setup
- Express.js application with proper middleware
- Request logging middleware
- Error handling middleware
- Centralized error response format
- Environment variable support (.env)
- CORS configuration
- JSON body parser

#### 1.2 Database Connection
- PostgreSQL connection via Supabase
- Connection pool management
- Graceful connection handling
- Database connection test endpoint

#### 1.3 Project Structure
```
clx-backend/
├── src/
│   ├── config/
│   │   └── database.js
│   │   └── env.js
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   ├── logger.js
│   │   └── cors.js
│   ├── routes/
│   │   ├── health.js
│   │   └── index.js
│   ├── utils/
│   │   ├── response.js
│   │   └── logger.js
│   └── app.js
├── .env.example
├── package.json
├── README.md
└── index.js
```

#### 1.4 Health Check Endpoint
- `GET /api/v1/health`
- Returns server status and database connection status
- No authentication required
- Test endpoint for deployment

#### 1.5 Error Handling Framework
Centralized error response format:
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Resource not found"
  },
  "timestamp": "2026-08-20T10:30:00Z"
}
```

#### 1.6 Logging
- Development logging to console
- Production-ready logging structure
- Request ID tracking
- Error logging

### Phase 1 Dependencies
- express (5.2.1+)
- pg (8.23.0+)
- dotenv
- cors
- helmet (security headers)
- morgan (request logging)

### Phase 1 Testing Checklist
- [ ] Server starts without errors
- [ ] Database connection succeeds
- [ ] Health check endpoint responds 200
- [ ] Database health check works
- [ ] Error responses are formatted correctly
- [ ] CORS allows frontend origin
- [ ] Request logging works
- [ ] Environment variables load from .env
- [ ] Server handles startup errors gracefully

### Phase 1 Deliverables Checklist
- [ ] clx-backend/src/ folder structure created
- [ ] Express app.js configured
- [ ] Database connection module created
- [ ] .env.example with all required variables
- [ ] README.md with setup instructions
- [ ] package.json with correct dependencies
- [ ] Health check endpoint implemented and tested
- [ ] Error handling middleware implemented
- [ ] Logging middleware configured
- [ ] CORS configured for frontend URL
- [ ] Local testing confirmed (all endpoints respond)

### Phase 1 Acceptance Criteria
1. ✅ Server runs on port 3000 without errors
2. ✅ Database connection established to Supabase PostgreSQL
3. ✅ GET /api/v1/health returns 200 with database status
4. ✅ All endpoints return proper JSON response format
5. ✅ Errors are caught and formatted consistently
6. ✅ Frontend can make requests (CORS works)
7. ✅ Logging shows all requests and errors
8. ✅ Project structure is clean and organized

### Phase 1 NOT Included
- ❌ No API endpoints (except health)
- ❌ No database schema
- ❌ No authentication
- ❌ No data models

### Next Steps After Phase 1
1. Review and approve Phase 1 completion
2. Create database schema (Phase 2)
3. Implement campuses and categories endpoints (Phase 3)

---

## IMPLEMENTATION NOTES

### Technology Stack Summary
- **Runtime:** Node.js 18+
- **Web Framework:** Express.js 5+
- **Database:** PostgreSQL 13+ (Supabase)
- **Authentication:** JWT (jsonwebtoken)
- **Password Hashing:** bcrypt
- **Validation:** Manual (or joi/zod later)
- **Testing:** Jest (to be added)
- **Documentation:** JSDoc + API docs (to be added)

### Deployment Strategy
- **Development:** Local Node.js + PostgreSQL
- **Staging:** Render/Heroku + Supabase
- **Production:** Render/Heroku + Supabase + CloudFlare

### Monitoring & Observability (Future)
- Application logs (Winston or similar)
- Error tracking (Sentry or similar)
- Performance monitoring (New Relic or similar)
- Uptime monitoring

### Git Strategy
- Main branch: Production-ready code
- Dev branch: Development code
- Feature branches: Individual features
- Semantic versioning: v1.0.0, v1.1.0, etc.

---

## CRITICAL RULES FOR IMPLEMENTATION

1. **DO NOT redesign frontend** - Keep existing HTML/CSS/JS intact
2. **DO NOT skip testing** - Test each endpoint before moving to next phase
3. **DO NOT expose secrets** - .env files never committed
4. **DO NOT trust client input** - Validate everything on backend
5. **DO NOT trust client price** - Calculate on backend for orders
6. **DO NOT hardcode credentials** - Use environment variables
7. **DO NOT move forward** until current phase is tested and approved
8. **DO report honestly** - Say "incomplete" rather than "it works"

---

## APPENDIX: FRONTEND API USAGE EXAMPLES

### Current Frontend API Calls (js/api.js)

#### Campus Management
```javascript
const campuses = await api.campuses.list();
const campus = await api.campuses.getById('unimaid');
const selected = api.campuses.getSelectedCampus();
api.campuses.setSelectedCampus('kiu');
```

#### Products & Shopping
```javascript
const products = await api.products.list({
  category: 'food',
  subcategory: 'Restaurants',
  campus: 'unimaid',
  search: 'jollof',
  sort: 'price-asc'
});
```

#### Cart Management
```javascript
cart.addItem({ id, name, price, vendorId, quantity });
cart.removeItem(id);
cart.updateQuantity(id, delta);
const total = cart.getTotal();
```

#### Orders
```javascript
const orders = await api.orders.list();
await api.orders.create({
  type: 'food',
  title: 'Order details',
  vendor: 'vendor name',
  total: 5000,
  status: 'Confirmed'
});
```

#### Marketplace
```javascript
const listings = await api.marketplace.list({
  subcategory: 'Used Textbooks',
  condition: 'good'
});
await api.marketplace.createListing({
  title: 'Textbook',
  price: 6500,
  condition: 'good'
});
```

#### Search
```javascript
const results = await api.search.global('jollof', 'unimaid');
// Returns: { products, services, vendors, marketplace }
```

---

## DOCUMENT INFORMATION

**Document Version:** 1.0  
**Last Updated:** 2026-08-20  
**Status:** Complete - Ready for Review  
**Next Review:** After Phase 1 Completion  
**Approvals Needed:** Project Owner Confirmation

---

**END OF ARCHITECTURE ANALYSIS**

This document serves as the comprehensive blueprint for CLX backend development. The project owner should review and approve this architecture before Phase 1 implementation begins.
