import { CLX_CONFIG } from './data.js';

const TRACKING_STORAGE_KEY = 'clx_tracking_orders';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildCustomerOrderItems(cartItems) {
    if (!Array.isArray(cartItems) || cartItems.length === 0) throw new Error('Your cart is empty.');
    const productIds = new Set();
    return cartItems.map((item) => {
        const productId = String(item.id || '');
        const quantity = Number(item.quantity);
        if (item.isLiveProduct !== true) {
            throw new Error('Live product data is temporarily unavailable. Please refresh the catalogue before placing your order.');
        }
        if (!UUID_PATTERN.test(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 50 || productIds.has(productId)) {
            throw new Error('Your cart contains an invalid product or quantity.');
        }
        productIds.add(productId);
        return { product_id: productId, quantity };
    });
}

export function saveTrackingOrder(order) {
    if (!order?.orderNumber || !order?.trackingToken) return;
    let recentOrders = [];
    try { recentOrders = JSON.parse(localStorage.getItem(TRACKING_STORAGE_KEY) || '[]'); } catch { recentOrders = []; }
    recentOrders = recentOrders.filter((item) => item.orderNumber !== order.orderNumber);
    recentOrders.unshift({ orderNumber: order.orderNumber, trackingToken: order.trackingToken, savedAt: new Date().toISOString() });
    localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(recentOrders.slice(0, 10)));
}

export function getSavedTrackingOrders() {
    try { return JSON.parse(localStorage.getItem(TRACKING_STORAGE_KEY) || '[]'); } catch { return []; }
}

export function formatKobo(kobo) {
    return `₦${(Number(kobo || 0) / 100).toLocaleString()}`;
}

export function customerStatusLabel(status) {
    return String(status || 'ORDER_RECEIVED').split('_').map((word) => word[0] + word.slice(1).toLowerCase()).join(' ');
}

export function paymentStatusLabel(status) {
    const labels = { PENDING: 'Awaiting Payment', PAID: 'Payment Confirmed', FAILED: 'Failed', REFUND_PENDING: 'Refund Pending', REFUNDED: 'Refunded' };
    return labels[status] || customerStatusLabel(status);
}

export function buildTrackingTimeline(order) {
    return (order?.history || []).map((entry) => ({
        status: entry.status,
        label: customerStatusLabel(entry.status),
        createdAt: entry.created_at,
        timestamp: entry.created_at ? new Date(entry.created_at).toLocaleString() : ''
    })).filter((entry) => entry.status);
}

export function buildWhatsAppOrderMessage(response, customer, campusName) {
    const vendorGroups = (response.vendor_groups || []).map((group) => {
        const items = (group.items || []).map((item) => `* ${item.product_name} x ${item.quantity}`).join('\n');
        return `${group.vendor_name}\n${items}`;
    }).join('\n\n');
    return [
        'Hello CLX, I have placed a new order.', '',
        `CLX Order ID: ${response.order_number}`, '',
        'Customer:', customer.name, '', `Phone: ${customer.phone}`, '',
        `Campus: ${campusName}`, '', `Fulfillment: ${customerStatusLabel(response.fulfillment_type)}`,
        response.fulfillment_type === 'DELIVERY' && response.delivery_zone_name ? `Delivery Zone: ${response.delivery_zone_name}` : '',
        response.fulfillment_type === 'DELIVERY' && response.delivery_location ? `Delivery Location: ${response.delivery_location}` : '', '',
        'Vendor Groups:', vendorGroups, '',
        `Subtotal: ${formatKobo(response.subtotal_kobo)}`,
        `Delivery Fee: ${formatKobo(response.delivery_fee_kobo)}`,
        `Service Fee: ${formatKobo(response.service_fee_kobo)}`,
        `Total: ${formatKobo(response.total_kobo)}`,
        'Payment Status: Awaiting Payment',
        customer.notes ? `Order Note: ${customer.notes}` : '', '',
        'Please provide the official payment instructions and continue processing my order.'
    ].filter(Boolean).join('\n');
}

export function buildWhatsAppOrderUrl(response, customer, campusName) {
    if (!response?.order_number) throw new Error('A confirmed order number is required for WhatsApp handoff.');
    const message = buildWhatsAppOrderMessage(response, customer, campusName);
    return `https://wa.me/${CLX_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export { TRACKING_STORAGE_KEY };
