const { chromium } = require('playwright');
const OUT = require('path').join(__dirname, '..', 'docs', 'screenshots');
const BASE = (process.env.BASE || 'http://localhost:3000') + '';
async function pick(loc, text) {
  const v = await loc.evaluate((el, t) => [...el.options].find((o) => o.textContent.includes(t))?.value, text);
  await loc.selectOption(v);
}
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE);
  await page.screenshot({ path: `${OUT}/landing-desktop.png` });
  await page.click('text=Create account');
  const email = `demo${Date.now()}@example.com`;
  await page.fill('input[autocomplete=name]', 'Vaibhav');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'demo shop password');
  await page.click('button:has-text("Create account")');
  await page.waitForURL('**/orgs');
  await page.click('text=+ Create a new business');
  await page.fill('form input >> nth=0', 'Bansal General Store');
  await page.fill('form input >> nth=1', '23ABCDE1234F1Z8');
  await page.fill('textarea', 'Main Market, Gwalior, MP');
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/o\/[0-9a-f-]+$/);
  const base = page.url();
  // add items
  await page.goto(`${base}/items`);
  for (const [name, gst, price, open, rate] of [['Basmati Rice 5kg', '5', '510', '24', '420'], ['Mustard Oil 1L', '5', '170', '30', '145'], ['Detergent 1kg', '18', '89', '6', '72']]) {
    await page.click('text=+ New item');
    await page.fill('form input >> nth=0', name);
    await page.fill('form input >> nth=3', gst);
    await page.fill('form input >> nth=4', price);
    await page.fill('form input >> nth=6', '10');
    await page.fill('form input >> nth=7', open);
    await page.fill('form input >> nth=8', rate);
    await page.click('button:has-text("Save")');
    try { await page.waitForSelector(`td:has-text("${name}")`, { timeout: 5000 }); } catch (e) { await page.screenshot({ path: 'dbg.png', fullPage: true }); console.log(await page.locator('.note').allTextContents()); throw e; }
  }
  await page.screenshot({ path: `${OUT}/items-desktop.png`, fullPage: true });
  // customer
  await page.goto(`${base}/ledgers`);
  await page.click('text=+ New ledger');
  await page.fill('form input >> nth=0', 'Ramesh Traders');
  await page.selectOption('form select >> nth=0', { label: 'Sundry Debtors' });
  await page.selectOption('form select >> nth=2', '07');
  await page.click('button:has-text("Save ledger")');
  await page.waitForSelector('text=Ramesh Traders');
  // sale
  await page.goto(`${base}/vouchers/new?type=sales`);
  await page.waitForSelector('text=Items');
  await pick(page.locator('.line select').first(), 'Basmati');
  await page.fill('.line input >> nth=0', '2');
  await page.click('text=+ Add item');
  await pick(page.locator('.line >> nth=1 >> select').first(), 'Detergent');
  await page.fill('.line >> nth=1 >> input >> nth=0', '3');
  await page.screenshot({ path: `${OUT}/new-sale-desktop.png`, fullPage: true });
  await page.click('button:has-text("Save")');
  await page.waitForSelector('text=Tax Invoice');
  await page.screenshot({ path: `${OUT}/invoice-desktop.png`, fullPage: true });
  // credit sale to inter-state customer
  await page.goto(`${base}/vouchers/new?type=sales`);
  await page.waitForSelector('text=Items');
  await page.selectOption('form select >> nth=0', { label: 'Ramesh Traders' });
  await pick(page.locator('.line select').first(), 'Mustard');
  await page.fill('.line input >> nth=0', '5');
  await page.click('button:has-text("Save")');
  await page.waitForSelector('text=IGST');
  // receipt
  await page.goto(`${base}/vouchers/new?type=receipt`);
  await page.waitForSelector('text=Received from');
  await page.selectOption('form select >> nth=0', { label: 'Ramesh Traders' });
  await page.selectOption('form select >> nth=1', { label: 'Cash' });
  await page.fill('form input[inputmode=decimal]', '500');
  await page.click('button:has-text("Save")');
  await page.waitForSelector('text=RCT/');
  // reports
  await page.goto(`${base}/reports`);
  await page.waitForSelector('text=Gross profit');
  await page.screenshot({ path: `${OUT}/reports-pl-desktop.png`, fullPage: true });
  await page.click('button.chip:has-text("Balance Sheet")');
  try { await page.waitForSelector('text=Liabilities', { timeout: 8000 }); } catch (e) { await page.screenshot({ path: 'dbg.png', fullPage: true }); console.log(await page.locator('.note').allTextContents()); throw e; }
  await page.screenshot({ path: `${OUT}/reports-bs-desktop.png`, fullPage: true });
  await page.goto(base);
  await page.waitForSelector('text=Sales today');
  await page.screenshot({ path: `${OUT}/dashboard-desktop.png`, fullPage: true });
  await page.goto(`${base}/team`);
  await page.fill('input[type=email]', 'cashier@example.com');
  await page.click('text=Create invitation link');
  await page.waitForSelector('text=Share this link');
  await page.screenshot({ path: `${OUT}/team-desktop.png`, fullPage: true });

  // phone, light + dark
  const cookies = await ctx.cookies();
  for (const scheme of ['light', 'dark']) {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true });
    await m.addCookies(cookies);
    const p = await m.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    for (const [path, name, wait] of [['', 'dashboard', 'Sales today'], ['/vouchers/new?type=sales', 'new-sale', 'Items'], ['/vouchers', 'vouchers', 'INV/'], ['/reports', 'reports', 'Gross profit']]) {
      await p.goto(base + path); await p.waitForSelector(`text=${wait}`);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      if (sw > 390) errors.push(`horizontal scroll on ${path} (${scheme}): ${sw}px`);
      await p.screenshot({ path: `${OUT}/${name}-phone-${scheme}.png` });
    }
    await m.close();
  }
  console.log('email', email, '\nerrors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
