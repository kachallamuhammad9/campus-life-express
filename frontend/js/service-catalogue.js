import { getSupabaseClient } from './supabase.js';

export const SERVICE_PLACEHOLDER = new URL('../images/service-placeholder.svg', import.meta.url).href;
export function servicePriceLabel(type, kobo) {
    const amount = kobo == null ? null : Number(kobo);
    const valid = Number.isSafeInteger(amount) && amount > 0 && amount <= 999999999;
    const money = valid ? new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: amount % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(amount / 100) : null;
    if (type === 'QUOTE') return money ? `Request quote · indicative ${money}` : 'Request quote';
    if (!money) return 'Contact CLX for pricing';
    return type === 'STARTING_FROM' ? `From ${money}` : type === 'FIXED' ? money : 'Contact CLX for pricing';
}
export function serviceImage(url) {
    if (typeof url !== 'string' || url.length > 2048 || /[\s\\]/.test(url) || /%(?![a-f\d]{2})/i.test(url)) return SERVICE_PLACEHOLDER;
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname && !parsed.username && !parsed.password ? parsed.href : SERVICE_PLACEHOLDER;
    } catch { return SERVICE_PLACEHOLDER; }
}

// RLS is authoritative for anonymous visibility. These explicit checks also prevent
// an admin/provider inspection session from broadening public presentation.
export function normalizePublicServices(rows, context, filters = {}) {
    const vendorMap = new Map(context.vendors.map(v => [v.id, v]));
    const campusMap = new Map(context.campuses.map(c => [c.id, c]));
    const categoryMap = new Map(context.categories.map(c => [c.id, c]));
    const pairs = new Set(context.pairs.filter(p => p.is_active === true).map(p => `${p.vendor_id}:${p.campus_id}`));
    return rows.filter(s => {
        const v = vendorMap.get(s.vendor_id), c = campusMap.get(s.campus_id), cat = categoryMap.get(s.category_id), sub = categoryMap.get(s.subcategory_id);
        return s.is_active === true && v?.status === 'ACTIVE' && v.is_verified === true && c?.is_active === true &&
            pairs.has(`${s.vendor_id}:${s.campus_id}`) && cat?.is_active === true && cat.parent_id === null && cat.slug === 'services' &&
            (s.subcategory_id == null || (sub?.is_active === true && sub.parent_id === s.category_id));
    }).map(s => {
        const v = vendorMap.get(s.vendor_id), c = campusMap.get(s.campus_id), cat = categoryMap.get(s.category_id), sub = categoryMap.get(s.subcategory_id);
        return {
            id: s.id, slug: s.slug, name: s.name, description: s.description || '',
            vendorId: s.vendor_id, providerName: v.name, campusId: c.id, campus: c.slug, campusName: c.name,
            categoryId: cat.id, category: cat.slug, subcategoryId: sub?.id || null, subcategory: sub?.name || 'General', subcategorySlug: sub?.slug || '',
            starting_price_kobo: s.starting_price_kobo, price_type: s.price_type, priceLabel: servicePriceLabel(s.price_type, s.starting_price_kobo),
            image_url: s.image_url, image: serviceImage(s.image_url), turnaround: s.turnaround_time || 'Contact CLX for timing',
            requires_file_upload: s.requires_file_upload, requires_appointment: s.requires_appointment, source: 'supabase'
        };
    }).filter(s => {
        const campus = filters.campus, category = filters.category, sub = filters.subcategory;
        return (!campus || campus === 'all' || campus === s.campus || campus === s.campusId) &&
            (!category || category === 'all' || category === s.category || category === s.categoryId) &&
            (!sub || sub === 'all' || sub === s.subcategorySlug || sub === s.subcategoryId || sub.toLowerCase() === s.subcategory.toLowerCase()) &&
            `${s.name} ${s.description} ${s.providerName} ${s.subcategory}`.toLowerCase().includes(String(filters.search || '').trim().toLowerCase());
    });
}

export async function fetchPublicServices(filters = {}, client = getSupabaseClient()) {
    try {
        if (!client) throw new Error('Not configured');
        const results = await Promise.all([
            client.from('services').select('id,slug,name,description,vendor_id,campus_id,category_id,subcategory_id,starting_price_kobo,price_type,image_url,turnaround_time,requires_file_upload,requires_appointment,is_active').eq('is_active', true).order('name'),
            client.from('vendors').select('id,name,status,is_verified').eq('status','ACTIVE').eq('is_verified',true),
            client.from('campuses').select('id,slug,name,is_active').eq('is_active',true),
            client.from('categories').select('id,slug,name,parent_id,is_active').eq('is_active',true),
            client.from('vendor_campuses').select('vendor_id,campus_id,is_active').eq('is_active',true)
        ]);
        if (results.some(r => r.error || !Array.isArray(r.data))) throw new Error('Read failed');
        const data = normalizePublicServices(results[0].data, { vendors:results[1].data, campuses:results[2].data, categories:results[3].data, pairs:results[4].data }, filters);
        return { success:true, data, count:data.length, source:'supabase' };
    } catch {
        return { success:false, data:[], count:0, error:{ message:'Services are temporarily unavailable. Please try again shortly.' } };
    }
}

export function serviceContactUrl(service) {
    // No internal identities or tokens are included. Clicking opens a draft only.
    const message = `Hello CLX, I would like to enquire about ${service.name} from ${service.providerName} at ${service.campusName}. ${service.priceLabel}.`;
    return 'https://wa.me/2349150736638?text=' + encodeURIComponent(message);
}
