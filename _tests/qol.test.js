// The footer's QOL suggestions box, on every page (Ryan, Nov 27, 2026: "make a new thing at the bottom make a QOL
// suggestions and send them to contact@heurastudios.com"): a node of its own under the footer's row, on wires of its
// own, with the suggestion (it grows as it's typed), an email (optional) and Send. It posts to the forms' Apps Script
// (kind=suggestion), stood in for here; the script keeps it on the sheet's Suggestions tab and emails it to
// contact@heurastudios.com (_backend/test checks that half).
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, launch } = require('./helpers');

const SCRIPT = 'https://script.google.com/macros/s/AKfycbzZfe89ETbdFbdA9Yvv-BJn_RDsXYpnbazX_mfaa4_vJPWOwQsnIa13JanuQATVI6C8/exec';
const PAGES = ['/', '/tools/', '/datasets/', '/openai-fine-tuning/', '/asteria/', '/waitlist/', '/privacy/', '/terms/',
  '/blog/', '/blog/what-teams-train/'];

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

// The script behind the form, stood in for: answers what reply says and keeps what it was sent.
async function standIn(page, reply = { ok: true }, status = 200) {
  const sent = [];
  await page.route(SCRIPT, route => {
    sent.push(Object.fromEntries(new URLSearchParams(route.request().postData() || '')));
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  return sent;
}

const box = page => page.locator('footer .ov-node.is-qol');
const field = (page, label) => box(page).getByLabel(label, { exact: true });
const send = page => box(page).getByRole('button', { name: 'Send', exact: true }).click();
const focused = page => page.evaluate(() => document.activeElement.id);

// A computed color: rgb()/rgba() in 0 to 255, or color(srgb …) in 0 to 1 (what color-mix() computes to).
function luminance(css) {
  const scale = /^color\(srgb/.test(css) ? 1 : 255;
  const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / scale)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const near = (a, b) => Math.abs(a - b) <= 1.5;

test('every page has the QOL suggestions box at the bottom of its footer, posting to the forms’ script', async () => {
  for (const path of PAGES) {
    const { page, errors, close } = await open(path);
    const at = path;
    assert.equal(await box(page).count(), 1, at);
    assert.equal(await box(page).getByRole('heading', { level: 2 }).innerText(), 'QOL suggestions', at);
    assert.equal(await box(page).locator('.ov-qol-lead').innerText(), 'Small quality-of-life fixes for Heura Studios. Each one goes to the team.', at);
    const form = page.getByRole('form', { name: 'QOL suggestions' });
    assert.equal(await form.getAttribute('action'), SCRIPT, at);
    assert.equal(await form.getAttribute('method'), 'post', at);
    assert.equal(await form.locator('input[name="kind"]').inputValue(), 'suggestion', at);
    const text = field(page, 'Suggestion');
    assert.deepEqual(await text.evaluate(t => [t.tagName, t.name, t.required, t.maxLength]), ['TEXTAREA', 'suggestion', true, 2000], at);
    const email = field(page, 'Email (optional)');
    assert.deepEqual(await email.evaluate(i => [i.type, i.name, i.required, i.autocomplete]), ['email', 'email', false, 'email'], at);
    assert.equal(await email.getAttribute('aria-describedby'), 'ov-qol-fine', `${at}: the email says what it's for`);
    assert.equal(await box(page).locator('#ov-qol-fine').innerText(), 'An email is only for a reply.', at);
    assert.equal(await box(page).getByRole('button').innerText(), 'Send', at);
    // in the footer, under its row and above the copyright and the Appearance setting
    const [qol, row, bottom] = [await box(page).boundingBox(), await page.locator('.ov-node.is-contact').boundingBox(),
      await page.locator('.ov-foot-bottom').boundingBox()];
    assert.ok(qol.y > row.y + row.height && qol.y + qol.height < bottom.y, at);
    // the shared form logic and the box's own, once each
    for (const src of ['/form.js', '/qol.js']) assert.equal(await page.locator(`script[src="${src}"]`).count(), 1, `${at}: ${src}`);
    assert.deepEqual(errors, [], at);
    await close();
  }
});

test('sending a suggestion posts it with the email and the page it was sent from, and thanks them', async () => {
  const { page, errors, close } = await open('/tools/?utm_source=launch');
  const sent = await standIn(page);
  await field(page, 'Suggestion').fill('  A shortcut to start a run\nand one to stop it ');
  await field(page, 'Email (optional)').fill(' ann@acme.co ');
  await send(page);
  const done = box(page).locator('#ov-qol-done');
  await done.waitFor();
  assert.equal(await done.locator('.ov-qol-done-title').innerText(), 'Suggestion sent');
  assert.equal(await done.locator('#ov-qol-done-text').innerText(),
    'Thanks. The team reads every one, and writes to ann@acme.co if it has a question.');
  assert.equal(await focused(page), 'ov-qol-done', 'focus moves to what happened');
  assert.equal(await page.locator('#ov-qol-form').isVisible(), false);
  assert.equal(sent.length, 1);
  const got = sent[0];
  assert.deepEqual([got.suggestion, got.email, got.kind, got.from, got.js, got.website],
    ['A shortcut to start a run\nand one to stop it', 'ann@acme.co', 'suggestion', '/tools/?utm_source=launch', '1', '']);
  assert.equal(got.name, undefined, 'nothing from any other form');
  assert.deepEqual(errors, []);
  await close();
});

test('without an email it goes too, and the thanks says nothing about writing back', async () => {
  const { page, close } = await open('/blog/');
  const sent = await standIn(page);
  await field(page, 'Suggestion').fill('Dark mode for the run log');
  await send(page);
  await box(page).locator('#ov-qol-done').waitFor();
  assert.equal(await box(page).locator('#ov-qol-done-text').innerText(), 'Thanks. The team reads every one.');
  assert.deepEqual([sent[0].email, sent[0].from], ['', '/blog/']);
  await close();
});

test('Send another brings the box back, empty and ready, the suggestion focused; the next one posts as the first did', async () => {
  const { page, close } = await open('/');
  const sent = await standIn(page);
  await field(page, 'Suggestion').fill('First');
  await field(page, 'Email (optional)').fill('ann@acme.co');
  await send(page);
  await box(page).getByRole('button', { name: 'Send another' }).click();
  assert.equal(await page.locator('#ov-qol-form').isVisible(), true);
  assert.equal(await box(page).locator('#ov-qol-done').isVisible(), false);
  assert.deepEqual([await field(page, 'Suggestion').inputValue(), await field(page, 'Email (optional)').inputValue()], ['', '']);
  const button = box(page).getByRole('button', { name: 'Send', exact: true });
  assert.deepEqual([await button.isEnabled(), await button.innerText()], [true, 'Send']);
  assert.equal(await focused(page), 'ov-qol-text');
  assert.equal(await page.locator('#ov-qol-error').innerText(), '');
  await field(page, 'Suggestion').fill('Second');
  await send(page);
  await box(page).locator('#ov-qol-done').waitFor();
  assert.equal(await box(page).locator('#ov-qol-done-text').innerText(), 'Thanks. The team reads every one.');
  assert.deepEqual(sent.map(s => [s.suggestion, s.email, s.from, s.kind]), [['First', 'ann@acme.co', '/', 'suggestion'],
    ['Second', '', '/', 'suggestion']]);
  await close();
});

test('an empty suggestion, or an email that is not one, is caught before anything is sent', async () => {
  const { page, close } = await open('/');
  const sent = await standIn(page);
  const error = page.locator('#ov-qol-error');
  // in the accessibility tree before there's anything to say, so the first message is announced like the rest
  assert.notEqual(await error.evaluate(e => getComputedStyle(e).display), 'none');
  assert.equal(await error.getAttribute('role'), 'alert');
  await send(page);
  assert.equal(await error.innerText(), 'Write your suggestion first.');
  assert.equal(await field(page, 'Suggestion').getAttribute('aria-invalid'), 'true');
  assert.equal(await field(page, 'Suggestion').getAttribute('aria-describedby'), 'ov-qol-error');
  assert.equal(await focused(page), 'ov-qol-text');
  await field(page, 'Suggestion').fill('  \n ');
  await send(page);
  assert.equal(await error.innerText(), 'Write your suggestion first.');
  await field(page, 'Suggestion').fill('Undo in the notebook');
  await field(page, 'Email (optional)').fill('ann@acme');
  await send(page);
  assert.equal(await error.innerText(), 'That email doesn’t look right. Fix it, or leave it empty.');
  assert.equal(await focused(page), 'ov-qol-email');
  assert.equal(await field(page, 'Suggestion').getAttribute('aria-invalid'), null);
  // the email's own description stays, after the error's
  assert.equal(await field(page, 'Email (optional)').getAttribute('aria-describedby'), 'ov-qol-error ov-qol-fine');
  await page.waitForFunction(() => getComputedStyle(document.activeElement).borderTopColor === 'rgb(255, 138, 128)',
    null, { timeout: 2000 });   // red while focused (the footer is always dark: dark's red)
  assert.equal(sent.length, 0);
  await close();
});

for (const [what, reply, status] of [['the script is down', { ok: true }, 500], ['the script is busy', { ok: false, error: 'busy' }, 200]]) {
  test(`when ${what}, the box stays, keeps what was typed and says to try again`, async () => {
    const { page, close } = await open('/');
    await standIn(page, reply, status);
    await field(page, 'Suggestion').fill('A bigger run log');
    await send(page);
    await page.waitForFunction(() => /try again/i.test(document.getElementById('ov-qol-error').textContent));
    assert.equal(await page.locator('#ov-qol-form').isVisible(), true);
    assert.equal(await box(page).getByRole('button', { name: 'Send', exact: true }).isEnabled(), true);
    assert.equal(await field(page, 'Suggestion').inputValue(), 'A bigger run log');
    await close();
  });
}

for (const [error, id, said] of [['suggestion', 'ov-qol-text', /up to 2,000 characters/], ['email', 'ov-qol-email', /Fix it, or leave it empty/]]) {
  test(`the script refusing the ${error} points at that field`, async () => {
    const { page, close } = await open('/');
    await standIn(page, { ok: false, error });
    await field(page, 'Suggestion').fill('Hi');
    await field(page, 'Email (optional)').fill('ann@acme.co');
    await send(page);
    await page.waitForFunction(() => document.getElementById('ov-qol-error').textContent !== '');
    assert.equal(await focused(page), id);
    assert.match(await page.locator('#ov-qol-error').innerText(), said);
    await close();
  });
}

test('the suggestion grows as it’s typed, up to its cap, and then scrolls; it’s back to one line for the next one', async () => {
  const { page, close } = await open('/');
  await standIn(page);
  const text = field(page, 'Suggestion');
  const size = () => text.evaluate(t => ({ h: t.getBoundingClientRect().height, scroll: t.scrollHeight, client: t.clientHeight }));
  assert.equal((await size()).h, 44, 'one line to start, as tall as the email and Send');
  assert.equal((await box(page).locator('input.is-email').boundingBox()).height, 44);
  assert.equal((await box(page).getByRole('button', { name: 'Send', exact: true }).boundingBox()).height, 44);
  await text.fill('One\nTwo\nThree');
  const three = await size();
  assert.ok(three.h > 44 && three.scroll <= three.client + 1, `three lines, all shown (${JSON.stringify(three)})`);
  await text.fill(Array.from({ length: 30 }, (_, i) => `Line ${i}`).join('\n'));
  const thirty = await size();
  assert.equal(thirty.h, 220, 'no taller than its cap');
  assert.ok(thirty.scroll > thirty.client, 'past it, it scrolls');
  await send(page);
  await box(page).getByRole('button', { name: 'Send another' }).click();
  await page.waitForFunction(() => document.getElementById('ov-qol-text').getBoundingClientRect().height === 44);
  await close();
});

test('without JavaScript the box still posts straight to the script, with the page it’s on', async () => {
  const { page, close } = await open('/tools/', { javaScriptEnabled: false });
  const form = page.locator('#ov-qol-form');
  assert.equal(await form.isVisible(), true);
  assert.equal(await form.getAttribute('action'), SCRIPT);
  assert.equal((await form.getAttribute('method')).toLowerCase(), 'post');
  assert.equal(await form.locator('input[name="from"]').inputValue(), '/tools/');
  assert.equal(await form.locator('input[name="kind"]').inputValue(), 'suggestion');
  await close();
});

// Its wires: ends of each path drawn by the .ov-edge drawings in the box, on the screen
async function qolPipe(page) {
  return page.evaluate(() => {
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; };
    const node = document.querySelector('.ov-node.is-qol'), foot = document.querySelector('.ov-foot');
    const ends = (svg) => [...svg.querySelectorAll('path')].map((p) => {
      const m = p.getScreenCTM(), n = p.getTotalLength();
      const at = (l) => { const q = p.getPointAtLength(l); return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }; };
      return { from: at(0), to: at(n), shown: getComputedStyle(svg).display !== 'none' };
    });
    return {
      node: box(node), head: box(node.querySelector('h2')), foot: box(foot),
      in: box(node.querySelector('.ov-port.is-in')), out: box(node.querySelector('.ov-port.is-out')),
      edgeIn: ends(node.querySelector('.ov-edge.is-in')), edgeOut: ends(node.querySelector('.ov-edge.is-out')),
      row: [...document.querySelectorAll('.ov-pipe > .ov-node:not(.is-qol)')].map(box),
      send: box(node.querySelector('.ov-qol-send')), text: box(node.querySelector('textarea')), email: box(node.querySelector('input.is-email')),
      sideways: document.documentElement.scrollWidth - innerWidth,
    };
  });
}

test('on a computer it sits under the row, only as wide as its form needs, wired in from the left edge and out past the right, level with its name', async () => {
  for (const width of [1600, 1100, 900]) {
    const { page, close } = await open('/terms/', { viewport: { width, height: 1000 } });
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const q = await qolPipe(page);
    const at = `${width}px`;
    assert.ok(q.row.every(n => q.node.y > n.y + n.h + 20), `${at}: under the row`);
    assert.ok(near(q.node.x, q.row[0].x), `${at}: on its left edge`);
    assert.ok(q.node.w <= 760.5 && q.node.w >= Math.min(760, q.row[3].x + q.row[3].w - q.row[0].x) - 1, `${at}: 760px, or the row's width (${q.node.w})`);
    // the ports on its edges, level with its name
    assert.ok(near(q.in.cx, q.node.x) && near(q.out.cx, q.node.x + q.node.w), `${at}: a port on each side`);
    assert.ok(near(q.in.cy, q.head.cy) && near(q.out.cy, q.head.cy), `${at}: level with its name (${q.in.cy} vs ${q.head.cy})`);
    // a wire in from the footer's left edge to the in port, one out of the out port past its right edge
    for (const w of q.edgeIn) {
      assert.ok(w.shown && w.from.x <= q.foot.x, `${at}: in from the left edge (${w.from.x})`);
      assert.ok(near(w.to.y, q.in.cy) && w.to.x >= q.in.x - 1.5 && w.to.x <= q.in.x + q.in.w + 1.5, `${at}: into its port`);
    }
    for (const w of q.edgeOut) {
      assert.ok(w.shown && w.to.x >= q.foot.x + q.foot.w, `${at}: out past the right edge (${w.to.x})`);
      assert.ok(near(w.from.y, q.out.cy) && w.from.x >= q.out.x - 1.5 && w.from.x <= q.out.x + q.out.w + 1.5, `${at}: out of its port`);
    }
    // its form in a row: the suggestion, the email, then Send, their tops level
    assert.ok(q.text.x + q.text.w < q.email.x && q.email.x + q.email.w < q.send.x, `${at}: in a row`);
    assert.ok(near(q.text.y, q.email.y) && near(q.email.y, q.send.y), `${at}: tops level`);
    assert.ok(q.send.x + q.send.w <= q.node.x + q.node.w - 12, `${at}: inside the node`);
    assert.ok(q.sideways <= 0, `${at}: nothing scrolls sideways`);
    await close();
  }
});

test('on a phone it’s the last node of the stack, a wire down into it from Contact, its fields one under another', async () => {
  for (const width of [320, 390, 768]) {
    const { page, close } = await open('/', { viewport: { width, height: 900 } });
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const q = await qolPipe(page);
    const at = `${width}px`;
    const contact = q.row[3];
    const contactOut = await page.locator('.ov-node.is-contact .ov-port.is-out').evaluate((e) => {
      const r = e.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, shown: getComputedStyle(e).display !== 'none' };
    });
    assert.ok(q.node.y > contact.y + contact.h, `${at}: under Contact`);
    assert.ok(contactOut.shown && near(contactOut.cx, q.in.cx), `${at}: Contact's port above its port`);
    assert.ok(contactOut.cy > contact.y + contact.h - 3 && q.in.cy < q.node.y + 3, `${at}: on the bottom and top edges`);
    assert.equal(await page.locator('.ov-node.is-qol').evaluate(n => getComputedStyle(n, '::before').content !== 'none'), true, `${at}: a wire down into it`);
    assert.equal(await page.locator('.ov-node.is-qol .ov-port.is-out').isVisible(), false, `${at}: nothing out of it`);
    assert.ok([...q.edgeIn, ...q.edgeOut].every(w => !w.shown), `${at}: no wires at the ends`);
    assert.ok(q.text.y + q.text.h < q.email.y && q.email.y + q.email.h < q.send.y, `${at}: suggestion, email, Send, one under another`);
    assert.ok(near(q.text.x, q.email.x) && near(q.email.x, q.send.x), `${at}: on one left edge`);
    assert.ok(q.node.x >= 0 && q.node.x + q.node.w <= width, `${at}: on the screen`);
    assert.ok(q.sideways <= 0, `${at}: nothing scrolls sideways`);
    await close();
  }
});

