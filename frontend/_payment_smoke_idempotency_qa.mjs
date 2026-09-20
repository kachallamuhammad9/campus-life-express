export default async function run(page) {
    const orderNumber = process.env.CLX_PAYMENT_SMOKE_ORDER;
    const email = process.env.CLX_QA_ADMIN_EMAIL;
    const password = process.env.CLX_QA_ADMIN_PASSWORD;
    if (!orderNumber || orderNumber === 'CLX-2026-0001' || !email || !password) return { error: 'missing or unsafe smoke-test configuration' };

    await page.locator('#admin-email').fill(email);
    await page.locator('#admin-password').fill(password);
    await page.locator('#admin-signin').click();
    await page.waitForSelector('#admin-content:not([hidden])', { timeout: 15000 });
    await page.waitForFunction((number) => document.getElementById('ops-queue').textContent.includes(number), orderNumber, { timeout: 15000 });
    return page.evaluate(async (number) => {
        const { getSupabaseClient } = await import('/js/supabase.js');
        const supabase = getSupabaseClient();
        const { data: orders, error: orderError } = await supabase.from('customer_orders').select('id').eq('order_number', number).limit(1);
        if (orderError || orders?.length !== 1) return { error: 'test order could not be resolved in the authenticated session' };
        const orderId = orders[0].id;
        const readState = async () => {
            const [payment, parent, history, children] = await Promise.all([
                supabase.from('customer_order_payments').select('status, verified_by_user_id, verified_at, paid_at').eq('customer_order_id', orderId).single(),
                supabase.from('customer_orders').select('status').eq('id', orderId).single(),
                supabase.from('customer_order_status_history').select('status').eq('customer_order_id', orderId),
                supabase.from('orders').select('status').eq('customer_order_id', orderId)
            ]);
            if (payment.error || parent.error || history.error || children.error) return null;
            return { payment: payment.data, parent: parent.data.status, history: history.data, children: children.data.map((child) => child.status) };
        };
        const before = await readState();
        if (!before) return { error: 'unable to read idempotency baseline' };
        const { data, error } = await supabase.rpc('verify_customer_order_payment', { p_customer_order_id: orders[0].id });
        const after = await readState();
        const beforeHistoryCount = before.history.filter((entry) => entry.status === 'PAYMENT_CONFIRMED').length;
        const afterHistoryCount = after?.history.filter((entry) => entry.status === 'PAYMENT_CONFIRMED').length;
        return {
            success: !error && data?.success === true,
            alreadyVerified: data?.already_verified === true,
            metadataUnchanged: JSON.stringify(before.payment) === JSON.stringify(after?.payment),
            parentUnchanged: before.parent === after?.parent,
            historyUnchanged: beforeHistoryCount === afterHistoryCount,
            childStateUnchanged: JSON.stringify(before.children) === JSON.stringify(after?.children),
            error: error?.message || null
        };
    }, orderNumber);
}