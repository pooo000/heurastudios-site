// Heura Asteria's page (/asteria/; Ryan, Nov 24, 2026: "put an asteria overview and waitlist on the heura studios
// site ... on the top bar saying Asteria Waitlist ... either waitlist without login or signup ... the waitlist with
// an account already are higher in priority"): the overview, the two ways in (with an account: the app's Asteria
// waitlist, first in line; without: the form, posted to the Apps Script like the old waitlist, its GPU answer and what
// they'd train in "use"), and the header's link to it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, launch } = require('./helpers');

const APP = 'https://app.heurastudios.com';
let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

async function open(path = '/asteria/', options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...options });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url + path);
  return { page, errors, close: () => ctx.close() };
}

// The Apps Script, stood in for: answers what reply says and keeps what it was sent.
async function standIn(page, reply = { ok: true }) {
  const action = await page.getAttribute('#as-form', 'action');
  const sent = [];
  await page.route(url => url.href === action, async route => {
    sent.push(Object.fromEntries(new URLSearchParams(route.request().postData() || '')));
    if (reply === 'network') return route.abort();
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply) });
  });
  return sent;
}

test('the overview: what Asteria is, and Join the waitlist goes to the two ways in', async () => {
  const { page, errors, close } = await open();
  assert.equal(await page.title(), 'Heura Asteria waitlist – Heura Studios');
  assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Heura Asteria');
  assert.equal(await page.locator('.as-lead').innerText(), 'Four times as powerful as Arche, on a GPU. Join the waitlist to get it first.');
  assert.deepEqual(await page.locator('.as-facts h2').allInnerTexts(), ['4× Arche’s power', 'Runs on a GPU', 'Trains the same way']);
  assert.equal(await page.locator('main').getByRole('link', { name: 'Join the waitlist' }).getAttribute('href'), '#join');
  assert.deepEqual(errors, []);
  await close();
});

test('with an account is first in line: sign up or log in, and come back to the Studio’s Asteria waitlist', async () => {
  const { page, errors, close } = await open();
  const way = page.locator('.as-way-account');
  assert.equal(await way.locator('.as-badge').innerText(), 'First in line');
  assert.match(await page.locator('.as-join .ov-section-lead').innerText(), /People with a Heura Studios account get Asteria first/);
  assert.equal(await way.getByRole('link', { name: 'Sign up and join' }).getAttribute('href'), `${APP}/signup?next=/studio#/asteria`);
  assert.equal(await way.getByRole('link', { name: 'Log in and join' }).getAttribute('href'), `${APP}/login?next=/studio#/asteria`);
  assert.match(await page.locator('.as-way-email > p').first().innerText(), /You get in after account holders/);
  assert.deepEqual(errors, []);
  await close();
});

test('without an account: the form checks the email, the company and the GPU answer before sending anything', async () => {
  const { page, errors, close } = await open();
  const sent = await standIn(page);
  const join = page.getByRole('button', { name: 'Join without an account' });
  await join.click();
  assert.equal(await page.locator('#as-error').innerText(), 'Enter your email, like you@company.com.');
  assert.equal(await page.locator('#as-email').getAttribute('aria-invalid'), 'true');
  await page.getByLabel('Email').fill('dana@acme.com');
  await join.click();
  assert.equal(await page.locator('#as-error').innerText(), 'Enter your company, or the project you’d use Asteria for.');
  await page.getByLabel('Company or project').fill('Acme');
  await join.click();
  assert.equal(await page.locator('#as-error').innerText(), 'Say whether you have a GPU.');
  assert.equal(await page.evaluate(() => document.activeElement.name), 'gpu');
  assert.deepEqual(sent, []);
  assert.deepEqual(errors, []);
  await close();
});

test('a join sends the email, the company, /asteria/, and its GPU answer and what they’d train as the row’s note', async () => {
  const { page, errors, close } = await open();
  const sent = await standIn(page);
  await page.getByLabel('Email').fill(' dana@acme.com ');
  await page.getByLabel('Company or project').fill('Acme');
  await page.getByLabel('I need one from y’all').check();
  await page.getByLabel(/What would you train on it/).fill('A help desk agent,\n  trained on our tickets');
  await page.getByRole('button', { name: 'Join without an account' }).click();
  await page.locator('#as-done').waitFor();
  assert.equal(sent.length, 1);
  const s = sent[0];
  assert.deepEqual([s.email, s.company, s.from, s.js, s.website], ['dana@acme.com', 'Acme', '/asteria/', '1', '']);
  assert.equal(s.use, 'Asteria waitlist. GPU: needs one from us. Would train: A help desk agent, trained on our tickets');
  assert.equal(await page.locator('#as-form').isVisible(), false);
  assert.equal(await page.locator('#as-done h3').innerText(), 'You’re on the Asteria waitlist');
  assert.equal(await page.locator('#as-done-text').innerText(),
    'We’ll email dana@acme.com when Asteria opens. Account holders get it first: make one any time to move up.');
  assert.equal(await page.locator('#as-done').getByRole('link', { name: 'Make an account to move up' }).getAttribute('href'),
    `${APP}/signup?next=/studio#/asteria`);
  assert.deepEqual(errors, []);
  await close();
});

