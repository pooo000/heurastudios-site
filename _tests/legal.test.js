// heurastudios.com: the Privacy Policy (/privacy/) and the Terms of Service (/terms/), the same words as the Heura
// Studio app's, linked from every page's footer and from the waitlist form's fine print.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, launch } = require('./helpers');

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

async function open(path, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...options });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const res = await page.goto(server.url + path);
  return { page, errors, status: res.status(), close: () => ctx.close() };
}

const PAGES = [['/privacy/', 'Heura Studios Privacy Policy', 'Privacy Policy – Heura Studios'],
  ['/terms/', 'Heura Studios Terms of Service', 'Terms of Service – Heura Studios']];

test('the Privacy Policy and the Terms of Service are pages of their own', async () => {
  for (const [path, heading, title] of PAGES) {
    const { page, errors, status, close } = await open(path);
    assert.equal(status, 200, path);
    assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), heading);
    assert.equal(await page.title(), title);
    assert.deepEqual(errors, [], path);
    await close();
  }
});

test('the training switch reads opt-in on both pages', async () => {
  for (const [path] of PAGES) {
    const { page, close } = await open(path);
    const words = await page.locator('main').innerText();
    assert.match(words, /“Use my data to improve Heura”/, path);
    assert.match(words, /It is off unless you turn it on\./, path);
    assert.doesNotMatch(words.toLowerCase(), /opt(ed|ing)?[ -]out/, path);
    await close();
  }
});

test('every page links to both from its footer, and each says which one you are on', async () => {
  for (const path of ['/', '/waitlist/', '/privacy/', '/terms/']) {
    const { page, close } = await open(path);
    const foot = page.locator('footer');
    assert.equal(await foot.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href'), '/privacy/', path);
    assert.equal(await foot.getByRole('link', { name: 'Terms of Service' }).getAttribute('href'), '/terms/', path);
    await close();
  }
  const { page, close } = await open('/terms/');
  assert.equal(await page.locator('footer').getByRole('link', { name: 'Terms of Service' }).getAttribute('aria-current'), 'page');
  await close();
});

test('the two pages link to each other, and the waitlist form points at the Privacy Policy', async () => {
  let { page, close } = await open('/terms/');
  await page.locator('main').getByRole('link', { name: 'Privacy Policy' }).first().click();
  await page.waitForURL('**/privacy/');
  await close();
  ({ page, close } = await open('/waitlist/'));
  assert.equal(await page.locator('.wl-fine').getByRole('link', { name: 'Privacy Policy' }).getAttribute('href'), '/privacy/');
  await close();
});

test('the legal pages fit a phone, in light and dark', async () => {
  for (const [path] of PAGES) {
    for (const colorScheme of ['light', 'dark']) {
      const { page, close } = await open(path, { viewport: { width: 360, height: 740 }, colorScheme });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, `${path} ${colorScheme}`);
      await close();
    }
  }
});

// Nov 18, 2026 (sign-up open to anyone, Free and Studio): the Terms' section 6 is Plans and payment (Stripe bills
// Studio monthly, in US dollars; the price itself is only in the app) and the Privacy Policy says what billing collects
// and who processes it. Accounts made under the October 15 versions keep them until December 3, 2026 (the Terms promise
// 14 days' notice of material changes), and those versions keep their own pages.
const VERSIONS = [['/terms/', '/terms/2026-10-15/', 'The current Terms of Service', '/privacy/2026-10-15/'],
  ['/privacy/', '/privacy/2026-10-15/', 'The current Privacy Policy', '/terms/2026-10-15/']];

test('the Terms say how Studio is billed, canceled and changed, and no price is on the page', async () => {
  const { page, errors, close } = await open('/terms/');
  const fees = page.locator('section[aria-labelledby="fees"]');
  assert.equal(await fees.getByRole('heading', { level: 2 }).textContent(), '6. Plans and payment');
  const words = (await fees.innerText()).replace(/\s+/g, ' ');
  for (const said of ['Free costs nothing and has limits.', 'Studio is a paid monthly subscription',
    'Studio is billed monthly in advance, in US dollars, through our payment processor, Stripe',
    'You can cancel at any time in the app (Plan, then Manage billing).', 'Deleting your account ends your subscription at once.',
    'We will tell you at least 30 days before a price increase', 'you keep the limits you had in early access for 30 days',
    'Nothing you use costs money unless you choose Studio.', 'that provider bills you directly']) {
    assert.ok(words.includes(said), said);
  }
  assert.doesNotMatch(words, /\$|USD/, 'prices are only in the app');
  const all = await page.locator('main').innerText();
  assert.doesNotMatch(all, /free during early access/i);
  assert.match(all, /These Terms take effect on November 18, 2026\. If you agreed to an earlier version, they apply to you from December 3, 2026/);
  assert.equal(await page.locator('section[aria-labelledby="agreement"]').getByRole('link', { name: 'October 15, 2026' }).getAttribute('href'), '/terms/2026-10-15/');
  assert.deepEqual(errors, []);
  await close();
});

test('the Privacy Policy says what billing collects, that Stripe processes it and how long it is kept', async () => {
  const { page, errors, close } = await open('/privacy/');
  const all = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  assert.doesNotMatch(all, /collect no payment information|free during early access/i);
  const row = page.locator('.legal-table tr', { hasText: 'Billing information (Studio)' });
  assert.equal(await row.count(), 1);
  assert.match(await row.innerText(), /we never receive your full card number/);
  assert.match(await page.locator('section[aria-labelledby="sharing"]').innerText(), /Stripe \(Stripe Payments Canada, Ltd\. and its affiliates, including Stripe, Inc\. in the United States\) processes payments for Studio\./);
  assert.match(await page.locator('section[aria-labelledby="retention"]').innerText(), /Billing records .* even after you delete your account\./);
  assert.match(all, /Waitlist and inquiry information Name, email address, company, role, your question, the page that sent you/);
  assert.match(all, /This version takes effect on November 18, 2026\. If you agreed to an earlier version, it applies to you from December 3, 2026/);
  assert.equal(await page.locator('section[aria-labelledby="who"]').getByRole('link', { name: 'October 15, 2026' }).getAttribute('href'), '/privacy/2026-10-15/');
  assert.deepEqual(errors, []);
  await close();
});

test('the October 15, 2026 versions keep their own pages, each pointing to the current one', async () => {
  for (const [current, old, back, other] of VERSIONS) {
    const { page, errors, status, close } = await open(old);
    assert.equal(status, 200, old);
    const heading = (await page.getByRole('heading', { level: 1 }).textContent());
    assert.match(heading, current === '/terms/' ? /^Heura Studios Terms of Service$/ : /^Heura Studios Privacy Policy$/);
    const note = page.locator('.lg-note');
    assert.match(await note.innerText(), /^This is the October 15, 2026 version\. It applies to accounts made under it until December 3, 2026\./);
    assert.equal(await note.getByRole('link', { name: back }).getAttribute('href'), current);
    assert.match(await page.locator('main').innerText(), /Effective date: October 15, 2026\./);
    const inside = await page.locator('main section a[href^="/"]').evaluateAll(as => as.map(a => a.getAttribute('href')));
    assert.ok(inside.length > 0 && inside.every(h => h.startsWith(other)), `${old}: ${inside}`);   // the other page of its version
    for (const colorScheme of ['light', 'dark']) {
      const small = await open(old, { viewport: { width: 360, height: 740 }, colorScheme });
      assert.equal(await small.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, `${old} ${colorScheme}`);
      await small.close();
    }
    assert.deepEqual(errors, [], old);
    await close();
  }
});
