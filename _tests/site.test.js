// heurastudios.com: the home page sends everyone to the waitlist, and the waitlist page saves a work email and a
// company to the Apps Script behind the form (stood in for here, so no Google setup is needed).
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
  await page.goto(server.url + path);
  return { page, errors, close: () => ctx.close() };
}

// The form's endpoint, answered by a stand-in. Every request it gets is recorded.
async function standIn(page, answer) {
  const action = await page.getAttribute('#wl-form', 'action');
  const sent = [];
  await page.route(url => url.href === action, async route => {
    sent.push(Object.fromEntries(new URLSearchParams(route.request().postData() || '')));
    if (answer === 'network') return route.abort();
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(answer) });
  });
  return sent;
}

async function fill(page, email, company) {
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Company name').fill(company);
  await page.getByRole('button', { name: 'Join waitlist' }).click();
}

// Nov 18, 2026 (Ryan: "anybody could sign up now ... remove the request access button and replace it with login and a
// sign up button at the top"): sign-up is open to anyone, Log in is in the header, and the home page's form is for
// inquiries (the home page's test checks it). Nov 26 ("remove sign up and like have book a demo and like start training
// for the sign up thing"): the header's button is Book a demo (the booking page), the footer's way in Start training;
// every link to the app's sign-up page (Start training, or Sign up in a post's or a page's own words) goes there.
// Before: Request access (Oct 24, for teams under contract), Launch an agent (Oct 19) and Get started (Oct 14). The
// waitlist page stays for anyone who follows an old link, with the same header.
const APP = 'https://app.heurastudios.com';
const DEMO = 'https://calendar.app.google/PqGzaF3hks8YYsnN7';
test('Book a demo in the header, Start training in the footer, Log in beside Book a demo, and nothing says Request access', async () => {
  for (const path of ['/', '/tools/', '/datasets/', '/openai-fine-tuning/', '/asteria/', '/privacy/', '/terms/', '/waitlist/', '/blog/', '/blog/what-teams-train/']) {
    const { page, errors, close } = await open(path);
    assert.equal(await page.locator('header').getByRole('link', { name: 'Book a demo', exact: true }).getAttribute('href'), DEMO, `${path}: Book a demo`);
    assert.equal(await page.locator('footer').getByRole('link', { name: 'Start training', exact: true }).getAttribute('href'), `${APP}/signup`, `${path}: Start training`);
    assert.equal(await page.locator('header, footer').getByRole('link', { name: 'Sign up', exact: true }).count(), 0, `${path}: no Sign up in the header or footer`);
    const ways = page.getByRole('link', { name: /^(Sign up|Start training)$/ });
    for (const href of await ways.evaluateAll(as => as.map(a => a.getAttribute('href')))) assert.equal(href, `${APP}/signup`, path);
    for (const href of await page.getByRole('link', { name: 'Book a demo', exact: true }).evaluateAll(as => as.map(a => a.getAttribute('href')))) assert.equal(href, DEMO, path);
    const logins = page.getByRole('link', { name: 'Log in', exact: true });
    assert.equal(await logins.count(), 1, `${path}: Log in, once`);
    assert.equal(await page.locator('header').getByRole('link', { name: 'Log in', exact: true }).count(), 1, `${path}: in the header`);
    assert.equal(await logins.getAttribute('href'), `${APP}/login`, path);
    assert.equal(await page.locator('a[href*="#request"]').count(), 0, `${path}: nothing leads to the old Request access form`);
    const text = await page.evaluate(() => document.body.innerText);
    assert.doesNotMatch(text, /Request access|by request/i, `${path}: no Request access`);
    for (const old of ['Get started', 'Launch an agent', 'Sign in', 'Request access']) {
      assert.equal(await page.getByRole('link', { name: old }).count(), 0, `${path}: no ${old}`);
    }
    if (path === '/') assert.doesNotMatch(text, /early access|store/i, path);   // the home page's copy; the legal text says both
    assert.deepEqual(errors, [], path);
    await close();
  }
});

// Every page shares one card (og-image.png: the headline beside a frame of the recording), so every page describes
// that card, not the one before it (Oct 24, 2026).
test('every page describes the share card it shows: the headline and a model’s pipeline', async () => {
  for (const path of ['/', '/tools/', '/datasets/', '/openai-fine-tuning/', '/asteria/', '/privacy/', '/terms/', '/waitlist/']) {
    const { page, errors, close } = await open(path);
    assert.equal(await page.locator('meta[property="og:image"]').getAttribute('content'), 'https://heurastudios.com/og-image.png', path);
    assert.equal(await page.locator('meta[property="og:image:alt"]').getAttribute('content'),
      'Heura Studios. Training agents without Machine Learning specialists. Beside it, a model’s pipeline in Heura Studios.', path);
    assert.deepEqual(errors, [], path);
    await close();
  }
});