test('already on the list, no "would train", the server’s errors and a dropped connection each say so', async () => {
  const { page, errors, close } = await open();
  let sent = await standIn(page, { ok: true, already: true });
  await page.getByLabel('Email').fill('dana@acme.com');
  await page.getByLabel('Company or project').fill('Acme');
  await page.getByLabel('Not sure yet').check();
  await page.getByRole('button', { name: 'Join without an account' }).click();
  await page.locator('#as-done').waitFor();
  assert.equal(sent[0].use, 'Asteria waitlist. GPU: not sure');
  assert.match(await page.locator('#as-done-text').innerText(), /^dana@acme\.com is already on our list/);
  await close();

  for (const [reply, message] of [[{ ok: false, error: 'email' }, 'That email address doesn’t look right. Check it and try again.'],
    [{ ok: false, error: 'busy' }, 'Lots of people are joining right now. Try again in a minute.'],
    ['network', 'That didn’t go through. Check your connection and try again.']]) {
    const o = await open();
    sent = await standIn(o.page, reply);
    await o.page.getByLabel('Email').fill('dana@acme.com');
    await o.page.getByLabel('Company or project').fill('Acme');
    await o.page.getByLabel('I have a GPU').check();
    await o.page.getByRole('button', { name: 'Join without an account' }).click();
    await o.page.locator('#as-error').filter({ hasText: message }).waitFor();
    assert.equal(await o.page.getByRole('button', { name: 'Join without an account' }).isEnabled(), true);
    assert.deepEqual(o.errors, []);
    await o.close();
  }
  assert.deepEqual(errors, []);
});

test('without JavaScript the form still posts to the Apps Script, from /asteria/, marked as an Asteria join', async () => {
  const { page, close } = await open('/asteria/', { javaScriptEnabled: false });
  const form = page.locator('#as-form');
  assert.match(await form.getAttribute('action'), /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/);
  assert.equal(await form.getAttribute('method'), 'post');
  assert.equal(await form.locator('input[name=from]').inputValue(), '/asteria/');
  assert.equal(await form.locator('input[name=use]').inputValue(), 'Asteria waitlist');
  await close();
});

test('the header: Asteria waitlist on every page, the ink on its own; just "Asteria" on a small tablet; not on a phone', async () => {
  for (const path of ['/', '/tools/', '/openai-fine-tuning/', '/asteria/']) {
    const { page, close } = await open(path);
    const link = page.locator('header nav').getByRole('link', { name: 'Asteria waitlist' });
    assert.equal(await link.getAttribute('href'), '/asteria/', path);
    assert.equal(await link.innerText(), 'Asteria waitlist', path);
    assert.equal(await link.getAttribute('aria-current'), path === '/asteria/' ? 'page' : null, path);
    await close();
  }
  for (const [width, shown] of [[390, null], [519, null], [520, 'Asteria'], [579, 'Asteria'], [580, 'Asteria waitlist'], [839, 'Asteria waitlist']]) {
    const { page, close } = await open('/asteria/', { viewport: { width, height: 800 } });
    const link = page.locator('header nav a[href="/asteria/"]');
    if (shown === null) assert.equal(await link.isVisible(), false, `${width}`);
    else {
      assert.equal(await link.innerText(), shown, `${width}`);
      assert.equal(await link.getAttribute('aria-label'), 'Asteria waitlist', `${width}: its name stays whole`);
    }
    assert.ok(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth), `${width}`);
    await close();
  }
});

test('on a phone and in dark it fits the screen, and the search engines can find it', async () => {
  for (const options of [{ viewport: { width: 375, height: 812 } }, { colorScheme: 'dark' }]) {
    const { page, errors, close } = await open('/asteria/', options);
    assert.ok(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []);
    await close();
  }
  assert.match(await (await fetch(server.url + '/sitemap.xml')).text(), /<loc>https:\/\/heurastudios\.com\/asteria\/<\/loc>/);
});
