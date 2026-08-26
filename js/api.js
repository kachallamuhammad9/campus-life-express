/**
 * Campus Life Express (CLX 2.0) - Production API Client Layer
 * Full integration with Express / PostgreSQL backend endpoints (/api/v1/*)
 */

import { CAMPUSES, CATEGORIES, VENDORS, PRODUCTS, SERVICES, MARKETPLACE_LISTINGS, INITIAL_ORDERS } from './data.js';

// Local storage keys for client state persistence & authentication
const STORAGE_KEYS = {
    AUTH_TOKEN: "clx_auth_token",
    USER_PROFILE: "clx_user_profile",
    CAMPUS: "clx_selected_campus",
    CART: "clx_cart_items",
    ORDERS: "clx_user_orders",
    MARKETPLACE_CUSTOM: "clx_user_marketplace_listings",
    SERVICE_REQUESTS: "clx_user_service_requests",
    NOTIFICATIONS: "clx_user_notifications"
};

const API_BASE = "http://localhost:3000/api/v1";

/**
 * Normalization helpers to ensure dual compatibility between backend database fields
 * (snake_case, integer kobo) and existing frontend UI expectations (camelCase, Naira).
 */
const normalizeProduct = (p) => {
    if (!p) return null;
    const priceNaira = p.price !== undefined ? Number(p.price) : (p.price_kobo !== undefined ? Math.round(Number(p.price_kobo) / 100) : (p.priceKobo !== undefined ? Math.round(Number(p.priceKobo) / 100) : 0));
    const priceKobo = p.price_kobo !== undefined ? Number(p.price_kobo) : (p.priceKobo !== undefined ? Number(p.priceKobo) : priceNaira * 100);

    return {
        id: String(p.id),
        name: p.name || "",
        slug: p.slug || "",
        price: priceNaira,
        price_kobo: priceKobo,
        priceKobo: priceKobo,
        vendorId: String(p.vendor_id || p.vendorId || ""),
        categoryId: String(p.category_id || p.categoryId || ""),
        subcategoryId: String(p.subcategory_id || p.subcategoryId || ""),
        vendorName: p.vendor_name || p.vendorName || (p.vendor?.name) || "Campus Vendor",
        image: p.image_url || p.imageUrl || p.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
        imageUrl: p.image_url || p.imageUrl || p.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
        category: (p.category_slug || p.categorySlug || p.category || p.fallbackCategory || "food").toLowerCase(),
        subcategory: p.subcategory_name || p.subcategoryName || p.subcategory || ((p.category || p.fallbackCategory) === "food" ? "Meals" : "Stationery"),
        description: p.description || "",
        rating: Number(p.rating !== undefined ? p.rating : (p.average_rating || 4.5)),
        reviewsCount: Number(p.reviews_count !== undefined ? p.reviews_count : (p.review_count !== undefined ? p.review_count : (p.reviewsCount || 12))),
        campus: (p.campus_slug || p.campusSlug || p.campus || "unimaid").toLowerCase(),
        isInStock: p.is_in_stock !== undefined ? Boolean(p.is_in_stock) : true,
        stockQuantity: p.stock_quantity !== undefined ? p.stock_quantity : 50,
        tags: Array.isArray(p.tags) ? p.tags : []
    };
};

const normalizeVendor = (v) => {
    if (!v) return null;
    return {
        id: String(v.id),
        name: v.name || "",
        slug: v.slug || "",
        category: (v.category_slug || v.category || "food").toLowerCase(),
        campus: (v.campus_slug || v.campus || "unimaid").toLowerCase(),
        rating: Number(v.rating || v.average_rating || 4.8),
        reviewsCount: Number(v.reviews_count || v.review_count || v.reviewsCount || 20),
        deliveryTime: v.delivery_time || v.deliveryTime || "15-25 min",
        minOrder: v.min_order !== undefined ? Number(v.min_order) : (v.min_order_kobo ? Math.round(Number(v.min_order_kobo) / 100) : 500),
        image: v.image_url || v.imageUrl || v.image || "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80",
        imageUrl: v.image_url || v.imageUrl || v.image,
        description: v.description || "",
        isOpen: v.is_open !== undefined ? Boolean(v.is_open) : (v.status === 'ACTIVE'),
        status: v.status || "ACTIVE",
        verified: v.verified !== undefined ? Boolean(v.verified) : true
    };
};

