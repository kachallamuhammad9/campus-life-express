export default async function run(page, ui) {
  const out = { console: [], requests: [], mutations: [] };
  page.on('console', (m) => { if (['error','warning'].includes(m.type())) out.console.push(m.text().slice(0,300)); });
  page.on('request', (r) => { const u = r.url();
    if (/express|:3000|localhost:5/i.test(u)) out.requests.push('NON-SUPABASE: '+u.slice(0,140));
    if (r.method() !== 'GET' && /rest\/v1\/(customer_orders|orders|order_items|customer_order_payments|delivery_requests|customer_order_status_history)|rest\/v1\/rpc\/(?!is_admin(?:\?|$))/.test(u)) out.mutations.push(r.method()+' '+u.slice(0,160)); });
  page.on('requestfailed', (r) => out.requests.push('FAILED: '+r.url().slice(0,140)));

  await ui.snapshot();
  await page.waitForTimeout(2500);
  out.afterLoad = await ui.snapshot({full:true});

  // Attempt login if present (real IDs from admin.html: #admin-email/#admin-password/#admin-signin)
  let envelope = {};
  try { envelope = JSON.parse(process.env.CLX_ADMIN_CREDS || '{}'); } catch { /* handled as missing credentials */ }
  const email = process.env.CLX_QA_ADMIN_EMAIL || envelope.email;
  const password = process.env.CLX_QA_ADMIN_PASSWORD || envelope.password;
  if (!email || !password) return { ...out, error: 'no admin QA credentials configured' };
  if (await page.locator('#admin-login').count()) {
    await page.locator('#admin-email').fill(email);
    await page.locator('#admin-password').fill(password);
    await Promise.all([
      page.waitForLoadState('networkidle').catch(() => {}),
      page.locator('#admin-signin').click(),
    ]);
    await page.waitForTimeout(6000);
    out.basicCustomerOrdersSelect = await page.evaluate(async () => {
      if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        return { success: null, skipped: 'source module unavailable in bundled deployment' };
      }
      try {
        const { getSupabaseClient } = await import('/js/supabase.js');
        const { data, error } = await getSupabaseClient()
          .from('customer_orders')
          .select('id, order_number, status, created_at')
          .order('created_at', { ascending: false })
          .limit(10);
        return {
          success: !error,
          rows: data?.length || 0,
          smokeOrderFound: Boolean(data?.some((order) => order.order_number === 'CLX-2026-0001')),
          error: error?.message || null
        };
      } catch {
        return { success: null, skipped: 'source module unavailable in bundled deployment' };
      }
    });
    out.queue = await page.evaluate(() => ({
      count: document.querySelectorAll('#ops-queue > div').length,
      smokeOrderVisible: document.getElementById('ops-queue').textContent.includes('CLX-2026-0001'),
      loadErrorVisible: document.getElementById('ops-state').textContent.includes('Unable to load operations data.')
    }));
    out.afterLogin = await ui.snapshot({full:true});
    // open details if a View Details button exists
    const vd = page.locator('.ops-view-detail').first();
    if (await vd.count()) {
      await vd.click();
      await page.waitForTimeout(2500);
      out.details = await page.evaluate(() => {
        const text = document.getElementById('ops-detail-content').textContent;
        return {
          open: !document.getElementById('ops-detail-overlay').hidden,
          customer: text.includes('Customer'),
          fulfillmentPickup: text.includes('Pickup'),
          payment: text.includes('Pending') || text.includes('Paid'),
          vendorGroup: document.querySelectorAll('#ops-detail-content table').length > 0,
          bottledWater: text.includes('Bottled Water'),
          quantityOne: /Bottled Water\s*1/.test(text),
          total200: text.includes('₦200')
        };
      });
    }
  } else {
    out.note = 'login form not visible (maybe already signed in)';
    out.afterLogin = await ui.snapshot({full:true});
  }
  return out;
}
