// The header: Log in and Sign up, at the right, that fit every width (Ryan, Nov 18, 2026: "remove the request access
// button and replace it with login and a sign up button at the top"; before, one button, Request access since Oct 24).
// And no prices on the public pages (Ryan, Oct 19, 20:47: "remove the pricing thing on the main page, only have it on
// the actual product page after the login"): the plans are on the Plan page in Heura Studios.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, launch } = require('./helpers');

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

async function open(path, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce', ...options });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url + path);
  return { page, errors, close: () => ctx.close() };
}

test('no prices on the public pages: the plans are in Heura Studios, after logging in', async () => {
  for (const path of ['/', '/tools/', '/datasets/', '/privacy/', '/terms/', '/waitlist/']) {
    const { page, errors, close } = await open(path);
    assert.equal(await page.locator('#pricing, .ov-plans').count(), 0, path);
    assert.equal(await page.locator('a[href$="#pricing"]').count(), 0, path);
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /\$[\d,]+( a month|\/mo)|US\$|\bPro\b.*\bMax\b|\bStudio plan\b/, path);
    assert.deepEqual(errors, [], path);
    await close();
  }
});

// The header: the logo, the three sections (from 760px), then Log in and Sign up, at the right: both go to the app
// (sign-up is open to anyone since Nov 18). Datasets since Nov 18 (Ryan: "have it as a seperate tab at the top"),
// between Tools and Blog.
const APP = 'https://app.heurastudios.com';
for (const path of ['/', '/tools/', '/datasets/', '/blog/', '/privacy/', '/terms/', '/waitlist/']) {
  test(`${path}: the header fits from 320px to 1280px, Log in and then Sign up at the right`, async () => {
    for (const width of [320, 360, 375, 390, 414, 420, 479, 480, 520, 600, 759, 760, 834, 880, 960, 1024, 1280]) {
      const { page, close } = await open(path, { viewport: { width, height: 700 } });
      const row = await page.evaluate(() => {
        const r = document.querySelector('.ov-top-row');
        const cs = getComputedStyle(r);
        const inner = [r.getBoundingClientRect().left + parseFloat(cs.paddingLeft), r.getBoundingClientRect().right - parseFloat(cs.paddingRight)];
        const shown = [...r.children].filter(e => getComputedStyle(e).display !== 'none').map(e => {
          const b = e.getBoundingClientRect();
          return { what: e.className, left: b.left, right: b.right };
        });
        return { inner, shown };
      });
      const where = `${path} at ${width}px`;
      for (const k of row.shown) assert.ok(k.left >= row.inner[0] - 0.5 && k.right <= row.inner[1] + 0.5, `${where}: ${k.what} spills out of the header`);
      for (let i = 1; i < row.shown.length; i++) assert.ok(row.shown[i].left >= row.shown[i - 1].right, `${where}: ${row.shown[i].what} overlaps ${row.shown[i - 1].what}`);
      const header = page.locator('header');
      const login = header.getByRole('link', { name: 'Log in', exact: true });
      const signup = header.getByRole('link', { name: 'Sign up', exact: true });
      assert.equal(await login.count(), 1, where);
      assert.equal(await signup.count(), 1, where);
      assert.equal(await login.getAttribute('href'), `${APP}/login`, where);
      assert.equal(await signup.getAttribute('href'), `${APP}/signup`, where);
      assert.equal(await header.getByText('Request access').count(), 0, `${where}: no Request access`);
      const last = row.shown[row.shown.length - 1];
      assert.ok(last.what.includes('ov-top-acts') && Math.abs(last.right - row.inner[1]) <= 1, `${where}: they sit at the right`);
      const [l, u] = [await login.boundingBox(), await signup.boundingBox()];
      assert.ok(l.x + l.width <= u.x + 0.5, `${where}: Log in comes before Sign up`);
      assert.ok(Math.abs(u.x + u.width - row.inner[1]) <= 1, `${where}: Sign up is the last thing in the header`);
      assert.ok(l.height >= 44 && (await signup.evaluate(a => a.className)).includes('ov-btn-primary'), `${where}: Log in is a tap target; Sign up the button`);
      for (const b of [l, u]) assert.ok(b.x >= row.inner[0] - 0.5 && b.x + b.width <= row.inner[1] + 0.5, `${where}: in the header`);
      const nav = await header.locator('nav a').evaluateAll(as => as.filter(a => a.getBoundingClientRect().width > 0).map(a => a.textContent.trim()));
      // (Nov 24: Asteria waitlist, the fourth; under 840px it's alone, and a phone has no room for it)
      assert.deepEqual(nav, width >= 840 ? ['Tools', 'Datasets', 'Blog', 'Asteria waitlist'] : width >= 520 ? ['Asteria waitlist'] : [], where);
      await close();
    }
  });
}

// Ryan, Nov 14: a redesign of the top; he chose "the one thats on the side" (option B): the header is a capsule floating
// 12px under the top of the screen, outlined in the page's line color and fully round, the section you're on in the
// ink and the others quieter.
test('the header is a capsule: outlined, fully round, floating under the top; the section you are on in the ink', async () => {
  for (const [width, path] of [[390, '/'], [1024, '/tools/'], [1280, '/datasets/'], [1600, '/blog/']]) {
    const { page, close } = await open(path, { viewport: { width, height: 800 } });
    const look = await page.evaluate(() => {
      const top = document.querySelector('.ov-top'), row = document.querySelector('.ov-top-row');
      const s = getComputedStyle(row), r = row.getBoundingClientRect();
      const probe = document.createElement('i');
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
      document.body.append(probe); const line = getComputedStyle(probe).color; probe.remove();
      const ink = getComputedStyle(document.body).color;
      return {
        border: [s.borderTopWidth, s.borderTopStyle, s.borderTopColor, s.borderBottomColor], line,
        round: parseFloat(s.borderTopLeftRadius) >= r.height / 2, gap: r.top - top.getBoundingClientRect().top,
        inside: r.left > 0 && r.right < innerWidth,
        links: [...document.querySelectorAll('.ov-nav a')].filter(a => a.getBoundingClientRect().width > 0)
          .map(a => [a.textContent.trim(), a.getAttribute('aria-current'), getComputedStyle(a).color]), ink,
      };
    });
    const where = `${path} at ${width}px`;
    assert.deepEqual(look.border, ['1px', 'solid', look.line, look.line], `${where}: outlined in the line color`);
    assert.ok(look.round, `${where}: fully round`);
    assert.equal(look.gap, 12, `${where}: 12px under the top`);
    assert.ok(look.inside, `${where}: clear of the screen's edges`);
    for (const [name, current, color] of look.links) {
      if (current === 'page') assert.equal(color, look.ink, `${where}: ${name}, the section you're on`);
      else assert.notEqual(color, look.ink, `${where}: ${name}, quieter`);
    }
    await close();
  }
});