test('"Email the founders" writes to Ryan, William, Tsun and Ethan at heurastudios.com, on both pages', async () => {
  for (const path of ['/', '/waitlist/']) {
    const { page, errors, close } = await open(path);
    const link = page.getByRole('link', { name: 'Email the founders' });
    assert.equal(await link.count(), 1, path);
    assert.equal(await link.getAttribute('href'),
      'mailto:ryan@heurastudios.com,william@heurastudios.com,tsun@heurastudios.com,ethan@heurastudios.com', path);
    assert.deepEqual(errors, []);
    await close();
  }
});

// Nov 8, 2026 (Ryan: "were throwing away parent company emails"): every address on the site is at heurastudios.com.
// Leo stays the privacy officer, and the Terms' contact is Ryan or Leo.
test('every email on the site is at heurastudios.com, and the legal pages name Ryan and Leo', async () => {
  const pages = ['/', '/tools/', '/datasets/', '/openai-fine-tuning/', '/asteria/', '/privacy/', '/terms/', '/waitlist/', '/blog/',
    '/blog/why-heura-studios-fits-small-business/', '/blog/heura-eval-004/', '/blog/sleep-training/',
    '/blog/what-teams-train/'];
  for (const path of pages) {
    const { page, errors, close } = await open(path);
    assert.doesNotMatch(await page.content(), /ostravanne\.com/i, path);
    for (const href of await page.locator('a[href^="mailto:"]').evaluateAll(as => as.map(a => a.getAttribute('href')))) {
      for (const to of href.slice('mailto:'.length).split('?')[0].split(',')) {
        assert.match(to, /^[a-z]+@heurastudios\.com$/, `${path}: ${to}`);
      }
    }
    assert.deepEqual(errors, [], path);
    await close();
  }
  const contact = async (path) => {
    const { page, close } = await open(path);
    const section = page.locator('section[aria-labelledby="contact"]');
    const out = { text: (await section.innerText()).replace(/\s+/g, ' '),
      to: await section.locator('a[href^="mailto:"]').evaluateAll(as => as.map(a => a.getAttribute('href'))) };
    await close();
    return out;
  };
  const privacy = await contact('/privacy/');
  assert.match(privacy.text, /Privacy officer: Leo, leo@heurastudios\.com\. Anything else: ryan@heurastudios\.com\./);
  assert.deepEqual(privacy.to, ['mailto:leo@heurastudios.com', 'mailto:ryan@heurastudios.com']);
  const terms = await contact('/terms/');
  assert.match(terms.text, /Email: ryan@heurastudios\.com or leo@heurastudios\.com\./);
  assert.deepEqual(terms.to, ['mailto:ryan@heurastudios.com', 'mailto:leo@heurastudios.com']);
});

test('the waitlist page asks for a work email and a company name, nothing else', async () => {
  const { page, errors, close } = await open('/waitlist/');
  assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Join the waitlist');
  // the fields a person is asked to fill (the bot trap is hidden from people and screen readers)
  const fields = await page.locator('#wl-form input:not([type=hidden])').evaluateAll(is => is.filter(i => !i.closest('[aria-hidden="true"]')).map(i => i.name));
  assert.deepEqual(fields, ['email', 'company']);
  assert.equal(await page.getByLabel('Work email').getAttribute('type'), 'email');
  assert.equal(await page.getByLabel('Work email').getAttribute('autocomplete'), 'email');
  assert.equal(await page.getByLabel('Company name').getAttribute('autocomplete'), 'organization');
  assert.equal(await page.locator('input[type=password]').count(), 0);
  assert.deepEqual(errors, []);
  await close();
});

test('joining sends the email, the company and where they came from, then says they are on the list', async () => {
  const { page, close } = await open('/waitlist/?utm_source=launch');
  const sent = await standIn(page, { ok: true });
  await fill(page, 'ann@acme.co', 'Acme');
  await page.getByRole('heading', { name: "You’re on the waitlist" }).waitFor();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].js, '1');
  assert.equal(sent[0].email, 'ann@acme.co');
  assert.equal(sent[0].company, 'Acme');
  assert.equal(sent[0].from, '/waitlist/?utm_source=launch');
  assert.equal(sent[0].website, '');
  assert.match(await page.locator('#wl-done').innerText(), /ann@acme\.co/);
  assert.equal(await page.locator('#wl-form').isVisible(), false);
  await close();
});

