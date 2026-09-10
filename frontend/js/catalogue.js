/**
 * Campus Life Express (CLX) - Live Supabase Catalogue Layer (Phase 1)
 *
 * Reads campuses / categories / vendors / products from Supabase using the
 * browser-safe anon client, and normalizes them into the exact shapes the
 * existing UI and CartManager already consume (camelCase, Naira price,
 * kobo mirror, vendorId/vendorName, campus slug).
 *
 * Source resolution per read:
 *   1. Supabase (live)      — preferred
 *   2. Static data.js seed  — controlled development fallback (never mixed)
 *
 * Uses the ACTUAL project schema (see supabase/migrations):
 *   campuses(id, slug, name, short_name, is_active)
 *   categories(id, parent_id, slug, name, sort_order, is_active)
 *   vendors(id, name, slug, category_id, image_url, status, is_verified, rating, review_count)
 *   vendor_campuses(vendor_id, campus_id, is_active)
 *   products(id, slug, vendor_id, campus_id, category_id, subcategory_id, name,
 *            description, price_kobo, image_url, rating, review_count,
 *            is_popular, is_in_stock, stock_quantity)
 *   product_images(product_id, image_url, is_primary, sort_order)
 *
 * Vendor/product visibility for anonymous catalogue reads is enforced by the
 * existing RLS policies (0015_rls_policies.sql): only ACTIVE vendors and
 * in-stock products are publicly selectable. No policies were changed.
 */

import { isSupabaseConfigured, supabaseQuery } from './supabase.js';

// ------------------------------------------------------------------
// NORMALIZATION (mirrors api.js normalizers so UI code is untouched)
// ------------------------------------------------------------------

const UNSPLASH_FOOD_FALLBACK = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80";
const UNSPLASH_VENDOR_FALLBACK = "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80";

function resolveProductImage(row) {
    // Priority 1: primary product image from product_images
    if (Array.isArray(row.product_images) && row.product_images.length > 0) {
        const sorted = [...row.product_images].sort((a, b) => {
            if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
            return (a.sort_order || 0) - (b.sort_order || 0);
        });
        if (sorted[0]?.image_url) return sorted[0].image_url;
    }
    // Priority 2: direct image_url field on products
    if (row.image_url) return row.image_url;
    // Priority 3: stable CLX fallback
    return UNSPLASH_FOOD_FALLBACK;
}

function normalizeSupabaseProduct(row, campusById, vendorById) {
    if (!row) return null;
    const priceKobo = Number(row.price_kobo || 0);
    const priceNaira = Math.round(priceKobo / 100);
    return {
        id: String(row.id),
        slug: row.slug || "",
        name: row.name || "",
        description: row.description || "",
        price: priceNaira,
        price_kobo: priceKobo,
        priceKobo: priceKobo,
        vendorId: String(row.vendor_id || ""),
        vendorName: vendorById.get(String(row.vendor_id))?.name || "Campus Vendor",
        vendorSlug: vendorById.get(String(row.vendor_id))?.slug || "",
        categoryId: String(row.category_id || ""),
        categoryName: row.categories?.name || "",
        categorySlug: row.categories?.slug || "",
        parentCategorySlug: row.categories?.categories?.slug || "",
        subcategoryId: row.subcategory_id ? String(row.subcategory_id) : "",
        campusId: String(row.campus_id || ""),
        campus: campusById.get(String(row.campus_id))?.slug || "",
        source: 'supabase',
        isLiveProduct: true,
        image: resolveProductImage(row),
        imageUrl: resolveProductImage(row),
        rating: Number(row.rating || 0),
        reviewsCount: Number(row.review_count || 0),
        isPopular: Boolean(row.is_popular),
        available: row.is_in_stock !== undefined ? Boolean(row.is_in_stock) : true,
        isInStock: row.is_in_stock !== undefined ? Boolean(row.is_in_stock) : true,
        stockQuantity: row.stock_quantity ?? null,
        // pickup/delivery availability is not modeled per-product in the schema
        // (vendor_campuses.is_active governs campus serviceability) — not invented.
        pickupAvailable: null,
        deliveryAvailable: null
    };
}

function normalizeSupabaseVendor(row) {
    if (!row) return null;
    const campuses = (row.vendor_campuses || [])
        .filter(vc => vc.is_active && vc.campuses?.is_active)
        .map(vc => vc.campuses.slug);
    return {
        id: String(row.id),
        name: row.name || "",
        slug: row.slug || "",
        categoryId: String(row.category_id || ""),
        categorySlug: row.categories?.slug || "",
        campus: campuses[0] || "unimaid",
        campuses,
        image: row.image_url || UNSPLASH_VENDOR_FALLBACK,
        imageUrl: row.image_url || null,
        description: row.description || "",
        location: row.location || "",
        rating: Number(row.rating || 0),
        reviewsCount: Number(row.review_count || 0),
        verified: Boolean(row.is_verified),
        status: row.status || "ACTIVE",
        isOpen: row.status === "ACTIVE"
    };
}

function normalizeSupabaseCategory(row) {
    if (!row) return null;
    return {
        id: String(row.id),
        legacyKey: row.legacy_key || row.slug,
        slug: row.slug,
        name: row.name,
        description: row.description || "",
        icon: row.icon || "",
        imageUrl: row.image_url || null,
        sortOrder: Number(row.sort_order || 0),
        parentId: row.parent_id ? String(row.parent_id) : null,
        isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
        subcategories: (row.categories || []).map(c => normalizeSupabaseCategory(c))
    };
}

// ------------------------------------------------------------------
// SUPABASE READS
// ------------------------------------------------------------------

