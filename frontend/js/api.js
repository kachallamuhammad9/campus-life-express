import { isRefundOrder } from './order-refunds.js';
/**
 * Campus Life Express (CLX 2.0) - Production API Client Layer
 * Supabase-first MVP client layer. Retired Express endpoints are inert.
 */

import { CAMPUSES, CATEGORIES, VENDORS, PRODUCTS, SERVICES, MARKETPLACE_LISTINGS, INITIAL_ORDERS } from './data.js';
import { getSupabaseClient, supabaseQuery } from './supabase.js';
// Phase 1 live Supabase catalogue layer with controlled static browsing fallback.
import * as catalogue from './catalogue.js';

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
        subcategory: m.subcategory_name || m.subcategory || m.fallbackSubcategory || "Electronics",
        price: priceNaira,
        price_kobo: priceNaira * 100,
        condition: m.condition || "Used - Good",
        sellerName: m.seller_name || m.sellerName || "Verified Student",
        sellerDept: m.seller_department || m.sellerDept || "",
        sellerPhone: m.seller_phone || m.sellerPhone || "08012345678",
        contactPhone: m.seller_contact_phone || m.contactPhone || m.seller_phone || m.sellerPhone || "",
        sellerRoom: m.seller_room || m.sellerRoom || "Hostel A, Rm 14",
        campus: (m.campus_slug || m.campus || "unimaid").toLowerCase(),
        dateListed: m.date_listed || m.dateListed || "Recently",
        status: m.status || "Active",
        image: m.primary_image_url || m.image_url || m.image || "https://images.unsplash.com/photo-1534452203293-494d7ddbf7e0?w=600&auto=format&fit=crop&q=80",
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

export function customerProgressForOrder(order) {
    const status = String(order?.status || 'ORDER_RECEIVED');
    if (isRefundOrder(status)) return { steps: [status === 'REFUNDED' ? 'Refunded' : 'Refund Pending'], currentStep: 1, isComplete: false, isRefund: true };
    if (status === 'CANCELLED') return { steps: ['Cancelled'], currentStep: 1, isComplete: false, isCancelled: true };
    const delivery = Array.isArray(order?.delivery_requests) ? order.delivery_requests[0] : order?.delivery_requests;
    const deliveryStatus = String(order?.delivery_status || delivery?.status || '');
    const isPickup = order?.fulfillment_type === 'PICKUP';
    const steps = isPickup
        ? ['Submitted', 'Confirmed', 'Preparing', 'Ready for Pickup', 'Completed']
        : ['Submitted', 'Confirmed', 'Preparing', 'Out for Delivery', 'Completed'];
    let currentStep = 1;
    if (['PAYMENT_CONFIRMED', 'ORDER_CONFIRMED'].includes(status)) currentStep = 2;
    if (status === 'PREPARING') currentStep = 3;
    if (isPickup && ['READY_FOR_PICKUP', 'READY'].includes(status)) currentStep = 4;
    if (!isPickup && ['READY_FOR_DISPATCH', 'RIDER_ASSIGNED'].includes(status)) currentStep = 3;
    // "Out for Delivery" is a transport milestone, not a rider-pickup milestone.
    // Keep the legacy parent status fallback so historic orders remain readable.
    if (!isPickup && (deliveryStatus === 'IN_TRANSIT' || status === 'OUT_FOR_DELIVERY')) currentStep = 4;
    if (['DELIVERED', 'COMPLETED'].includes(status)) currentStep = 5;
    return { steps, currentStep, isComplete: status === 'COMPLETED' };
}

export function customerStatusForOrder(order) {
    const status = String(order?.status || 'ORDER_RECEIVED');
    if (isRefundOrder(status)) return status === 'REFUNDED' ? 'Refunded' : 'Refund Pending';
    const delivery = Array.isArray(order?.delivery_requests) ? order.delivery_requests[0] : order?.delivery_requests;
    const deliveryStatus = String(order?.delivery_status || delivery?.status || '');
    if (order?.fulfillment_type === 'DELIVERY') {
        if (status === 'COMPLETED') return 'Completed';
        if (status === 'DELIVERED' || deliveryStatus === 'DELIVERED') return 'Delivered';
        if (deliveryStatus === 'IN_TRANSIT' || status === 'OUT_FOR_DELIVERY') return 'Out for Delivery';
        if (['READY_FOR_DISPATCH', 'RIDER_ASSIGNED'].includes(status) || ['REQUESTED', 'ACCEPTED', 'PICKED_UP'].includes(deliveryStatus)) return 'Ready for Dispatch';
    }
    return status.split('_').map((word) => word[0] + word.slice(1).toLowerCase()).join(' ');
}