test('someone already on the list is told so, kindly', async () => {
  const { page, close } = await open('/waitlist/');
  await standIn(page, { ok: true, already: true });
  await fill(page, 'ann@acme.co', 'Acme');
  await page.getByRole('heading', { name: "You’re on the waitlist" }).waitFor();
  assert.match(await page.locator('#wl-done').innerText(), /already/i);
  await close();
});

test('a work email that does not look like one is caught before anything is sent', async () => {
  const { page, close } = await open('/waitlist/');
  const sent = await standIn(page, { ok: true });
  await fill(page, 'ann@acme', 'Acme');
  assert.match(await page.locator('#wl-error').innerText(), /work email/i);
  assert.equal(await page.getByLabel('Work email').getAttribute('aria-invalid'), 'true');
  assert.equal(sent.length, 0);
  await close();
});

test('a missing company name is caught before anything is sent', async () => {
  const { page, close } = await open('/waitlist/');
  const sent = await standIn(page, { ok: true });
  await fill(page, 'ann@acme.co', '   ');
  assert.match(await page.locator('#wl-error').innerText(), /company/i);
  assert.equal(sent.length, 0);
  await close();
});

for (const [what, answer] of [['the server says no', { ok: false, error: 'busy' }], ['the network fails', 'network']]) {
  test(`when ${what}, the form stays and says to try again`, async () => {
    const { page, close } = await open('/waitlist/');
    await standIn(page, answer);
    await fill(page, 'ann@acme.co', 'Acme');
    await page.locator('#wl-error').filter({ hasText: /try again/i }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Join waitlist' }).isEnabled(), true);
    assert.equal(await page.getByLabel('Work email').inputValue(), 'ann@acme.co');
    await close();
  });
}

test('the server refusing the email or the company points at that field', async () => {
  const { page, close } = await open('/waitlist/');
  await standIn(page, { ok: false, error: 'company' });
  await fill(page, 'ann@acme.co', 'Acme');
  await page.locator('#wl-error').filter({ hasText: /company/i }).waitFor();
  assert.equal(await page.getByLabel('Company name').getAttribute('aria-invalid'), 'true');
  await close();
});

test('without JavaScript the form still posts straight to the waitlist script', async () => {
  const { page, close } = await open('/waitlist/', { javaScriptEnabled: false });
  const form = page.locator('#wl-form');
  assert.match(await form.getAttribute('action'), /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/);
  assert.equal((await form.getAttribute('method')).toLowerCase(), 'post');
  assert.equal(await form.isVisible(), true);
  await close();
});

test('an appearance chosen on the waitlist page carries over to the home page', async () => {
  const { page, close } = await open('/waitlist/', { colorScheme: 'dark' });
  await page.getByRole('radiogroup', { name: 'Appearance' }).getByRole('radio', { name: 'Light' }).check();
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  await page.goto(server.url + '/');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  assert.equal(await page.getByRole('radiogroup', { name: 'Appearance' }).getByRole('radio', { name: 'Light' }).isChecked(), true);
  await close();
});

test('the waitlist page never says "we", before or after joining', async () => {
  const WE = /\bwe\b|\bwe'll\b|\bwe're\b|\bwe’ll\b/i;
  for (const answer of [{ ok: true }, { ok: true, already: true }]) {
    const { page, close } = await open('/waitlist/');
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), WE);
    await standIn(page, answer);
    await fill(page, 'ann@acme.co', 'Acme');
    await page.getByRole('heading', { name: "You’re on the waitlist" }).waitFor();
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), WE);
    await close();
  }
});

test('on the waitlist page the sample chat pops open by itself, and its bubble closes and opens it', async () => {
  const { page, close } = await open('/waitlist/');
  const bubble = page.locator('.wl-art .ov-chat-bubble');
  await page.waitForFunction(() => document.querySelector('.wl-art .ov-chat-bubble')?.getAttribute('aria-expanded') === 'true', null, { timeout: 4000 });
  await bubble.click();
  assert.equal(await bubble.getAttribute('aria-expanded'), 'false');
  await bubble.click();
  assert.equal(await bubble.getAttribute('aria-expanded'), 'true');
  await close();
});

test('nothing scrolls sideways on a phone', async () => {
  for (const path of ['/', '/waitlist/']) {
    const { page, close } = await open(path, { viewport: { width: 375, height: 812 } });
    await page.waitForTimeout(300);
    for (let y = 0; y < 6000; y += 400) { await page.mouse.wheel(0, 400); await page.waitForTimeout(40); }
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, path);
    await close();
  }
});
