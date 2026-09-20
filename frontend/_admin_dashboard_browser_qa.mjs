export default async function run(page) {
  const viewports = [
    [1024, 768], [1152, 720], [1280, 720], [1280, 800], [1366, 768], [1440, 900], [1536, 864], [1600, 900], [1920, 1080],
    [768, 1024], [820, 1180], [360, 800], [375, 812], [390, 844], [414, 896], [430, 932]
  ];
  await page.evaluate(() => {
    document.querySelector('#admin-content').hidden = false;
    document.querySelector('#admin-loading').hidden = true;
    document.querySelector('#admin-login').hidden = true;
    document.querySelector('#admin-denied').hidden = true;
  });
  const results = [];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    results.push(await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      noPageOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      navVisible: getComputedStyle(document.querySelector('#admin-sidebar')).display !== 'none',
      mobileMenuVisible: getComputedStyle(document.querySelector('#admin-menu-toggle')).display !== 'none',
      panelCount: document.querySelectorAll('[data-admin-panel]').length,
      visiblePanels: [...document.querySelectorAll('[data-admin-panel].is-active')].map((item) => item.dataset.adminPanel),
      shellColumns: getComputedStyle(document.querySelector('.admin-shell')).gridTemplateColumns,
      sidebarWidth: Math.round(document.querySelector('#admin-sidebar').getBoundingClientRect().width),
      mainWidth: Math.round(document.querySelector('.admin-main-column').getBoundingClientRect().width),
      mainRect: document.querySelector('.admin-main-column').getBoundingClientRect().toJSON(),
      panelRect: document.querySelector('#admin-overview').getBoundingClientRect().toJSON(),
      gridRect: document.querySelector('.admin-management-grid').getBoundingClientRect().toJSON(),
      managementGridColumns: getComputedStyle(document.querySelector('.admin-management-grid')).gridTemplateColumns,
      managementCardWidths: [...document.querySelectorAll('.admin-management-card')].map((item) => Math.round(item.getBoundingClientRect().width)),
      panelOverflow: [...document.querySelectorAll('[data-admin-panel].is-active')].some((item) => item.scrollWidth > item.clientWidth)
    })));
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator('.admin-nav-item[data-admin-module="orders"]').click();
  const desktopModal = await page.evaluate(() => {
    const overlay = document.querySelector('#ops-detail-overlay');
    const modal = document.querySelector('#ops-detail-modal');
    overlay.hidden = false;
    overlay.removeAttribute('hidden');
    overlay.style.display = 'flex';
    const rect = modal.getBoundingClientRect();
    overlay.hidden = true;
    overlay.setAttribute('hidden', '');
    return { width: Math.round(rect.width), height: Math.round(rect.height), withinViewport: rect.right <= window.innerWidth && rect.bottom <= window.innerHeight };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#admin-menu-toggle').click();
  const drawerOpen = await page.locator('#admin-sidebar').evaluate((element) => element.classList.contains('is-open'));
  await page.locator('.admin-nav-item[data-admin-module="orders"]').click();
  const ordersPanelVisible = await page.locator('#admin-orders').evaluate((element) => element.classList.contains('is-active'));
  const overviewPanelHidden = await page.locator('#admin-overview').evaluate((element) => !element.classList.contains('is-active'));
  const drawerClosedAfterNavigation = await page.locator('#admin-sidebar').evaluate((element) => !element.classList.contains('is-open'));
  return page.evaluate((viewportResults) => {
    const panels = [...document.querySelectorAll('[data-admin-panel]')].map((item) => item.dataset.adminPanel);
    const nav = [...document.querySelectorAll('.admin-nav-item')].map((item) => item.dataset.adminModule);
    const cards = [...document.querySelectorAll('.admin-management-card')].map((item) => item.dataset.adminModule);
    return { panels, nav, cards, results: viewportResults };
  }, results).then((report) => ({ ...report, desktopModal, drawerOpen, ordersPanelVisible, overviewPanelHidden, drawerClosedAfterNavigation }));
}