export async function fetchCampuses() {
    const res = await supabaseQuery(
        (sb) => sb.from('campuses').select('id, legacy_key, slug, name, short_name, location, is_active').eq('is_active', true).order('sort_order', { ascending: true }),
        'campuses.list'
    );
    if (!res.success) return res;
    return {
        success: true,
        source: 'supabase',
        data: (res.data || []).map(c => ({
            id: c.slug,
            campusId: String(c.id),
            name: c.name,
            shortName: c.short_name,
            location: c.location || "",
            isActive: Boolean(c.is_active)
        }))
    };
}

export async function fetchCategories() {
    // Root categories with their subcategories, active only.
    const res = await supabaseQuery(
        (sb) => sb.from('categories')
            .select('id, legacy_key, parent_id, slug, name, description, icon, image_url, sort_order, is_active, categories(id, legacy_key, parent_id, slug, name, description, icon, image_url, sort_order, is_active)')
            .is('parent_id', null)
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
        'categories.list'
    );
    if (!res.success) return res;
    return { success: true, source: 'supabase', data: (res.data || []).map(normalizeSupabaseCategory) };
}

export async function fetchVendors(filters = {}) {
    const res = await supabaseQuery(
        (sb) => {
            let q = sb.from('vendors')
                .select('id, name, slug, category_id, location, description, image_url, status, is_verified, rating, review_count, categories(slug, name), vendor_campuses(is_active, campuses(id, slug, name, is_active))')
                .eq('status', 'ACTIVE'); // only eligible vendors (mirrors RLS intent)
            if (filters.campus) q = q.eq('vendor_campuses.campuses.slug', filters.campus);
            if (filters.category && filters.category !== 'all') q = q.eq('categories.slug', filters.category);
            return q;
        },
        'vendors.list'
    );
    if (!res.success) return res;
    let vendors = (res.data || []).map(normalizeSupabaseVendor);
    if (filters.search) {
        const s = filters.search.toLowerCase();
        vendors = vendors.filter(v => `${v.name} ${v.description}`.toLowerCase().includes(s));
    }
    return { success: true, source: 'supabase', data: vendors, count: vendors.length };
}

export async function fetchProducts(filters = {}) {
    const campusesResult = await supabaseQuery(
        (sb) => sb.from('campuses').select('id, slug, is_active').eq('is_active', true),
        'products.campuses'
    );
    if (!campusesResult.success) return campusesResult;
    const campusById = new Map((campusesResult.data || []).map((campus) => [String(campus.id), campus]));
    const selectedCampus = filters.campus
        ? (campusesResult.data || []).find((campus) => campus.slug === filters.campus)
        : null;
    if (filters.campus && !selectedCampus) return { success: true, source: 'supabase', data: [], count: 0 };

    const vendorCampusesResult = await supabaseQuery(
        (sb) => {
            let query = sb.from('vendor_campuses').select('vendor_id, campus_id').eq('is_active', true);
            if (selectedCampus) query = query.eq('campus_id', selectedCampus.id);
            return query;
        },
        'products.vendor_campuses'
    );
    if (!vendorCampusesResult.success) return vendorCampusesResult;
    const activeVendorCampusPairs = new Set((vendorCampusesResult.data || []).map((row) => `${row.vendor_id}:${row.campus_id}`));

    const vendorsResult = await supabaseQuery(
        (sb) => sb.from('vendors').select('id, name, slug, status').eq('status', 'ACTIVE'),
        'products.vendors'
    );
    if (!vendorsResult.success) return vendorsResult;
    const vendorById = new Map((vendorsResult.data || []).map((vendor) => [String(vendor.id), vendor]));

    const productsResult = await supabaseQuery(
        (sb) => {
            let query = sb.from('products')
                .select('id, slug, name, description, price_kobo, image_url, rating, review_count, is_popular, is_in_stock, stock_quantity, vendor_id, campus_id, category_id, subcategory_id, categories!products_category_id_fkey(name, slug, categories(parent_id, slug, name)), product_images(image_url, is_primary, sort_order)');
            if (selectedCampus) query = query.eq('campus_id', selectedCampus.id);
            if (filters.vendorId) query = query.eq('vendor_id', filters.vendorId);
            return query;
        },
        'products.list'
    );
    if (!productsResult.success) return productsResult;

    let list = (productsResult.data || [])
        .filter((product) => activeVendorCampusPairs.has(`${product.vendor_id}:${product.campus_id}`) && vendorById.has(String(product.vendor_id)))
        .map((product) => normalizeSupabaseProduct(product, campusById, vendorById))
        .filter(Boolean);

    // Client-side category filter: product category or any of its parents
    if (filters.category && filters.category !== 'all') {
        const target = String(filters.category).toLowerCase();
        list = list.filter(p => p.categorySlug === target || p.parentCategorySlug === target);
    }
    if (filters.inStock !== undefined) {
        list = list.filter(p => p.isInStock === Boolean(filters.inStock));
    }
    if (filters.search) {
        const s = String(filters.search).toLowerCase();
        list = list.filter(p => `${p.name} ${p.description} ${p.vendorName}`.toLowerCase().includes(s));
    }
    if (filters.subcategory && filters.subcategory !== 'all') {
        list = list.filter(p => (p.categoryName || "").toLowerCase() === String(filters.subcategory).toLowerCase());
    }
    if (filters.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    else if (filters.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    else if (filters.sort === 'rating') list.sort((a, b) => b.rating - a.rating);
    else list.sort((a, b) => b.isPopular - a.isPopular); // stable, popular-first default

    return { success: true, source: 'supabase', data: list, count: list.length };
}

export const catalogueSource = isSupabaseConfigured ? 'supabase' : 'fallback';
