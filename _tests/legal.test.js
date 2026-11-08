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