const normalizeService = (s) => {
    if (!s) return null;
    const priceNaira = s.starting_price_kobo !== undefined ? Math.round(Number(s.starting_price_kobo) / 100) : (s.base_price_kobo ? Math.round(Number(s.base_price_kobo) / 100) : (s.startingPrice || 1000));
    return {
        id: String(s.id),
        name: s.name || "",
        slug: s.slug || "",
        category: "services",
        subcategory: s.subcategory_name || s.subcategory || "General",
        providerName: s.vendor_name || s.providerName || (s.vendor?.name) || "Verified Provider",
        providerId: String(s.vendor_id || s.providerId || ""),
        campus: (s.campus_slug || s.campus || "unimaid").toLowerCase(),
        rating: Number(s.rating || 4.9),
        reviewsCount: Number(s.reviews_count || s.reviewsCount || 15),
        priceType: s.price_type || s.priceType || "Starting from",
        startingPrice: priceNaira,
        basePrice: priceNaira,
        priceLabel: s.price_label || s.priceLabel || `${s.price_type || "Starting from"} ₦${priceNaira.toLocaleString()}`,
        turnaround: s.turnaround_time || s.turnaround || "Contact provider",
        deliveryType: s.delivery_type || s.deliveryType || "In-Person / Pickup",
        image: s.image_url || s.image || "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&auto=format&fit=crop&q=80",
        description: s.description || ""
    };
};

const normalizeMarketplace = (m) => {
    if (!m) return null;
    const priceNaira = m.price_kobo ? Math.round(Number(m.price_kobo) / 100) : (m.price || 0);
    return {
        id: String(m.id),
        title: m.title || m.name || "",
        category: "marketplace",
        subcategory: m.subcategory_name || m.subcategory || "Electronics",
        price: priceNaira,
        price_kobo: priceNaira * 100,
        condition: m.condition || "Used - Good",
        sellerName: m.seller_name || m.sellerName || "Verified Student",
        sellerPhone: m.seller_phone || m.sellerPhone || "08012345678",
        sellerRoom: m.seller_room || m.sellerRoom || "Hostel A, Rm 14",
        campus: (m.campus_slug || m.campus || "unimaid").toLowerCase(),
        dateListed: m.date_listed || m.dateListed || "Recently",
        status: m.status || "Active",
        image: m.image_url || m.image || "https://images.unsplash.com/photo-1534452203293-494d7ddbf7e0?w=600&auto=format&fit=crop&q=80",
        description: m.description || "",
        isModerated: m.is_moderated !== undefined ? Boolean(m.is_moderated) : true
    };
};

const normalizeOrder = (o) => {
    if (!o) return null;
    const totalNaira = o.total !== undefined ? Number(o.total) : (o.total_kobo !== undefined ? Math.round(Number(o.total_kobo) / 100) : (o.totalKobo !== undefined ? Math.round(Number(o.totalKobo) / 100) : 0));
    return {
        id: String(o.id || o.orderId || ""),
        type: (o.type || "order").toLowerCase(),
        title: o.title || (o.vendor?.name ? `Order from ${o.vendor.name}` : `Campus Order #${o.id || ""}`),
        vendor: o.vendor_name || o.vendorName || (o.vendor?.name) || "Campus Store",
        campus: (o.campus_slug || (typeof o.campus === "object" ? o.campus?.slug : o.campus) || "unimaid").toLowerCase(),
        total: totalNaira,
        status: o.status || "Processing",
        statusStep: o.status === "DELIVERED" || o.status === "Completed" ? 4 : o.status === "IN_TRANSIT" || o.status === "Out for Delivery" ? 3 : o.status === "CONFIRMED" || o.status === "Confirmed" ? 2 : 1,
        date: o.created_at ? new Date(o.created_at).toLocaleDateString() : (o.date || "Today"),
        fulfillment: o.delivery_address || o.deliveryAddress || o.fulfillment || "Campus Delivery",
        items: Array.isArray(o.items) ? o.items : [],
        paymentMethod: o.payment_method || o.paymentMethod || "CASH_ON_DELIVERY",
        paymentStatus: o.payment_status || o.paymentStatus || "PENDING",
        payments: Array.isArray(o.payments) ? o.payments : []
    };
};