/**
 * Retained legacy API surface. It intentionally performs no network request:
 * the MVP uses public Supabase catalogue reads and customer-order RPCs only.
 */
async function fetchJson(endpoint, options = {}) {
    return { success: false, status: 410, error: { code: 'RETIRED_API', message: 'This legacy CLX feature is not available in the current MVP.' }, data: null };
}

// Customer-order cards deliberately use the public CLX reference, never the
// database UUID. Vendor names are taken from the live vendor relation when it
// is available, with the immutable checkout snapshot as a historical fallback.
export function mapCustomerOrder(order) {
    const payment = Array.isArray(order.customer_order_payments) ? order.customer_order_payments[0] : order.customer_order_payments;
    const vendorOrders = Array.isArray(order.orders) ? order.orders : [];
    const vendorGroups = vendorOrders.map((vendorOrder) => {
        const items = (vendorOrder.order_items || []).map((item) => ({
            name: item.product_name_snapshot || 'Item',
            quantity: Number(item.quantity || 0),
            unitPriceKobo: Number(item.unit_price_kobo || 0),
            lineTotalKobo: Number(item.total_price_kobo || 0),
            vendorName: item.vendor_name_snapshot || vendorOrder.vendor?.name || 'Vendor'
        }));
        return { vendorName: vendorOrder.vendor?.name || items[0]?.vendorName || 'Vendor', items };
    });
    const items = vendorGroups.flatMap((group) => group.items);
    const vendorNames = [...new Set(vendorOrders.flatMap((vendorOrder) => {
        const liveName = String(vendorOrder.vendor?.name || '').trim();
        const snapshotNames = (vendorOrder.order_items || []).map((item) => item.vendor_name_snapshot);
        return (liveName ? [liveName] : snapshotNames)
            .map((name) => String(name || '').trim())
            .filter(Boolean);
    }))];
    const orderNumber = String(order.order_number || '').trim();
    const delivery = Array.isArray(order.delivery_requests) ? order.delivery_requests[0] : order.delivery_requests;
    const customerOrder = { ...order, delivery_status: delivery?.status || null };
    const progress = customerProgressForOrder(customerOrder);
    return {
        // The UUID remains in state only for authenticated payment lookups.
        id: order.id,
        orderNumber: orderNumber || null,
        referenceLabel: orderNumber ? `Order #${orderNumber}` : 'Order details',
        type: 'order',
        title: items.length === 1 ? items[0].name : `${items.length} items`,
        vendor: vendorNames.length ? vendorNames.join(' • ') : 'Vendor details unavailable',
        total: Number(order.total_kobo || 0) / 100,
        status: customerStatusForOrder(customerOrder),
        rawStatus: order.status,
        statusStep: progress.currentStep,
        progressSteps: progress.steps,
        progressComplete: progress.isComplete,
        date: order.created_at ? new Date(order.created_at).toLocaleDateString() : '',
        fulfillment: order.fulfillment_type === 'PICKUP' ? 'Pickup' : 'Delivery',
        paymentMethod: payment?.payment_method || 'Payment method unavailable',
        paymentStatus: payment ? payment.status : 'Payment status unavailable',
        refund: order.refund ? { status: order.refund.status, reason: order.refund.reason, amount_kobo: order.refund.amount_kobo, requested_at: order.refund.requested_at, confirmed_at: order.refund.confirmed_at } : null,
        cancellationReason: order.cancellation_reason || null,
        cancelledAt: order.cancelled_at || null,
        vendorOrders,
        vendorGroups,
        items
    };
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
            // 1) Live Supabase (preferred)
            const sb = await catalogue.fetchCampuses();
            if (sb.success && Array.isArray(sb.data) && sb.data.length > 0) return sb;
            // 2) Express backend
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
            const live = await supabaseQuery(
                (sb) => sb.from('delivery_zones')
                    .select('id, name, base_delivery_fee_kobo, campus_id, is_active')
                    .eq('campus_id', campusId)
                    .eq('is_active', true)
                    .order('name'),
                'delivery_zones.list'
            );
            if (live.success) return { success: true, source: 'supabase', data: live.data || [] };
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
            // 1) Live Supabase (preferred)
            const sb = await catalogue.fetchCategories();
            if (sb.success && Array.isArray(sb.data) && sb.data.length > 0) return sb;
            // 2) Express backend
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
            // 1) Live Supabase (preferred)
            const sb = await catalogue.fetchVendors(filters);
            if (sb.success && Array.isArray(sb.data)) return sb;

            // 2) Express backend
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
            // 1) Live Supabase (preferred)
            const sb = await catalogue.fetchProducts({ vendorId });
            if (sb.success && Array.isArray(sb.data)) return sb;
            // 2) Express backend
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
            // 1) Live Supabase (preferred)
            const sb = await catalogue.fetchProducts(filters);
            if (sb.success && Array.isArray(sb.data)) return sb;
            // 2) Express backend
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

            // ----------------------------------------------------------
            // 3) Controlled static fallback (development only).
            // Never mixed with Supabase results — this branch only runs
            // when BOTH Supabase and the Express backend are unavailable.
            // ----------------------------------------------------------
            let fallbackList = PRODUCTS.filter(p => !filters.campus || (p.campus || "unimaid") === String(filters.campus).toLowerCase());
            if (filters.category && filters.category !== "all") {
                fallbackList = fallbackList.filter(p => (p.category || p.categorySlug || "").toLowerCase() === String(filters.category).toLowerCase());
            }
            if (filters.subcategory && filters.subcategory !== "all") {
                fallbackList = fallbackList.filter(p => (p.subcategory || "").toLowerCase() === filters.subcategory.toLowerCase());
            }
            if (filters.search) {
                const search = filters.search.toLowerCase();
                fallbackList = fallbackList.filter(p => `${p.name} ${p.description || ""} ${p.vendorName}`.toLowerCase().includes(search));
            }
            console.warn("[CLX] Live catalogue unavailable — serving controlled static fallback products (development mode).");
            return { success: true, source: "fallback", data: fallbackList, count: fallbackList.length };
        },
        async getById(id) {
            // 1) Live Supabase (preferred)
            const sb = await catalogue.fetchProducts({});
            if (sb.success && Array.isArray(sb.data)) {
                const found = sb.data.find(p => p.id === String(id));
                if (found) return { success: true, data: found };
            }
            // 2) Express backend
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

            // Standalone service requests are deferred; browse the controlled catalogue.
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
            const deliveryTypes = { pickup: 'PICKUP', 'hostel-pickup': 'DELIVERY' };
            const deliveryType = deliveryTypes[serviceRequest.deliveryType] || String(serviceRequest.deliveryType || 'PICKUP').toUpperCase();
            const backendRes = await fetchJson(`/services/${encodeURIComponent(serviceRequest.serviceId)}/requests`, {
                method: 'POST',
                body: {
                    serviceId: serviceRequest.serviceId,
                    deliveryType,
                    customerLocation: serviceRequest.location || serviceRequest.deliveryLocation || serviceRequest.room,
                    description: serviceRequest.description || serviceRequest.notes || serviceRequest.customerInfo,
                    notes: serviceRequest.instructions || serviceRequest.notes,
                    estimatedBudgetKobo: (serviceRequest.estimatedPrice || 1000) * 100,
                    preferredDate: serviceRequest.preferredDate || undefined
                }
            });

            if (!backendRes.success) return backendRes;

            // Maintain local storage sync for unified tracking & orders view
            const userRequests = JSON.parse(localStorage.getItem(STORAGE_KEYS.SERVICE_REQUESTS) || "[]");
            const newRequest = {
                ...(backendRes.data || {}),
                id: backendRes.data?.id,
                type: "service",
                status: backendRes.data?.status || "SUBMITTED",
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
            const subcategorySlugs = {
                "Used Textbooks": "marketplace-used-textbooks",
                "Electronics & Gadgets": "marketplace-used-electronics",
                "Furniture": "marketplace-furniture",
                "Hostel Items": "marketplace-hostel-items"
            };
            if (filters.subcategory && filters.subcategory !== "all") params.append('categoryId', subcategorySlugs[filters.subcategory] || filters.subcategory);
            if (filters.condition && filters.condition !== "all") params.append('condition', filters.condition.replace(/\s+/g, '_').toUpperCase());
            if (filters.search) params.append('search', filters.search);

            const queryString = params.toString() ? `?${params.toString()}` : '';
            const res = await fetchJson(`/marketplace${queryString}`);

            const customListings = JSON.parse(localStorage.getItem(STORAGE_KEYS.MARKETPLACE_CUSTOM) || "[]");

            if (res.success && Array.isArray(res.data)) {
                const combined = [...customListings, ...res.data.map(listing => normalizeMarketplace({
                    ...listing,
                    fallbackSubcategory: filters.subcategory !== "all" ? filters.subcategory : undefined
                }))];
                return { success: true, data: combined, count: combined.length };
            }

            // Marketplace browsing remains available from controlled local data.
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
            const campusResponse = await fetchJson('/campuses');
            const campus = campusResponse.data?.find(item => item.slug === (listingData.campus || api.campuses.getSelectedCampus()) || item.id === listingData.campus);
            const categoryResponse = await fetchJson('/categories');
            const marketplaceCategory = categoryResponse.data?.find(item => item.slug === 'marketplace');
            const subcategorySlugs = {
                "Used Textbooks": "marketplace-used-textbooks",
                "Electronics & Gadgets": "marketplace-used-electronics",
                "Furniture": "marketplace-furniture",
                "Hostel Items": "marketplace-hostel-items",
                "Fashion": "marketplace-student-sales"
            };
            const subcategories = marketplaceCategory?.subcategories || [];
            const subcategory = subcategories.find(item => item.slug === subcategorySlugs[listingData.subcategory]);
            const res = await fetchJson('/marketplace', {
                method: 'POST',
                body: {
                    title: listingData.title,
                    description: listingData.description,
                    priceKobo: priceNaira * 100,
                    condition: (listingData.condition || 'GOOD').replace(/\s+/g, '_').toUpperCase(),
                    campusId: campus?.id || listingData.campus,
                    categoryId: marketplaceCategory?.id || listingData.categoryId,
                    subcategoryId: subcategory?.id || ( /^[0-9a-f-]{36}$/i.test(listingData.subcategoryId || '') ? listingData.subcategoryId : undefined),
                    sellerDepartment: listingData.sellerDept,
                    sellerContactPhone: listingData.contactPhone,
                    images: listingData.image ? [listingData.image] : []
                }
            });

            if (!res.success) return res;

            const newListing = {
                id: res.data?.id,
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
            const taskTypes = { parcel: 'DELIVERY', pickup: 'VENDOR_PICKUP', errand: 'ERRAND' };
            const res = await fetchJson('/deliveries', {
                method: 'POST',
                body: {
                    taskType: taskTypes[deliveryData.taskType] || deliveryData.taskType,
                    pickupLocation: deliveryData.pickupLocation,
                    dropoffLocation: deliveryData.dropoffLocation,
                    campusId: deliveryData.campus || api.campuses.getSelectedCampus(),
                    description: deliveryData.description,
                    urgency: deliveryData.urgency,
                    notes: deliveryData.notes
                }
            });

            if (!res.success) return res;

            const newDelivery = res.data?.delivery || res.data;

            return { success: true, data: newDelivery };
        },
        async list() {
            const res = await fetchJson('/deliveries');
            if (res.success && Array.isArray(res.data?.deliveries)) {
                return { success: true, data: res.data.deliveries, count: res.data.deliveries.length };
            }
            if (!res.success) return res;
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
        async initialize(orderId, paymentMethod = 'CARD', provider = 'PAYSTACK') {
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
        async listCustomerOrders(userId) {
            const client = getSupabaseClient();
            if (!client || !userId) return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Please sign in to view your orders.' } };
            const result = await supabaseQuery(
                (sb) => sb.from('customer_orders')
                    .select('id,order_number,fulfillment_type,total_kobo,status,created_at,delivery_location,cancellation_reason,cancelled_at,customer_order_payments(payment_method,status),delivery_requests(status),orders(id,status,vendor_group_number,vendor:vendors(name),order_items(product_name_snapshot,vendor_name_snapshot,quantity,unit_price_kobo,total_price_kobo,currency_code))')
                    .eq('customer_user_id', userId)
                    .order('created_at', { ascending: false }),
                'customer_orders.list'
            );
            if (!result.success) return result;
            const rows = result.data || [];
            const references = rows.filter(order => isRefundOrder(order.status)).map(order => order.order_number);
            const refunds = new Map();
            for (let offset = 0; offset < references.length; offset += 200) {
                const response = await supabaseQuery(sb => sb.rpc('get_customer_order_refunds', { p_order_numbers: references.slice(offset, offset + 200) }), 'customer_orders.refunds');
                if (!response.success) return response;
                for (const entry of response.data || []) refunds.set(entry.order_number, entry.refund);
            }
            return { success: true, source: 'supabase', data: rows.map(order => mapCustomerOrder({ ...order, refund: refunds.get(order.order_number) || null })) };
        },
        async getCheckoutCampus(campusRef) {
            const live = await supabaseQuery(
                (sb) => sb.from('campuses').select('id, slug, name, short_name').eq('slug', campusRef).eq('is_active', true).maybeSingle(),
                'checkout.campus'
            );
            return live.success && live.data
                ? { success: true, data: live.data }
                : { success: false, error: live.error || { message: 'The selected campus is unavailable.' } };
        },
        async createCustomerOrder(order) {
            const client = getSupabaseClient();
            if (!client) {
                return { success: false, error: { code: 'SUPABASE_UNAVAILABLE', message: 'Secure checkout is unavailable. Your cart has not been changed.' } };
            }
            const result = await supabaseQuery(
                (sb) => sb.rpc('create_customer_order_v2', {
                    p_items: order.items,
                    p_campus_id: order.campusId,
                    p_fulfillment_type: order.fulfillmentType,
                    p_customer_name: order.customerName,
                    p_customer_phone: order.customerPhone,
                    p_payment_method: order.paymentMethod,
                    p_idempotency_key: order.idempotencyKey,
                    p_tracking_token: order.trackingToken,
                    p_delivery_location: order.deliveryLocation,
                    p_delivery_zone_id: order.deliveryZoneId,
                    p_nearest_landmark: order.nearestLandmark,
                    p_notes: order.notes
                }),
                'customer_order.create'
            );
            if (!result.success) return result;
            if (!result.data?.success) {
                return { success: false, data: result.data, error: { code: result.data?.code || 'ORDER_REJECTED', message: result.data?.message || 'We could not place your order.' } };
            }
            return { success: true, data: result.data };
        },
        async trackCustomerOrder(orderNumber, trackingToken) {
            const client = getSupabaseClient();
            if (!client) return { success: false, error: { code: 'SUPABASE_UNAVAILABLE', message: 'Order tracking is unavailable.' } };
            const result = await supabaseQuery(
                (sb) => sb.rpc('get_customer_order_tracking', { p_order_number: orderNumber, p_tracking_token: trackingToken }),
                'customer_order.track'
            );
            if (!result.success) return result;
            return result.data?.success
                ? { success: true, data: result.data }
                : { success: false, data: result.data, error: { code: 'ORDER_NOT_FOUND', message: 'Order not found. Please check your tracking details.' } };
        },
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
            if (res.success && Array.isArray(res.data?.notifications)) {
                return { success: true, data: res.data.notifications, unreadCount: res.data.unreadCount };
            }
            if (!res.success) return res;
            return {
                success: true,
                data: []
            };
        },
        async getUnreadCount() {
            const res = await fetchJson('/notifications/unread-count');
            if (res.success && res.data?.unreadCount !== undefined) {
                return { success: true, data: res.data.unreadCount };
            }
            return res.success ? { success: true, data: 0 } : res;
        },
        async markAsRead(id) {
            return fetchJson(`/notifications/${id}/read`, { method: 'PATCH' });
        },
        async markAllAsRead() {
            return fetchJson('/notifications/read-all', { method: 'PATCH' });
        },
        async delete(id) {
            return fetchJson(`/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
        }
    },

    // ----------------------------------------------------
    // ADMIN & MODERATION (/api/v1/admin)
    // ----------------------------------------------------
    admin: {
        async getSummary() {
            return fetchJson('/admin/stats');
        },
        async getAuditLogs(params = {}) {
            const q = new URLSearchParams(params).toString();
            return fetchJson(`/admin/audit-logs${q ? `?${q}` : ''}`);
        },
        async listMarketplaceListings(params = {}) {
            const q = new URLSearchParams(params).toString();
            return fetchJson(`/admin/marketplace/listings${q ? `?${q}` : ''}`);
        },
        async moderateMarketplaceListing(id, status, reason = '') {
            return fetchJson(`/admin/marketplace/listings/${encodeURIComponent(id)}/moderate`, {
                method: 'POST',
                body: { status, rejectionReason: reason }
            });
        },
        async listVendors(params = {}) {
            const q = new URLSearchParams(params).toString();
            return fetchJson(`/admin/vendors${q ? `?${q}` : ''}`);
        },
        async updateVendorStatus(id, status) {
            return fetchJson(`/admin/vendors/${encodeURIComponent(id)}/status`, {
                method: 'PATCH',
                body: { status }
            });
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
