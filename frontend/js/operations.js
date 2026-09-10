/**
 * CLX Phase 4B — Read-Only Operations Data Module
 *
 * Fetches the admin operations queue via DIRECT Supabase SELECTs protected by
 * existing admin RLS policies (customer_orders/orders/order_items are
 * admin-only; campuses/vendors/delivery_zones are public reference data).
 *
 * This module performs ZERO writes: no insert/update/delete/upsert and no RPC.
 * All fetches are gated behind is_admin() by the caller (admin.html Phase 4A).
 */

import { getSupabaseClient } from './supabase.js';

// --- Human-readable labels (database values are never altered) ---

export const ORDER_STATUS_LABELS = {
    ORDER_RECEIVED: 'Order Received',
    AWAITING_PAYMENT: 'Awaiting Payment',
    PAYMENT_CONFIRMED: 'Payment Confirmed',
    ORDER_CONFIRMED: 'Order Confirmed',
    PREPARING: 'Preparing',
    READY_FOR_PICKUP: 'Ready for Pickup',
    READY_FOR_DISPATCH: 'Ready for Dispatch',
    RIDER_ASSIGNED: 'Rider Assigned',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    DELIVERED: 'Delivered',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    PAYMENT_FAILED: 'Payment Failed',
    REFUND_PENDING: 'Refund Pending',
    REFUNDED: 'Refunded'
};

export const PAYMENT_STATUS_LABELS = {
    PENDING: 'Pending',
    AUTHORIZED: 'Authorized',
    PAID: 'Paid',
    FAILED: 'Failed',
    REFUNDED: 'Refunded',
    PARTIALLY_REFUNDED: 'Partially Refunded'
};

export const DELIVERY_STATUS_LABELS = {
    REQUESTED: 'Requested',
    ACCEPTED: 'Accepted',
    PICKED_UP: 'Picked Up',
    IN_TRANSIT: 'In Transit',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled'
};

const FULFILLMENT_LABELS = { PICKUP: 'Pickup', DELIVERY: 'Delivery' };
const PAYMENT_METHOD_LABELS = {
    CASH_ON_DELIVERY: 'Cash on Delivery',
    CARD: 'Card',
    BANK_TRANSFER: 'Bank Transfer'
};

const QA_ORDER_MARKERS = [
    /\b(?:controlled\s+)?phase\s*\d+[a-z0-9.-]*\b[\s\S]{0,80}\b(?:qa|smoke)\s+test\b/i,
    /\b(?:qa|smoke)\s+(?:order|test)\b/i
];

export function isQaOrder(order) {
    const metadata = [order?.customer_name, order?.notes].filter(Boolean).join(' ');
    return QA_ORDER_MARKERS.some((marker) => marker.test(metadata));
}

export function orderStatusLabel(status) {
    return ORDER_STATUS_LABELS[status] || String(status || '').replaceAll('_', ' ').toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown';
}

export function paymentStatusLabel(status) {
    return PAYMENT_STATUS_LABELS[status] || orderStatusLabel(status);
}

export function deliveryStatusLabel(status) {
    return DELIVERY_STATUS_LABELS[status] || orderStatusLabel(status);
}

export function fulfillmentLabel(type) {
    return FULFILLMENT_LABELS[type] || orderStatusLabel(type);
}

export function paymentMethodLabel(method) {
    return PAYMENT_METHOD_LABELS[method] || orderStatusLabel(method);
}