/**
 * Core HTTP Request Wrapper with JWT Authorization Header Injection
 */
async function fetchJson(endpoint, options = {}) {
    const headers = {
        'Accept': 'application/json',
        ...(options.headers || {})
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            const errorMessage = data?.error?.message || data?.message || `Request failed with status ${response.status}`;
            if (response.status === 401) {
                localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
                localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
                window.dispatchEvent(new CustomEvent("clx:auth-changed", { detail: { user: null } }));
            }
            return {
                success: false,
                status: response.status,
                error: data?.error || { message: errorMessage, code: data?.code || 'REQUEST_FAILED' },
                data: null
            };
        }

        return {
            success: true,
            status: response.status,
            data: data?.data !== undefined ? data.data : data
        };
    } catch (err) {
        console.warn(`[API] Network error requesting ${url}:`, err.message);
        return {
            success: false,
            status: 0,
            error: { message: err.message, code: 'NETWORK_ERROR' },
            data: null
        };
    }
}

export const api = {
    // ----------------------------------------------------
    // AUTHENTICATION & SESSIONS (/api/v1/auth)
    // ----------------------------------------------------
    auth: {
        getToken() {
            return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        },
        setToken(token) {
            if (token) {
                localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
            } else {
                localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
            }
        },
        getUserProfile() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_PROFILE) || "null");
            } catch {
                return null;
            }
        },
        async login(email, password) {
            const res = await fetchJson('/auth/login', {
                method: 'POST',
                body: { email, password }
            });

            if (!res.success) {
                api.auth.logout();
                return res;
            }

            if (res.success && res.data?.token) {
                api.auth.setToken(res.data.token);
                if (res.data.user) {
                    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(res.data.user));
                }
                window.dispatchEvent(new CustomEvent("clx:auth-changed", { detail: { user: res.data.user || null } }));
            }
            return res;
        },
        async register(userData) {
            const res = await fetchJson('/auth/register', {
                method: 'POST',
                body: userData
            });

            if (!res.success) {
                api.auth.logout();
                return res;
            }

            if (res.success && res.data?.token) {
                api.auth.setToken(res.data.token);
                if (res.data.user) {
                    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(res.data.user));
                }
                window.dispatchEvent(new CustomEvent("clx:auth-changed", { detail: { user: res.data.user || null } }));
            }
            return res;
        },
        async getDemoSession(role = 'CUSTOMER') {
            const res = await fetchJson(`/auth/demo-session?role=${encodeURIComponent(role)}`, {
                method: 'GET'
            });

            if (res.success && res.data?.token) {
                api.auth.setToken(res.data.token);
                if (res.data.user) {
                    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(res.data.user));
                }
                window.dispatchEvent(new CustomEvent("clx:auth-changed", { detail: { user: res.data.user || null } }));
            }
            return res;
        },
        async getMe() {
            const res = await fetchJson('/auth/me');
            if (res.success && res.data) {
                localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(res.data));
                window.dispatchEvent(new CustomEvent("clx:auth-changed", { detail: { user: res.data } }));
            }
            return res;
        },
        logout() {
            localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
            localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
            window.dispatchEvent(new CustomEvent("clx:auth-changed", { detail: { user: null } }));
        }
    },

    // ----------------------------------------------------
    // CAMPUSES (/api/v1/campuses)
    // ----------------------------------------------------
    campuses: {
        async list() {
            const res = await fetchJson('/campuses');
            if (res.success && Array.isArray(res.data) && res.data.length > 0) {
                return {
                    success: true,
                    data: res.data.map(c => ({
                        id: c.slug || c.id,
                        name: c.name,
                        shortName: c.code || c.name.split(' ')[0] || "UNIMAID",
                        state: c.state || "Borno",
                        isActive: c.is_active !== undefined ? c.is_active : true
                    }))
                };
            }
            return { success: true, data: CAMPUSES };
        },
        async getById(id) {
            const res = await fetchJson(`/campuses/${id}`);
            if (res.success && res.data) {
                return res;
            }
            const fallback = CAMPUSES.find(c => c.id === id);
            return fallback ? { success: true, data: fallback } : { success: false, message: "Campus not found" };
        },
        async getDeliveryZones(campusId) {
            const res = await fetchJson(`/campuses/${campusId}/delivery-zones`);
            if (res.success && Array.isArray(res.data)) {
                return res;
            }
            return { success: true, data: [] };
        },
        getSelectedCampus() {
            return localStorage.getItem(STORAGE_KEYS.CAMPUS) || "unimaid";
        },
        setSelectedCampus(campusId) {
            localStorage.setItem(STORAGE_KEYS.CAMPUS, campusId);
            window.dispatchEvent(new CustomEvent("clx:campus-changed", { detail: { campusId } }));
            return campusId;
        }
    },

    // ----------------------------------------------------
    // CATEGORIES (/api/v1/categories)
    // ----------------------------------------------------
    categories: {
        async list() {
            const res = await fetchJson('/categories');
            if (res.success && Array.isArray(res.data) && res.data.length > 0) {
                return { success: true, data: res.data };
            }
            return { success: true, data: CATEGORIES };
        },
        async getById(id) {
            const res = await fetchJson(`/categories/${id}`);
            if (res.success && res.data) {
                return res;
            }
            const fallback = CATEGORIES.find(c => c.id === id);
            return fallback ? { success: true, data: fallback } : { success: false, message: "Category not found" };
        }
    },

    // ----------------------------------------------------
    // VENDORS & BUSINESSES (/api/v1/vendors)
    // ----------------------------------------------------
    vendors: {
        async list(filters = {}) {
            const params = new URLSearchParams();
            if (filters.campus) params.append('campusId', filters.campus);
            if (filters.category && filters.category !== "all") params.append('categoryId', filters.category);
            if (filters.search) params.append('search', filters.search);
            if (filters.limit) params.append('limit', filters.limit);
            if (filters.offset) params.append('offset', filters.offset);

            const queryString = params.toString() ? `?${params.toString()}` : '';
            const res = await fetchJson(`/vendors${queryString}`);

            if (res.success && Array.isArray(res.data)) {
                return {
                    success: true,
                    data: res.data.map(normalizeVendor),
                    count: res.data.length
                };
            }

            // Resilient fallback to static seed data
            let list = [...VENDORS];
            if (filters.campus) {
                list = list.filter(v => v.campus === filters.campus);
            }
            if (filters.category && filters.category !== "all") {
                list = list.filter(v => v.category === filters.category);
            }
            if (filters.search) {
                const s = filters.search.toLowerCase();
                list = list.filter(v => v.name.toLowerCase().includes(s) || v.description.toLowerCase().includes(s));
            }
            return { success: true, data: list, count: list.length };
        },
        async getById(id) {
            const res = await fetchJson(`/vendors/${id}`);
            if (res.success && res.data) {
                return { success: true, data: normalizeVendor(res.data) };
            }
            const vendor = VENDORS.find(v => v.id === id);
            return vendor ? { success: true, data: vendor } : { success: false, message: "Vendor not found" };
        },
        async getProducts(vendorId) {
            const res = await fetchJson(`/vendors/${vendorId}/products`);
            if (res.success && Array.isArray(res.data)) {
                return { success: true, data: res.data.map(normalizeProduct) };
            }
            const products = PRODUCTS.filter(p => p.vendorId === vendorId);
            return { success: true, data: products };
        },
        async getReviews(vendorId) {
            const res = await fetchJson(`/vendors/${vendorId}/reviews`);
            return res.success ? res : { success: true, data: [] };
        }
    },

    // ----------------------------------------------------
    // PRODUCTS (/api/v1/products - Food & Shopping)
    // ----------------------------------------------------
    products: {
        async list(filters = {}) {
            const res = await fetchJson('/products');

            if (res.success && Array.isArray(res.data)) {
                let list = res.data.map(product => normalizeProduct({
                    ...product,
                    fallbackCategory: filters.category
                }));

                if (filters.campus) {
                    list = list.filter(product => product.campus === filters.campus.toLowerCase());
                }
                if (filters.category && filters.category !== "all") {
                    const categoryResponse = await fetchJson('/categories');
                    const categoryIds = new Set();
                    const collectCategoryIds = categories => {
                        if (!Array.isArray(categories)) return;
                        categories.forEach(category => {
                            if (category.slug === filters.category.toLowerCase()) {
                                categoryIds.add(String(category.id));
                            }
                            collectCategoryIds(category.subcategories || category.children);
                        });
                    };
                    if (categoryResponse.success) collectCategoryIds(categoryResponse.data);
                    list = list.filter(product => categoryIds.has(product.categoryId));
                }
                if (filters.vendorId) {
                    list = list.filter(product => product.vendorId === String(filters.vendorId));
                }
                if (filters.search) {
                    const search = filters.search.toLowerCase();
                    list = list.filter(product => `${product.name} ${product.description} ${product.vendorName}`.toLowerCase().includes(search));
                }
                if (filters.inStock !== undefined) {
                    list = list.filter(product => product.isInStock === Boolean(filters.inStock));
                }

                // Apply subcategory and sort client-side if needed
                if (filters.subcategory && filters.subcategory !== "all") {
                    list = list.filter(p => (p.subcategory || "").toLowerCase() === filters.subcategory.toLowerCase());
                }
                if (filters.sort === "price-asc") {
                    list.sort((a, b) => a.price - b.price);
                } else if (filters.sort === "price-desc") {
                    list.sort((a, b) => b.price - a.price);
                } else if (filters.sort === "rating") {
                    list.sort((a, b) => b.rating - a.rating);
                }

                return { success: true, data: list, count: list.length };
            }

            return {
                success: false,
                data: [],
                error: res.error || { message: "Unable to load products" }
            };
        },
        async getById(id) {
            const res = await fetchJson(`/products/${id}`);
            if (res.success && res.data) {
                return { success: true, data: normalizeProduct(res.data) };
            }
            const product = PRODUCTS.find(p => p.id === id);
            return product ? { success: true, data: product } : { success: false, message: "Product not found" };
        },
        async getReviews(productId) {
            const res = await fetchJson(`/products/${productId}/reviews`);
            return res.success ? res : { success: true, data: [] };
        }
    },

    // ----------------------------------------------------
    // CAMPUS SERVICES (/api/v1/services & requests)
    // ----------------------------------------------------
    services: {
        async list(filters = {}) {
            const params = new URLSearchParams();
            if (filters.campus) params.append('campusId', filters.campus);
            if (filters.category && filters.category !== "all") params.append('categoryId', filters.category);
            if (filters.search) params.append('search', filters.search);

            const queryString = params.toString() ? `?${params.toString()}` : '';
            const res = await fetchJson(`/services${queryString}`);

            if (res.success && Array.isArray(res.data)) {
                let list = res.data.map(normalizeService);
                if (filters.subcategory && filters.subcategory !== "all") {
                    list = list.filter(s => (s.subcategory || "").toLowerCase() === filters.subcategory.toLowerCase());
                }
                return { success: true, data: list, count: list.length };
            }

            // Resilient fallback
            let list = [...SERVICES];
            if (filters.subcategory && filters.subcategory !== "all") {
                list = list.filter(s => s.subcategory.toLowerCase() === filters.subcategory.toLowerCase());
            }
            if (filters.campus) {
                list = list.filter(s => s.campus === filters.campus);
            }
            if (filters.search) {
                const s = filters.search.toLowerCase();
                list = list.filter(s => s.name.toLowerCase().includes(s) || s.description.toLowerCase().includes(s) || s.providerName.toLowerCase().includes(s));
            }
            return { success: true, data: list, count: list.length };
        },
        async getById(id) {
            const res = await fetchJson(`/services/${id}`);
            if (res.success && res.data) {
                return { success: true, data: normalizeService(res.data) };
            }
            const service = SERVICES.find(s => s.id === id);
            return service ? { success: true, data: service } : { success: false, message: "Service not found" };
        },
        async requestService(serviceRequest) {
            // Attempt backend service request creation
            const deliveryType = String(serviceRequest.deliveryType || 'PICKUP').toUpperCase().replace('IN-PERSON / PICKUP', 'IN_PERSON');
            const backendRes = await fetchJson(`/services/${encodeURIComponent(serviceRequest.serviceId)}/requests`, {
                method: 'POST',
                body: {
                    serviceId: serviceRequest.serviceId,
                    deliveryType,
                    customerLocation: serviceRequest.location || serviceRequest.deliveryLocation || serviceRequest.room,
                    description: serviceRequest.description || serviceRequest.notes || serviceRequest.customerInfo,
                    notes: serviceRequest.instructions || serviceRequest.notes,
                    estimatedBudgetKobo: (serviceRequest.estimatedPrice || 1000) * 100
                }
            });

            if (!backendRes.success) return backendRes;

            // Maintain local storage sync for unified tracking & orders view
            const userRequests = JSON.parse(localStorage.getItem(STORAGE_KEYS.SERVICE_REQUESTS) || "[]");
            const newRequest = {
                id: backendRes.data?.id || ("SRV-" + Math.floor(10000 + Math.random() * 90000)),
                type: "service",
                status: "Submitted",
                statusStep: 1,
                date: "Just now",
                ...serviceRequest
            };
            userRequests.unshift(newRequest);
            localStorage.setItem(STORAGE_KEYS.SERVICE_REQUESTS, JSON.stringify(userRequests));

            const userOrders = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || "[]");
            userOrders.unshift({
                id: newRequest.id,
                type: "service",
                title: serviceRequest.serviceName || "Campus Service Request",
                vendor: serviceRequest.providerName || "Service Provider",
                campus: serviceRequest.campus || api.campuses.getSelectedCampus(),
                total: serviceRequest.estimatedPrice || 0,
                status: "Submitted",
                statusStep: 1,
                date: "Just now",
                fulfillment: serviceRequest.deliveryType === "pickup" ? "Provider Pickup" : "Delivery / In-Person"
            });
            localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(userOrders));

            return { success: true, data: newRequest };
        }
    },

    // ----------------------------------------------------
    // STUDENT MARKETPLACE (/api/v1/marketplace)
    // ----------------------------------------------------
    marketplace: {
        async list(filters = {}) {
            const params = new URLSearchParams();
            if (filters.campus) params.append('campusId', filters.campus);
            if (filters.subcategory && filters.subcategory !== "all") params.append('categoryId', filters.subcategory);
            if (filters.condition && filters.condition !== "all") params.append('condition', filters.condition);
            if (filters.search) params.append('search', filters.search);

            const queryString = params.toString() ? `?${params.toString()}` : '';
            const res = await fetchJson(`/marketplace${queryString}`);

            const customListings = JSON.parse(localStorage.getItem(STORAGE_KEYS.MARKETPLACE_CUSTOM) || "[]");

            if (res.success && Array.isArray(res.data) && res.data.length > 0) {
                const combined = [...customListings, ...res.data.map(normalizeMarketplace)];
                return { success: true, data: combined, count: combined.length };
            }

            // Resilient fallback
            let list = [...customListings, ...MARKETPLACE_LISTINGS];
            if (filters.subcategory && filters.subcategory !== "all") {
                list = list.filter(m => m.subcategory.toLowerCase() === filters.subcategory.toLowerCase());
            }
            if (filters.condition && filters.condition !== "all") {
                list = list.filter(m => m.condition.toLowerCase() === filters.condition.toLowerCase());
            }
            if (filters.campus) {
                list = list.filter(m => m.campus === filters.campus);
            }
            if (filters.search) {
                const s = filters.search.toLowerCase();
                list = list.filter(m => m.title.toLowerCase().includes(s) || m.description.toLowerCase().includes(s) || m.sellerName.toLowerCase().includes(s));
            }
            return { success: true, data: list, count: list.length };
        },
        async getById(id) {
            const res = await fetchJson(`/marketplace/${id}`);
            if (res.success && res.data) {
                return { success: true, data: normalizeMarketplace(res.data) };
            }
            const customListings = JSON.parse(localStorage.getItem(STORAGE_KEYS.MARKETPLACE_CUSTOM) || "[]");
            const item = [...customListings, ...MARKETPLACE_LISTINGS].find(m => m.id === id);
            return item ? { success: true, data: item } : { success: false, message: "Listing not found" };
        },
        async createListing(listingData) {
            const priceNaira = Number(listingData.price) || 0;
            const res = await fetchJson('/marketplace', {
                method: 'POST',
                body: {
                    title: listingData.title,
                    description: listingData.description,
                    priceKobo: priceNaira * 100,
                    condition: listingData.condition || 'USED_GOOD',
                    campusId: listingData.campus || api.campuses.getSelectedCampus(),
                    phoneNumber: listingData.sellerPhone,
                    roomNumber: listingData.sellerRoom,
                    imageUrl: listingData.image
                }
            });

            const newListing = {
                id: res.data?.id || ("m-" + Date.now()),
                category: "marketplace",
                dateListed: "Just now",
                status: "Pending Review",
                isModerated: false,
                image: listingData.image || "https://images.unsplash.com/photo-1534452203293-494d7ddbf7e0?w=600&auto=format&fit=crop&q=80",
                ...listingData
            };

            const customListings = JSON.parse(localStorage.getItem(STORAGE_KEYS.MARKETPLACE_CUSTOM) || "[]");
            customListings.unshift(newListing);
            localStorage.setItem(STORAGE_KEYS.MARKETPLACE_CUSTOM, JSON.stringify(customListings));

            return { success: true, data: newListing };
        }
    },

    // ----------------------------------------------------
    // DELIVERY & ERRANDS (/api/v1/deliveries)
    // ----------------------------------------------------
    delivery: {
        async requestDelivery(deliveryData) {
            const estimatedFee = Number(deliveryData.estimatedFee) || 500;
            const res = await fetchJson('/deliveries', {
                method: 'POST',
                body: {
                    taskType: deliveryData.taskType || 'PARCEL',
                    pickupLocation: deliveryData.pickupLocation,
                    dropoffLocation: deliveryData.dropoffLocation,
                    campusId: deliveryData.campus || api.campuses.getSelectedCampus(),
                    senderPhone: deliveryData.senderPhone,
                    recipientPhone: deliveryData.recipientPhone,
                    notes: deliveryData.description,
                    estimatedFeeKobo: estimatedFee * 100
                }
            });

            const newDelivery = {
                id: res.data?.id || ("DEL-" + Math.floor(10000 + Math.random() * 90000)),
                type: "delivery",
                title: deliveryData.taskType === "errand" ? `Campus Errand: ${(deliveryData.description || '').slice(0, 35)}...` : `Parcel Delivery: ${deliveryData.pickupLocation} to ${deliveryData.dropoffLocation}`,
                vendor: "CLX Express Dispatch",
                campus: deliveryData.campus || api.campuses.getSelectedCampus(),
                total: estimatedFee,
                status: "Requested",
                statusStep: 1,
                date: "Just now",
                fulfillment: `${deliveryData.pickupLocation} → ${deliveryData.dropoffLocation}`
            };

            const userOrders = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || "[]");
            userOrders.unshift(newDelivery);
            localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(userOrders));

            return { success: true, data: newDelivery };
        },
        async list() {
            const res = await fetchJson('/deliveries');
            if (res.success && Array.isArray(res.data)) {
                return res;
            }
            return { success: true, data: [] };
        }
    },

    // ----------------------------------------------------
    // CART (/api/v1/cart)
    // ----------------------------------------------------
    cart: {
        async get() {
            const res = await fetchJson('/cart');
            if (res.success && res.data) {
                return res;
            }
            const localItems = JSON.parse(localStorage.getItem(STORAGE_KEYS.CART) || "[]");
            return { success: true, data: { items: localItems, itemCount: localItems.length } };
        },
        async addItem(productId, quantity = 1) {
            const res = await fetchJson('/cart/items', {
                method: 'POST',
                body: { productId, quantity }
            });
            return res;
        },
        async updateItem(itemId, quantity) {
            const res = await fetchJson(`/cart/items/${itemId}`, {
                method: 'PATCH',
                body: { quantity }
            });
            return res;
        },
        async removeItem(itemId) {
            const res = await fetchJson(`/cart/items/${itemId}`, {
                method: 'DELETE'
            });
            return res;
        },
        async clear() {
            const res = await fetchJson('/cart', {
                method: 'DELETE'
            });
            localStorage.setItem(STORAGE_KEYS.CART, "[]");
            return res;
        }
    },

    // ----------------------------------------------------
    // PAYMENTS (/api/v1/payments)
    // ----------------------------------------------------
    payments: {
        async initialize(orderId, paymentMethod = 'CARD', provider = 'GENERIC') {
            return fetchJson('/payments/initialize', {
                method: 'POST',
                body: { orderId, paymentMethod, provider }
            });
        },
        async confirmCashOnDelivery(orderId) {
            return fetchJson('/payments/cash-on-delivery', {
                method: 'POST',
                body: { orderId }
            });
        },
        async getForOrder(orderId) {
            return fetchJson(`/payments/orders/${encodeURIComponent(orderId)}`);
        },
        async getById(paymentId) {
            return fetchJson(`/payments/${encodeURIComponent(paymentId)}`);
        }
    },

    // ----------------------------------------------------
    // ORDERS (/api/v1/orders)
    // ----------------------------------------------------
    orders: {
        async list() {
            const res = await fetchJson('/orders');
            if (res.success && Array.isArray(res.data?.orders)) {
                const normalized = res.data.orders.map(normalizeOrder);
                return { success: true, data: normalized };
            }

            if (!res.success) return res;

            const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || "null");
            if (!stored) {
                localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(INITIAL_ORDERS));
                return { success: true, data: INITIAL_ORDERS };
            }
            return { success: true, data: stored };
        },
        async getById(id) {
            const res = await fetchJson(`/orders/${id}`);
            if (res.success && res.data) {
                return { success: true, data: normalizeOrder(res.data.order || res.data) };
            }
            if (!res.success) return res;
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || "[]");
            const found = stored.find(o => o.id === id);
            return found ? { success: true, data: found } : { success: false, message: "Order not found" };
        },
        async create(orderData) {
            const res = await fetchJson('/orders', {
                method: 'POST',
                body: {
                    deliveryAddress: orderData.deliveryAddress,
                    phoneNumber: orderData.phone,
                    paymentMethod: orderData.paymentMethod || 'CASH_ON_DELIVERY',
                    notes: orderData.notes,
                    type: orderData.type
                }
            });

            if (!res.success) return res;

            const newOrder = normalizeOrder(res.data?.order || res.data);

            const userOrders = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || JSON.stringify(INITIAL_ORDERS));
            userOrders.unshift(newOrder);
            localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(userOrders));

            return { success: true, data: newOrder };
        }
    },

    // ----------------------------------------------------
    // NOTIFICATIONS (/api/v1/notifications)
    // ----------------------------------------------------
    notifications: {
        async list() {
            const res = await fetchJson('/notifications');
            if (res.success && Array.isArray(res.data)) {
                return res;
            }
            return {
                success: true,
                data: [
                    { id: 'notif-1', title: 'Welcome to CLX', body: 'Discover verified campus food, shopping, services and deliveries!', read: false, createdAt: new Date().toISOString() }
                ]
            };
        },
        async getUnreadCount() {
            const res = await fetchJson('/notifications/unread-count');
            if (res.success && res.data?.count !== undefined) {
                return res.data.count;
            }
            return 1;
        },
        async markAsRead(id) {
            return fetchJson(`/notifications/${id}/read`, { method: 'PATCH' });
        },
        async markAllAsRead() {
            return fetchJson('/notifications/read-all', { method: 'PATCH' });
        }
    },

    // ----------------------------------------------------
    // ADMIN & MODERATION (/api/v1/admin)
    // ----------------------------------------------------
    admin: {
        async getSummary() {
            return fetchJson('/admin/summary');
        },
        async getAuditLogs(params = {}) {
            const q = new URLSearchParams(params).toString();
            return fetchJson(`/admin/audit-logs${q ? `?${q}` : ''}`);
        }
    },

    // ----------------------------------------------------
    // GLOBAL SEARCH (/api/v1/search)
    // ----------------------------------------------------
    search: {
        async global(query, campusId) {
            if (!query || query.trim().length === 0) {
                return { products: [], services: [], vendors: [], marketplace: [] };
            }
            const q = query.toLowerCase().trim();
            const campus = campusId || api.campuses.getSelectedCampus();

            const [pRes, sRes, vRes, mRes] = await Promise.all([
                api.products.list({ search: q, campus }),
                api.services.list({ search: q, campus }),
                api.vendors.list({ search: q, campus }),
                api.marketplace.list({ search: q, campus })
            ]);

            return {
                products: pRes.data || [],
                services: sRes.data || [],
                vendors: vRes.data || [],
                marketplace: mRes.data || []
            };
        }
    }
};