for (const scheme of ['light', 'dark']) {
  test(`its words read at 4.5:1 or more and its fields’ edges at 3:1, on the footer’s dark canvas (${scheme})`, async () => {
    const { page, close } = await open('/', { colorScheme: scheme });
    const colors = await page.evaluate(() => {
      const node = document.querySelector('.ov-node.is-qol'), bg = getComputedStyle(node).backgroundColor;
      const css = (sel, prop = 'color') => getComputedStyle(node.querySelector(sel))[prop];
      return { bg, field: css('textarea', 'backgroundColor'), edge: css('textarea', 'borderTopColor'), typed: css('textarea'),
        words: ['h2', '.ov-qol-lead', 'label.is-text', 'label.is-email', '.ov-qol-fine', '.ov-qol-error', '.ov-qol-done-title', '.ov-qol-again'].map(s => [s, css(s)]),
        send: [css('.ov-qol-send'), css('.ov-qol-send', 'backgroundColor')] };
    });
    for (const [sel, fg] of colors.words) assert.ok(ratio(fg, colors.bg) >= 4.5, `${sel}: ${fg} on ${colors.bg}`);
    assert.ok(ratio(colors.typed, colors.field) >= 4.5, `what's typed: ${colors.typed} on ${colors.field}`);
    assert.ok(ratio(colors.edge, colors.bg) >= 3 && ratio(colors.edge, colors.field) >= 3, `a field's edge: ${colors.edge}`);
    assert.ok(ratio(...colors.send) >= 4.5, `Send: ${colors.send}`);
    await close();
  });
}

