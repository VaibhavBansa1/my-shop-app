// Security settings: devices list, sign out another device, sign-in history; flags hide features.
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
(async () => {
  const browser = await chromium.launch();
  const email = `sec${Date.now()}@example.com`;
  const pw = 'security walk password';
  const a = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: 'Laptop Chrome' })).newPage();
  const errors = []; a.on('pageerror', (e) => errors.push(String(e)));
  await a.goto(`${BASE}/signup`);
  await a.fill('input[autocomplete=name]', 'Sec Owner'); await a.fill('input[type=email]', email); await a.fill('input[type=password]', pw);
  await a.click('button:has-text("Create account")'); await a.waitForURL('**/orgs**');
  await a.click('text=+ Create a new business'); await a.fill('form input >> nth=0', 'Secure Shop'); await a.click('button:has-text("Create")');
  await a.waitForURL(/\/o\/[0-9a-f-]+$/);
  const base = a.url();
  // A second device signs in (and one wrong password first).
  const b = await (await browser.newContext({ userAgent: 'Phone Browser' })).newPage();
  await b.goto(`${BASE}/login`); await b.fill('input[type=email]', email); await b.fill('input[type=password]', 'wrong password!!');
  await b.click('button:has-text("Sign in")'); await b.waitForSelector('text=incorrect');
  await b.fill('input[type=password]', pw); await b.click('button:has-text("Sign in")'); await b.waitForURL(/\/o\//);
  await a.goto(`${base}/settings`);
  await a.waitForSelector('text=Phone Browser');
  await a.click('summary:has-text("Recent sign-in activity")');
  await a.waitForSelector('td:has-text("login.failure")');
  await a.screenshot({ path: `${OUT}/security-settings-desktop.png`, fullPage: true });
  await a.locator('tr:has-text("Phone Browser") button:has-text("Sign out")').click();
  await a.waitForSelector('text=Device signed out');
  await b.goto(`${base}/items`);
  await b.waitForURL(/\/login/);
  console.log('other device signed out remotely ✓');
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
