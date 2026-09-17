export const REFUND_REASONS = ['Item unavailable', 'Vendor unavailable', 'Customer requested cancellation', 'Operational issue', 'Other'];
export const isRefundOrder = status => ['REFUND_PENDING', 'REFUNDED'].includes(status);

// UI eligibility is advisory. The RPC locks and validates every child/payment.
export function canRequestOrderRefund(order) {
    return order.payment_status === 'PAID' && !!order.payment_verified_at && !!order.payment_paid_at
        && Number(order.paid_amount_kobo) === Number(order.total_kobo)
        && ['PAYMENT_CONFIRMED', 'ORDER_CONFIRMED'].includes(order.status)
        && !order.refund && order.vendor_groups?.length > 0
        && order.vendor_groups.every(group => ['PENDING', 'CONFIRMED'].includes(group.status))
        && (!order.delivery || (order.delivery.status === 'REQUESTED' && !order.delivery.has_rider_assignment && !order.delivery.picked_up_at && !order.delivery.delivered_at))
        && !(order.history || []).some(event => ['PREPARING', 'READY_FOR_PICKUP', 'READY_FOR_DISPATCH', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED'].includes(event.status));
}

export function refundMessage(status) {
    return status === 'REFUNDED' ? 'Your refund has been confirmed.' : 'Your order could not be fulfilled. CLX is processing your refund.';
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function renderCustomerRefund(status, refund) {
    if (!isRefundOrder(status)) return '';
    const label = status === 'REFUNDED' ? 'Refunded' : 'Refund Pending';
    const timestamp = status === 'REFUNDED' ? refund?.confirmed_at : refund?.requested_at;
    return `<div class="order-refund-notice" role="status" style="margin:14px 0;padding:12px;border-radius:10px;background:#FFF7ED;color:#7C2D12;font-size:13px;"><strong>${label}</strong><p>${refundMessage(status)}</p>${refund ? `<div>Reason: ${esc(refund.reason)}</div><div>Refund amount: ₦${esc((Number(refund.amount_kobo) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 }))}</div>${timestamp ? `<div>${esc(new Date(timestamp).toLocaleString())}</div>` : ''}` : ''}</div>`;
}