test('it never says "we", nor anything with an exclamation mark, before or after sending; nothing in it is under 11px', async () => {
  const { page, close } = await open('/', { viewport: { width: 390, height: 844 } });
  await standIn(page);
  const check = async (when) => {
    const words = await box(page).evaluate(n => n.innerText);
    assert.doesNotMatch(words, /\bwe\b|\bwe'll\b|\bwe're\b|\bwe’ll\b|\bwe’re\b|!/i, when);
    const small = await box(page).evaluate(n => [...n.querySelectorAll('*')].filter(el => {
      const text = [...el.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent.trim()).join('');
      return text && el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true }) && parseFloat(getComputedStyle(el).fontSize) < 11;
    }).map(el => el.textContent.trim()));
    assert.deepEqual(small, [], when);
  };
  await check('before');
  await field(page, 'Suggestion').fill('Keyboard shortcuts');
  await field(page, 'Email (optional)').fill('ann@acme.co');
  await send(page);
  await box(page).locator('#ov-qol-done').waitFor();
  await check('after');
  await close();
});

test('its form is named for it, its fields are big enough to type in on a phone, and its decoration is hidden from screen readers', async () => {
  const { page, close } = await open('/', { viewport: { width: 390, height: 844 } });
  assert.equal(await page.getByRole('form', { name: 'QOL suggestions' }).count(), 1);
  // 16px or more: an iPhone zooms the page into a field with smaller text
  for (const sel of ['textarea', 'input.is-email']) {
    assert.ok(parseFloat(await box(page).locator(sel).evaluate(e => getComputedStyle(e).fontSize)) >= 16, sel);
  }
  for (const sel of ['.ov-qol-send', '.ov-qol-again']) {
    await box(page).locator(sel).evaluate(e => { e.closest('[hidden]')?.removeAttribute('hidden'); });
    assert.ok((await box(page).locator(sel).boundingBox()).height >= 44, `${sel}: 44px to tap`);
  }
  assert.equal(await box(page).locator('.ov-edge, .ov-port, .ov-tile, .ov-qol-trap').evaluateAll(
    els => els.filter(e => e.getAttribute('aria-hidden') !== 'true').length), 0);
  assert.equal(await box(page).locator('#ov-qol-website').getAttribute('tabindex'), '-1', 'the bots’ field is out of the tab order');
  await close();
});

test('on the home page the inquiry form and the box each send only their own fields', async () => {
  const { page, errors, close } = await open('/');
  const sent = await standIn(page);
  const inquiry = page.locator('#hm-form');
  for (const [label, value] of [['Name', 'Ann'], ['Email', 'ann@acme.co'], ['Question', 'What does it cost?']]) {
    await inquiry.getByLabel(label, { exact: true }).fill(value);
  }
  await field(page, 'Suggestion').fill('Bigger buttons');
  await page.getByRole('button', { name: 'Send inquiry' }).click();
  await page.locator('#hm-done').waitFor();
  await send(page);
  await box(page).locator('#ov-qol-done').waitFor();
  assert.deepEqual(sent.map(s => [s.kind, s.message, s.suggestion]), [['inquiry', 'What does it cost?', undefined],
    ['suggestion', undefined, 'Bigger buttons']]);
  assert.deepEqual(errors, []);
  await close();
});
