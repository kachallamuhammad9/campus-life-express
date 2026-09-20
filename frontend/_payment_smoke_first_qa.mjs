export default async function run(page, ui) {
    const orderNumber = process.env.CLX_PAYMENT_SMOKE_ORDER;
    const email = process.env.CLX_QA_ADMIN_EMAIL;
    const password = process.env.CLX_QA_ADMIN_PASSWORD;
    const out = { orderNumber, network: { auth: 0, isAdmin: 0, verifyPayment: 0, directOperationalWrites: [], express: [] } };
    if (!orderNumber || orderNumber === 'CLX-2026-0001' || !email || !password) return { ...out, error: 'missing or unsafe smoke-test configuration' };

    page.on('request', (request) => {
        const url = request.url();
        if (/auth\/v1\/token/.test(url)) out.network.auth++;
        if (/rest\/v1\/rpc\/is_admin/.test(url)) out.network.isAdmin++;
        if (/rest\/v1\/rpc\/verify_customer_order_payment/.test(url)) out.network.verifyPayment++;
        if (request.method() !== 'GET' && /rest\/v1\/(customer_orders|customer_order_payments|customer_order_status_history)/.test(url)) out.network.directOperationalWrites.push(`${request.method()} ${url}`);
        if (/express|onrender|:3000/i.test(url)) out.network.express.push(url);
    });

    await page.locator('#admin-email').fill(email);
    await page.locator('#admin-password').fill(password);
    await page.locator('#admin-signin').click();
    await page.waitForSelector('#admin-content:not([hidden])', { timeout: 15000 });
    await page.waitForFunction((number) => document.getElementById('ops-queue').textContent.includes(number), orderNumber, { timeout: 15000 });

    const card = page.locator('#ops-queue > div', { hasText: orderNumber });
    out.orderVisible = await card.count() === 1;
    if (!out.orderVisible) return { ...out, error: 'dedicated order card was not uniquely visible' };
    await card.locator('.ops-view-detail').click();
    await page.waitForSelector('#ops-detail-overlay:not([hidden])', { timeout: 5000 });

    const details = await page.locator('#ops-detail-content').innerText();
    out.details = {
        open: true,
        pending: details.includes('Pending'),
        amount: details.includes('₦500'),
        customer: details.includes('MUHAMMAD ALI'),
        order: details.includes(orderNumber),
        verifyVisible: await page.locator('.ops-verify-payment').count() === 1
    };
    if (!out.details.pending || !out.details.amount || !out.details.customer || !out.details.order || !out.details.verifyVisible) {
        return { ...out, error: 'payment verification preconditions did not match the dedicated order' };
    }

    const confirmation = new Promise((resolve) => page.once('dialog', async (dialog) => {
        const message = dialog.message();
        await dialog.accept();
        resolve(message);
    }));
    await page.locator('.ops-verify-payment').click();
    out.confirmation = await confirmation;
    await page.waitForFunction((number) => {
        const detail = document.getElementById('ops-detail-content').textContent;
        return detail.includes(number) && detail.includes('Paid') && detail.includes('Payment Confirmed');
    }, orderNumber, { timeout: 15000 });
    out.afterVerification = await page.locator('#ops-detail-content').innerText();
    return out;
}