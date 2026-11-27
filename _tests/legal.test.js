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

// Nov 18, 2026 (sign-up open to anyone, Free and Studio): the Terms' section 6 became Plans and payment and the Privacy
// Policy said what billing collects and who processes it. Nov 26, 2026 (plans with credits: Free, Pro and Studio, and
// packs of credits that never expire, Ryan's call): section 6 says how credits work, the Privacy Policy what the
// credits record holds. No price, plan card or number of credits is on either page (prices are only in the app).
// Accounts made under an earlier version keep it until December 11, 2026 (the Terms promise 14 days' notice of
// material changes), and each earlier version keeps its own page.
const VERSIONS = [
  ['/terms/', '/terms/2026-10-15/', 'The current Terms of Service', '/privacy/2026-10-15/', 'October 15, 2026'],
  ['/privacy/', '/privacy/2026-10-15/', 'The current Privacy Policy', '/terms/2026-10-15/', 'October 15, 2026'],
  ['/terms/', '/terms/2026-11-18/', 'The current Terms of Service', '/privacy/2026-11-18/', 'November 18, 2026'],
  ['/privacy/', '/privacy/2026-11-18/', 'The current Privacy Policy', '/terms/2026-11-18/', 'November 18, 2026']];

test('the Terms say how the plans, credits and packs work, and no price is on the page', async () => {
  const { page, errors, close } = await open('/terms/');
  const fees = page.locator('section[aria-labelledby="fees"]');
  assert.equal(await fees.getByRole('heading', { level: 2 }).textContent(), '6. Plans and payment');
  const words = (await fees.innerText()).replace(/\s+/g, ' ');
  for (const said of ['Heura Studios has three plans. Free costs nothing and has limits.',
    'Pro, for one builder, and Studio, for a team, are paid monthly subscriptions',
    'Every plan comes with credits each month', 'every price are on the Plan page in the app',
    'A credit pays for one answer a model writes for you', 'They don’t carry over to the next month.',
    'Free has fewer credits, and daily and hourly limits on answers, trainings and exam runs', 'Free can’t buy credits.',
    'Credits you buy are used after your month’s credits, oldest first, and they never expire.',
    'deleting your account deletes them', 'What your teammates ask and train on your assistants takes your credits.',
    'Pro and Studio are billed monthly in advance, in US dollars, through our payment processor, Stripe',
    'You can cancel at any time in the app (Plan, then Manage billing).', 'Deleting your account ends your subscription at once.',
    'Payments are non-refundable, including for part of a month and for credits, except where the law or this section says otherwise.',
    'We will tell you at least 30 days before a price increase', 'you keep the limits you had in early access for 30 days',
    'Nothing you use costs money unless you choose a paid plan or buy credits.',
    'and the credits you bought and haven’t used', 'that provider bills you directly']) {
    assert.ok(words.includes(said), said);
  }
  assert.doesNotMatch(words, /\$|USD/, 'prices are only in the app');
  assert.doesNotMatch(words, /\b(Pro|Studio) plan\b|\d[\d,]* credits/, 'no plan card and no number of credits either');
  assert.doesNotMatch(words, /expire after|12 months|for a year|last a year/, 'bought credits never expire');
  const all = await page.locator('main').innerText();
  assert.doesNotMatch(all, /free during early access/i);
  assert.match(all, /These Terms take effect on November 26, 2026\. If you agreed to an earlier version, they apply to you from December 11, 2026/);
  assert.match(all, /deleting your account removes it and everything in it, including any credits left on it, right away\./);
  const agreement = page.locator('section[aria-labelledby="agreement"]');
  assert.equal(await agreement.getByRole('link', { name: 'November 18, 2026' }).getAttribute('href'), '/terms/2026-11-18/');
  assert.equal(await agreement.getByRole('link', { name: 'October 15, 2026' }).getAttribute('href'), '/terms/2026-10-15/');
  assert.deepEqual(errors, []);
  await close();
});