export function formatKobo(kobo) {
    const value = Number(kobo || 0) / 100;
    return `₦${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

// --- Queue filters (Phase 4H, client-side only) ---

export const QUEUE_FILTERS = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'awaiting_payment', label: 'Awaiting Payment', match: (o) => o.payment_status === 'PENDING' && ['ORDER_RECEIVED', 'AWAITING_PAYMENT'].includes(o.status) },
    { id: 'confirmed', label: 'Confirmed', match: (o) => ['ORDER_CONFIRMED', 'PAYMENT_CONFIRMED'].includes(o.status) },
    { id: 'preparing', label: 'Preparing', match: (o) => o.status === 'PREPARING' },
    { id: 'ready', label: 'Ready', match: (o) => ['READY_FOR_PICKUP', 'READY_FOR_DISPATCH', 'RIDER_ASSIGNED'].includes(o.status) },
    { id: 'delivery', label: 'Delivery', match: (o) => o.fulfillment_type === 'DELIVERY' },
    { id: 'completed', label: 'Completed', match: (o) => o.status === 'COMPLETED' },
    { id: 'cancelled', label: 'Cancelled', match: (o) => ['CANCELLED', 'PAYMENT_FAILED', 'REFUND_PENDING', 'REFUNDED'].includes(o.status) }
];

export function filterQueue(orders, filterId, searchText) {
    const filter = QUEUE_FILTERS.find((f) => f.id === filterId) || QUEUE_FILTERS[0];
    const term = String(searchText || '').trim().toLowerCase();
    return orders.filter((o) => {
        if (!filter.match(o)) return false;
        if (!term) return true;
        return o.order_number.toLowerCase().includes(term)
            || o.customer_name.toLowerCase().includes(term)
            || o.vendor_names.join(' ').toLowerCase().includes(term);
    });
}

// --- Safe error context (never logs tokens or customer data) ---

function safeLog(context, error) {
    console.warn(`[CLX Operations] ${context} failed:`, error?.message || 'unknown error');
}

// --- Read-only fetches ---

/**
 * Loads the full operations view for the authenticated admin.
 * Returns { success, orders?, error? }. orders = normalized queue, newest first.
 */
export async function fetchOperationsQueue() {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Supabase is not configured.' };

    try {
        // Parent orders: select only display fields — tracking_token_hash is
        // deliberately NOT requested and never leaves the database.
        const { data: parents, error: pErr } = await supabase
            .from('customer_orders')
            .select(`id, order_number, customer_name, customer_phone, campus_id, fulfillment_type,
                delivery_zone_id, delivery_location, notes, subtotal_kobo, delivery_fee_kobo,
                service_fee_kobo, total_kobo, status, created_at`)
            .order('created_at', { ascending: false })
            .limit(200);
        if (pErr) { safeLog('customer_orders select', pErr); return { success: false, error: 'Unable to load CLX operations data. Please try again.' }; }
        const parentIds = (parents || []).map((o) => o.id);

        const [childrenRes, paymentsRes, deliveriesRes, campusesRes, zonesRes, vendorsRes, ridersRes] = await Promise.all([
            parentIds.length ? supabase.from('orders').select('id, customer_order_id, vendor_id, vendor_group_number, status, subtotal_kobo, total_kobo, type').in('customer_order_id', parentIds) : Promise.resolve({ data: [], error: null }),
            supabase.from('customer_order_payments').select('customer_order_id, payment_method, provider, provider_reference, amount_kobo, status, paid_at').in('customer_order_id', parentIds),
            parentIds.length ? supabase.from('delivery_requests').select('customer_order_id, rider_user_id, rider_id, pickup_location, dropoff_location, estimated_fee_kobo, actual_fee_kobo, status, preferred_at, picked_up_at, delivered_at').in('customer_order_id', parentIds) : Promise.resolve({ data: [], error: null }),
            supabase.from('campuses').select('id, name, short_name'),
            supabase.from('delivery_zones').select('id, name, campus_id'),
            supabase.from('vendors').select('id, name, location'),
            supabase.from('riders').select('id, name, campus_id, is_active, is_available')
        ]);

        if (childrenRes.error) { safeLog('orders select', childrenRes.error); return { success: false, error: 'Unable to load CLX operations data. Please try again.' }; }
        if (paymentsRes.error) { safeLog('payments select', paymentsRes.error); return { success: false, error: 'Unable to load CLX operations data. Please try again.' }; }
        if (deliveriesRes.error) { safeLog('delivery_requests select', deliveriesRes.error); return { success: false, error: 'Unable to load CLX operations data. Please try again.' }; }
        if (campusesRes.error) safeLog('campuses select', campusesRes.error);
        if (zonesRes.error) safeLog('delivery_zones select', zonesRes.error);
        if (vendorsRes.error) safeLog('vendors select', vendorsRes.error);
        if (ridersRes.error) safeLog('riders select', ridersRes.error);

        const children = childrenRes.data || [];
        const childIds = children.map((c) => c.id);

        const itemsRes = childIds.length
            ? await supabase.from('order_items').select('order_id, product_name_snapshot, quantity, unit_price_kobo, total_price_kobo, currency_code').in('order_id', childIds)
            : { data: [], error: null };
        if (itemsRes.error) { safeLog('order_items select', itemsRes.error); return { success: false, error: 'Unable to load CLX operations data. Please try again.' }; }

        const campusById = new Map((campusesRes.data || []).map((c) => [c.id, c]));
        const zoneById = new Map((zonesRes.data || []).map((z) => [z.id, z]));
        const vendorById = new Map((vendorsRes.data || []).map((v) => [v.id, v]));
        const riderById = new Map((ridersRes.data || []).map((r) => [r.id, r]));
        const itemsByOrder = new Map();
        for (const item of itemsRes.data || []) {
            if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
            itemsByOrder.get(item.order_id).push(item);
        }

        const paymentByOrder = new Map((paymentsRes.data || []).map((p) => [p.customer_order_id, p]));
        const deliveryByOrder = new Map((deliveriesRes.data || []).map((d) => [d.customer_order_id, d]));
        const childrenByOrder = new Map();
        for (const child of children) {
            if (!childrenByOrder.has(child.customer_order_id)) childrenByOrder.set(child.customer_order_id, []);
            childrenByOrder.get(child.customer_order_id).push(child);
        }

        const orders = parents.map((parent) => {
            const payment = paymentByOrder.get(parent.id) || null;
            const delivery = deliveryByOrder.get(parent.id) || null;
            const zone = parent.delivery_zone_id ? zoneById.get(parent.delivery_zone_id) : null;
            const campus = campusById.get(parent.campus_id);

            const vendorGroups = (childrenByOrder.get(parent.id) || [])
                .sort((a, b) => (a.vendor_group_number || 0) - (b.vendor_group_number || 0))
                .map((child) => {
                    const vendor = child.vendor_id ? vendorById.get(child.vendor_id) : null;
                    return {
                        id: child.id,
                        status: child.status,
                        status_label: orderStatusLabel(child.status),
                        subtotal_kobo: child.subtotal_kobo,
                        vendor_name: vendor?.name || 'Vendor',
                        vendor_location: vendor?.location || '',
                        items: (itemsByOrder.get(child.id) || []).map((item) => ({
                            product_name: item.product_name_snapshot || 'Product',
                            quantity: item.quantity,
                            unit_price_kobo: item.unit_price_kobo,
                            line_total_kobo: item.total_price_kobo,
                            currency: item.currency_code || 'NGN'
                        }))
                    };
                });

            return {
                id: parent.id, // internal only — never rendered
                campus_id: parent.campus_id, // internal only — used to filter eligible riders
                order_number: parent.order_number,
                created_at: parent.created_at,
                created_label: formatDateTime(parent.created_at),
                customer_name: parent.customer_name,
                customer_phone: parent.customer_phone,
                campus_name: campus?.name || 'Unknown campus',
                fulfillment_type: parent.fulfillment_type,
                fulfillment_label: fulfillmentLabel(parent.fulfillment_type),
                delivery_location: parent.fulfillment_type === 'DELIVERY' ? parent.delivery_location : null,
                delivery_zone_name: zone?.name || null,
                notes: parent.notes || '',
                status: parent.status,
                status_label: orderStatusLabel(parent.status),
                payment_status: payment?.status || 'PENDING',
                payment_status_label: paymentStatusLabel(payment?.status || 'PENDING'),
                payment_method: payment?.payment_method || null,
                payment_method_label: payment?.payment_method ? paymentMethodLabel(payment.payment_method) : null,
                provider_reference: payment?.provider_reference || null,
                subtotal_kobo: parent.subtotal_kobo,
                delivery_fee_kobo: parent.delivery_fee_kobo,
                service_fee_kobo: parent.service_fee_kobo,
                total_kobo: parent.total_kobo,
                vendor_names: vendorGroups.map((g) => g.vendor_name),
                vendor_groups: vendorGroups,
                delivery: delivery ? {
                    status: delivery.status,
                    status_label: deliveryStatusLabel(delivery.status),
                    pickup_location: delivery.pickup_location,
                    dropoff_location: delivery.dropoff_location,
                    estimated_fee_kobo: delivery.estimated_fee_kobo,
                    actual_fee_kobo: delivery.actual_fee_kobo,
                    rider_id: delivery.rider_id,
                    rider_name: riderById.get(delivery.rider_id)?.name || null
                } : null
                // Note: rider_user_id deliberately not exposed (raw UUID, no name resolvable without profiles read)
            };
        });

        return { success: true, orders, riders: ridersRes.data || [], campuses: campusesRes.data || [] };
    } catch (err) {
        safeLog('operations queue', err);
        return { success: false, error: 'Unable to load CLX operations data. Please try again.' };
    }
}

/**
 * Requests the sole Phase 4C operational write. Authorization, eligibility,
 * locking and all mutations are enforced by the database RPC.
 */
export async function verifyCustomerOrderPayment(customerOrderId) {
    const supabase = getSupabaseClient();
    if (!supabase || !customerOrderId) return { success: false, error: 'Unable to verify payment. Please try again.' };

    try {
        const { data, error } = await supabase.rpc('verify_customer_order_payment', {
            p_customer_order_id: customerOrderId
        });
        if (error) {
            safeLog('payment verification', error);
            if (/not authorized/i.test(error.message || '')) return { success: false, error: 'You are not authorized to verify payments.' };
            return { success: false, error: 'Unable to verify payment. Please try again.' };
        }
        if (!data?.success) {
            if (data?.code === 'PAYMENT_NOT_ELIGIBLE' || data?.code === 'PAYMENT_AMOUNT_MISMATCH') {
                return { success: false, error: 'This order is not eligible for payment verification.' };
            }
            return { success: false, error: 'Unable to verify payment. Please try again.' };
        }
        return { success: true, alreadyVerified: data.already_verified === true };
    } catch (err) {
        safeLog('payment verification', err);
        return { success: false, error: 'Unable to verify payment. Please try again.' };
    }
}

export async function advanceVendorOrder(vendorOrderId, targetStatus) {
    const supabase = getSupabaseClient();
    if (!supabase || !vendorOrderId || !['CONFIRMED', 'PREPARING', 'READY'].includes(targetStatus)) {
        return { success: false, error: 'Unable to update vendor order.' };
    }

    try {
        const { data, error } = await supabase.rpc('admin_advance_vendor_order', {
            p_vendor_order_id: vendorOrderId,
            p_target_status: targetStatus
        });
        if (error) {
            safeLog('vendor order advancement', error);
            if (/not authorized/i.test(error.message || '')) return { success: false, error: 'You are not authorized to update vendor orders.' };
            return { success: false, error: 'Unable to update vendor order.' };
        }
        if (!data?.success) {
            if (data?.code === 'PAYMENT_NOT_VERIFIED') return { success: false, error: 'Payment must be verified before confirming this vendor order.' };
            if (data?.code === 'INVALID_TRANSITION') return { success: false, error: 'This vendor order cannot move to the requested status.' };
            return { success: false, error: 'Unable to update vendor order.' };
        }
        return { success: true, alreadyApplied: data.already_applied === true };
    } catch (err) {
        safeLog('vendor order advancement', err);
        return { success: false, error: 'Unable to update vendor order.' };
    }
}

async function operationsRpc(name, payload, failureMessage) {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: failureMessage };
    try {
        const { data, error } = await supabase.rpc(name, payload);
        if (error || !data?.success) return { success: false, error: failureMessage };
        return { success: true, alreadyApplied: data.already_applied === true, data };
    } catch {
        return { success: false, error: failureMessage };
    }
}

export const createRider = (payload) => operationsRpc('admin_create_rider', payload, 'Unable to save rider.');
export const updateRider = (riderId, patch) => operationsRpc('admin_update_rider', { p_rider_id: riderId, p_patch: patch }, 'Unable to save rider.');
export const assignDeliveryRider = (orderId, riderId) => operationsRpc('admin_assign_delivery_rider', { p_customer_order_id: orderId, p_rider_id: riderId }, 'Unable to assign this rider.');
export const advanceDelivery = (orderId, targetStatus) => operationsRpc('admin_advance_delivery_request', { p_customer_order_id: orderId, p_target_status: targetStatus }, 'Unable to update delivery.');
export const completePickup = (orderId) => operationsRpc('admin_complete_pickup_order', { p_customer_order_id: orderId }, 'Unable to complete pickup.');
export const completeDelivery = (orderId) => operationsRpc('admin_complete_delivery_order', { p_customer_order_id: orderId }, 'Unable to complete delivery.');
