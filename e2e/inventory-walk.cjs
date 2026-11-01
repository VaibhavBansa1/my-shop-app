// CSV import, stock count/adjustment, single-firm auto-open and multi-firm overview (web).
const { chromium } = require('playwright');
const fs = require('fs'); const os = require('os'); const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-'));
  fs.writeFileSync(path.join(tmp, 'items.csv'), 'Item Name,Unit,HSN,GST,Price,Cost,Opening Stock,Reorder\nBasmati Rice 5kg,pcs,1006,5,510,420,24,8\nSugar,kg,1701,5,48,42,12.5,5\nBad Row,crates,,,1,1,1,1\n');
  fs.writeFileSync(path.join(tmp, 'items-fixed.csv'), 'Item Name,Unit,HSN,GST,Price,Cost,Opening Stock,Reorder\nBasmati Rice 5kg,pcs,1006,5,510,420,24,8\nSugar,kg,1701,5,48,42,12.5,5\n');
  fs.writeFileSync(path.join(tmp, 'parties.csv'), 'name,type,phone,email,gstin,state_code,address,opening_balance\nRamesh Traders,customer,9876543210,,,23,"MG Road, Gwalior",1500\nAnnapurna Wholesale,supplier,,,23AAACR5055K1ZF,23,,2000\n');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  const email = `inv${Date.now()}@example.com`;
  await page.goto(`${BASE}/signup`);
  await page.fill('input[autocomplete=name]', 'Inventory Owner');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'inventory walk pass');
  await page.click('button:has-text("Create account")');
  await page.waitForURL('**/orgs**');
  await page.click('text=+ Create a new business');
  await page.fill('form input >> nth=0', 'Firm One');
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/o\/[0-9a-f-]+$/);
  const base = page.url();

  // CSV import with a bad row, then the fixed file
  await page.goto(`${base}/import?kind=items`);
  await page.setInputFiles('input[type=file]', path.join(tmp, 'items.csv'));
  await page.waitForSelector('text=need fixing');
  console.log('bad row reported:', await page.locator('td:has-text("Unknown unit")').count() === 1);
  await page.screenshot({ path: `${OUT}/import-errors-desktop.png`, fullPage: true });
  await page.setInputFiles('input[type=file]', path.join(tmp, 'items-fixed.csv'));
  await page.waitForSelector('button:has-text("Import 2 row(s)")');
  await page.click('button:has-text("Import 2 row(s)")');
  await page.waitForSelector('text=Imported 2');
  await page.goto(`${base}/import?kind=parties`);
  await page.setInputFiles('input[type=file]', path.join(tmp, 'parties.csv'));
  await page.click('button:has-text("Import 2 row(s)")');
  await page.waitForSelector('text=Imported 2');
  console.log('imports done ✓');

  // Count stock: rice 24 -> 21 (3 damaged)
  await page.goto(`${base}/items/count`);
  await page.fill('input[aria-label="Counted Basmati Rice 5kg"]', '21');
  await page.fill('input[value^="Physical stock count"]', 'Physical count — 3 bags damaged by rain');
  await page.click('button:has-text("Save 1 adjustment")');
  await page.waitForSelector('text=ADJ/');
  await page.screenshot({ path: `${OUT}/stock-adjustment-desktop.png`, fullPage: true });
  await page.goto(`${base}/items`);
  await page.waitForSelector('td:has-text("21 pcs")');
  console.log('stock after count: 21 ✓');

  // Second firm -> overview; then sign in again with one firm only goes straight in
  await page.goto(`${BASE}/orgs`);
  await page.click('text=+ Create a new business');
  await page.fill('form input >> nth=0', 'Firm Two');
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/o\/[0-9a-f-]+$/);
  await page.goto(`${BASE}/orgs`);
  await page.waitForSelector('text=All businesses');
  await page.screenshot({ path: `${OUT}/multi-firm-overview.png`, fullPage: true });
  console.log('multi-firm overview ✓');

  const p2 = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const singleEmail = `single${Date.now()}@example.com`;
  await p2.goto(`${BASE}/signup`);
  await p2.fill('input[autocomplete=name]', 'Single');
  await p2.fill('input[type=email]', singleEmail);
  await p2.fill('input[type=password]', 'single firm password');
  await p2.click('button:has-text("Create account")');
  await p2.waitForURL('**/orgs**');
  await p2.click('text=+ Create a new business');
  await p2.fill('form input >> nth=0', 'Only Firm');
  await p2.click('button:has-text("Create")');
  await p2.waitForURL(/\/o\/[0-9a-f-]+$/);
  const firmUrl = p2.url();
  await p2.goto(`${firmUrl}/settings`);
  await p2.click('button:has-text("Sign out")');
  await p2.waitForURL(`${BASE}/`);
  await p2.goto(`${BASE}/login`);
  await p2.fill('input[type=email]', singleEmail);
  await p2.fill('input[type=password]', 'single firm password');
  await p2.click('button:has-text("Sign in")');
  await p2.waitForURL(firmUrl);
  console.log('single-firm sign-in opens the business directly ✓');
  await browser.close();
  console.log('errors:', errors.length ? errors : 'none');
})().catch((e) => { console.error(e.message); process.exit(1); });