test('the Privacy Policy says what billing and the credits record collect, that Stripe processes payments and how long each is kept', async () => {
  const { page, errors, close } = await open('/privacy/');
  const all = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  assert.doesNotMatch(all, /collect no payment information|free during early access|Billing information \(Studio\)/i);
  const row = page.locator('.legal-table tr', { hasText: 'Billing information (paid plans and credits)' });
  assert.equal(await row.count(), 1);
  assert.match(await row.innerText(), /the credits you buy, invoices and payments\. .*we never receive your full card number/s);
  const usage = page.locator('.legal-table tr', { hasText: 'Usage and credits' });
  assert.equal(await usage.count(), 1);
  assert.match((await usage.innerText()).replace(/\s+/g, ' '), /Counts and amounts, not what was asked or answered\. Automatically$/);
  assert.match(await page.locator('section[aria-labelledby="sharing"]').innerText(), /Stripe \(Stripe Payments Canada, Ltd\. and its affiliates, including Stripe, Inc\. in the United States\) processes payments for Pro, Studio and the credits you buy\./);
  const retention = await page.locator('section[aria-labelledby="retention"]').innerText();
  assert.match(retention, /Credits and usage: your credits record is kept while your account is open and deleted with it\./);
  assert.match(retention, /Billing records \(invoices, payments, and the plan or credits they were for\).* even after you delete your account\./);
  assert.match(all, /send service notices, such as an email when your month’s credits run out/);
  assert.match(all, /Waitlist and inquiry information Name, email address, company, role, your question, the page that sent you/);
  assert.match(all, /This version takes effect on November 26, 2026\. If you agreed to an earlier version, it applies to you from December 11, 2026/);
  const who = page.locator('section[aria-labelledby="who"]');
  assert.equal(await who.getByRole('link', { name: 'November 18, 2026' }).getAttribute('href'), '/privacy/2026-11-18/');
  assert.equal(await who.getByRole('link', { name: 'October 15, 2026' }).getAttribute('href'), '/privacy/2026-10-15/');
  assert.doesNotMatch(all, /\$|USD|\b(Pro|Studio) plan\b|\d[\d,]* credits/, 'no price, plan card or number of credits');
  assert.deepEqual(errors, []);
  await close();
});

test('the earlier versions keep their own pages, each pointing to the current one', async () => {
  for (const [current, old, back, other, date] of VERSIONS) {
    const { page, errors, status, close } = await open(old);
    assert.equal(status, 200, old);
    const heading = (await page.getByRole('heading', { level: 1 }).textContent());
    assert.match(heading, current === '/terms/' ? /^Heura Studios Terms of Service$/ : /^Heura Studios Privacy Policy$/);
    const note = page.locator('.lg-note');
    assert.equal(await note.innerText(), `This is the ${date} version. It applies to accounts made under it until December 11, 2026. ${back} took effect on November 26, 2026.`, old);
    assert.equal(await note.getByRole('link', { name: back }).getAttribute('href'), current);
    assert.match(await page.locator('main').innerText(), new RegExp(`Effective date: ${date}\\.`));
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

test('the November 18 versions say what they said, and the dated pages stay out of the sitemap', async () => {
  let { page, close } = await open('/terms/2026-11-18/');
  const fees = (await page.locator('section[aria-labelledby="fees"]').innerText()).replace(/\s+/g, ' ');
  assert.ok(fees.includes('Heura Studios has two plans. Free costs nothing and has limits.'));
  await close();
  ({ page, close } = await open('/privacy/2026-11-18/'));
  assert.match(await page.locator('main').innerText(), /Billing information \(Studio\)/);
  await close();
  const res = await fetch(server.url + '/sitemap.xml');
  const map = await res.text();
  assert.match(map, /\/terms\/</);
  assert.doesNotMatch(map, /\/(terms|privacy)\/20\d\d-/);
});
