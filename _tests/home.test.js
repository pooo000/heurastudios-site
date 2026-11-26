// The home page (Oct 24, 2026: the post-training positioning). The hero (the headline, the lead, and since Nov 26 Book a
// demo and Start training, after Arga Labs' hero), a looping recording of one run in Heura Studios
// with a Pause button (on a phone, a recording of the Studio at a phone's size), Specifications, and the inquiry form
// (Ryan, Nov 18: "if you want to ask a question, you don't have to email the founder itself ... you just inquire"; until
// then the form was Request access). Quiet on purpose: the recording is the one thing that moves, and it stops with
// Pause, with Reduce Motion, and off screen. No text under 11px, no "we".
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, launch } = require('./helpers');

const SCRIPT = 'https://script.google.com/macros/s/AKfycbzZfe89ETbdFbdA9Yvv-BJn_RDsXYpnbazX_mfaa4_vJPWOwQsnIa13JanuQATVI6C8/exec';

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

async function open(path, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...options });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url + path);
  return { page, errors, ctx, close: () => ctx.close() };
}

// A computed color: rgb()/rgba() in 0 to 255, or color(srgb …) in 0 to 1 (what color-mix() computes to).
function luminance(css) {
  const scale = /^color\(srgb/.test(css) ? 1 : 255;
  const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / scale)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

// The script behind the form, stood in for: answers what reply says and keeps what it was sent.
async function standIn(page, reply = { ok: true }, status = 200) {
  const sent = [];
  await page.route(SCRIPT, route => {
    sent.push(new URLSearchParams(route.request().postData() || ''));
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  return sent;
}

async function fill(page, values) {
  const form = page.locator('#hm-form');
  for (const [label, value] of Object.entries(values)) await form.getByLabel(label, { exact: true }).fill(value);
}

// The lead says what trains a checkpoint (demonstrations and corrections: documents ground answers, they don't train)
// and the gate, in the words an ML lead would use. The ways in (Ryan, Nov 26: "have book a demo and like start training
// for the sign up thing but have them in the top text thing"): the hero's Book a demo (the booking page) and Start
// training (the app's sign-up); the header has Log in and Book a demo.
const DEMO = 'https://calendar.app.google/PqGzaF3hks8YYsnN7';
test('the hero: the headline, the lead, Book a demo and Start training; the header has Log in and Book a demo', async () => {
  const { page, errors, close } = await open('/');
  assert.equal(await page.title(), 'Post-training for AI-native companies – Heura Studios');
  // (Ryan, Nov 16: "can you change the heading into Training agents without Machine Learning specialists")
  assert.equal(await page.locator('h1').innerText(), 'Training agents without Machine Learning specialists');
  // (Ryan, Nov 14: "make it straight to the point"): three short lines
  assert.equal((await page.locator('.hm-hero .ov-lead').innerText()).replace(/\s+/g, ' '),
    'Fine-tune the base on your team’s examples. Test every version on your eval set. Ship only the ones that don’t get worse.');
  assert.equal(await page.locator('.hm-hero .ov-lead br').count(), 2);
  assert.deepEqual(await page.locator('.hm-hero .ov-btn').evaluateAll(as => as.map(a => [a.textContent.trim(), a.getAttribute('href'), a.classList.contains('ov-btn-primary')])),
    [['Book a demo', DEMO, true], ['Start training', 'https://app.heurastudios.com/signup', false]]);
  const [h1, lead] = await Promise.all(['h1', '.hm-hero .ov-lead'].map(s => page.locator(s).boundingBox()));
  assert.ok(lead.y >= h1.y + h1.height && Math.abs(lead.x - h1.x) <= 4, 'the lead under the headline, on its left edge');
  assert.equal(await page.locator('header').getByRole('link', { name: 'Book a demo', exact: true }).count(), 1);
  assert.equal(await page.getByRole('link', { name: 'Sign up', exact: true }).count(), 0, 'no Sign up on the home page');
  assert.equal(await page.locator('header').getByRole('link', { name: 'Log in', exact: true }).count(), 1);
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  assert.match(description, /^Post-training for AI-native companies\. Fine-tune the base on your team’s examples\. Test every version on your eval set\./);
  assert.doesNotMatch(description, /Grounding/);
  assert.deepEqual(errors, []);
  await close();
});

// Where they sit (Nov 26, after Arga Labs' hero): on a computer, at the right of the hero, level with the lead's last
// line; narrower, under the lead on its left edge. Either way inside the page's margins, side by side, 44px to tap.
test('the hero’s Book a demo and Start training: at the right on a computer, under the lead on a phone', async () => {
  for (const width of [320, 375, 390, 600, 834, 900, 1024, 1280, 1600]) {
    const { page, close } = await open('/', { viewport: { width, height: 860 }, reducedMotion: 'reduce' });
    const where = `${width}px`;
    const [h1, lead, demo, start] = await Promise.all(['h1', '.hm-hero .ov-lead', '.hm-hero-acts .ov-btn-primary', '.hm-hero-acts .ov-btn-quiet']
      .map(s => page.locator(s).boundingBox()));
    const wrap = await page.locator('.hm-hero-row').evaluate(e => {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return [r.left + parseFloat(cs.paddingLeft), r.right - parseFloat(cs.paddingRight)];
    });
    for (const [name, b] of [['Book a demo', demo], ['Start training', start]]) {
      assert.ok(b.x >= wrap[0] - 0.5 && b.x + b.width <= wrap[1] + 0.5, `${where}: ${name} inside the margins`);
      assert.ok(b.height >= 44, `${where}: ${name} is a tap target`);
      assert.ok(b.y >= h1.y + h1.height, `${where}: ${name} under the headline`);
    }
    assert.ok(demo.x + demo.width <= start.x + 0.5 && Math.abs(demo.y - start.y) <= 1, `${where}: Book a demo, then Start training, side by side`);
    if (width >= 900) {
      assert.ok(Math.abs(start.x + start.width - wrap[1]) <= 1, `${where}: at the right`);
      assert.ok(demo.x >= lead.x + lead.width, `${where}: beside the lead`);
      assert.ok(Math.abs((demo.y + demo.height) - (lead.y + lead.height)) <= 12, `${where}: level with the lead's last line`);
    } else {
      assert.ok(demo.y >= lead.y + lead.height, `${where}: under the lead`);
      assert.ok(Math.abs(demo.x - lead.x) <= 1, `${where}: on the lead's left edge`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${where}: nothing scrolls sideways`);
    await close();
  }
});

test('the header and the footer go to sections that exist', async () => {
  const { page, close } = await open('/');
  const header = await page.locator('header a').evaluateAll(as => as.map(a => [a.textContent.trim(), a.getAttribute('href')]));
  // (Oct 29: Tools is a page of its own, /tools/, each tool with its recording; Nov 18: Log in and Sign up, the app's)
  assert.deepEqual(header, [['Heura Studios', '/'], ['Tools', '/tools/'], ['Datasets', '/datasets/'], ['Blog', '/blog/'],
    ['Asteria waitlist', '/asteria/'], ['Log in', 'https://app.heurastudios.com/login'], ['Book a demo', DEMO]]);
  assert.deepEqual(await page.locator('footer nav').first().locator('a').allTextContents(),
    ['Tools', 'Datasets', 'Start training', 'Blog']);
  assert.equal(await page.locator('footer nav').first().getByRole('link', { name: 'Tools' }).getAttribute('href'), '/tools/');
  assert.equal(await page.locator('footer nav').first().getByRole('link', { name: 'Start training' }).getAttribute('href'),
    'https://app.heurastudios.com/signup');
  assert.equal(await page.locator('main #inquire').count(), 1);
  assert.equal(await page.locator('main #tools').count(), 0, 'the tools are on their own page now');
  assert.equal(await page.getByRole('link', { name: 'Get started' }).count(), 0);
  await close();
});

test('Log in is in the header, once: not in the hero, the inquiry form or the footer', async () => {
  const { page, close } = await open('/');
  const logins = page.locator('a[href^="https://app.heurastudios.com/login"]');
  assert.equal(await logins.count(), 1);
  assert.equal(await page.locator('header').getByRole('link', { name: 'Log in', exact: true }).count(), 1);
  for (const where of ['.hm-hero', '#inquire', 'footer']) {
    assert.equal(await page.locator(where).getByRole('link', { name: /log in|sign in/i }).count(), 0, where);
  }
  await close();
});

// Links to the old Request access form (/#request: old emails, old posts) still land on the form that took its place.
test('an old link to /#request lands on the inquiry form, under the header', async () => {
  const { page, close } = await open('/#request');
  // the page scrolls there smoothly, and stops with the heading 32px under the header, as for any section's link
  await page.waitForFunction(() => Math.abs(document.getElementById('hm-inquire-title').getBoundingClientRect().top - (68 + 32)) <= 2,
    null, { timeout: 5000 });
  const [form, header] = await Promise.all(['#hm-inquire-title', '.ov-top'].map(sel => page.locator(sel).boundingBox()));
  assert.ok(form.y >= header.y + header.height && form.y + form.height <= 860, `the heading in view (${form.y})`);
  assert.equal(await page.locator('#request').evaluate(el => el.closest('section').id), 'inquire');
  await close();
});

test('the recording plays muted and looping, without controls, and Pause stops it', async () => {
  const { page, errors, close } = await open('/');
  const video = page.locator('.hm-video');
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  assert.deepEqual(await video.evaluate(v => [v.muted, v.loop, v.controls, v.playsInline]), [true, true, false, true]);
  assert.match(await video.evaluate(v => v.currentSrc), /\/img\/notebook-run\.(webm|mp4)$/);
  assert.equal(await page.locator('#' + await video.getAttribute('aria-describedby')).innerText(),
    'A sample model in Heura Studios: its script.md, then Train v1, checked on its six test questions before and after, and live on a tie. Heura Arche’s answers and its training are simulated here, so the run takes seconds.');
  const toggle = page.getByRole('button', { name: 'Pause the recording' });
  await toggle.click();
  assert.equal(await video.evaluate(v => v.paused), true);
  await page.getByRole('button', { name: 'Play the recording' }).click();
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  assert.deepEqual(errors, []);
  await close();
});

test('the recording rests off screen and plays again when it comes back', async () => {
  const { page, close } = await open('/');
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  await page.locator('#inquire').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.hm-video').paused);
  await page.locator('.hm-video').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  await close();
});

test('in dark mode it plays the dark recording, and changing the appearance changes the recording', async () => {
  const { page, close } = await open('/', { colorScheme: 'dark' });
  const src = () => page.locator('.hm-video').evaluate(v => v.currentSrc);
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  assert.match(await src(), /notebook-run-dark\./);
  assert.match(await page.locator('.hm-video').getAttribute('poster'), /notebook-run-dark\.webp$/);
  await page.getByRole('radiogroup', { name: 'Appearance' }).getByRole('radio', { name: 'Light' }).check();
  await page.waitForFunction(() => /notebook-run\.(webm|mp4)$/.test(document.querySelector('.hm-video').currentSrc));
  await page.locator('.hm-video').scrollIntoViewIfNeeded();   // (the setting is in the footer: the recording rested)
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  await close();
});

// The page's appearance is known before it paints (the head script), so the frame shows the right poster from the
// first paint, and a dark page never fetches the light recording or its poster. A light page loads its recording once.
for (const scheme of ['light', 'dark']) {
  test(`a ${scheme} page fetches only the ${scheme} recording and poster, and loads it once`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: scheme });
    const page = await ctx.newPage();
    const fetched = [];
    page.on('request', r => { if (/\/img\/notebook-run/.test(r.url())) fetched.push(new URL(r.url()).pathname); });
    await page.addInitScript(() => {
      window.loads = 0;
      const load = HTMLMediaElement.prototype.load;
      HTMLMediaElement.prototype.load = function () { window.loads++; return load.call(this); };
    });
    await page.goto(server.url + '/');
    await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
    const own = scheme === 'dark' ? /notebook-run-dark\./ : /notebook-run\./;
    assert.ok(fetched.length > 0);
    for (const path of fetched) assert.match(path, own, `${scheme}: fetched ${path}`);
    assert.match(await page.locator('.hm-frame').evaluate(f => getComputedStyle(f).backgroundImage), scheme === 'dark'
      ? /notebook-run-dark\.webp/ : /notebook-run\.webp/);
    assert.equal(await page.evaluate(() => window.loads), scheme === 'dark' ? 1 : 0, 'load() only to change the files');
    await ctx.close();
  });
}

// Ryan, Oct 24, 13:54: "like even the iphone thing too". On a phone the desktop recording was a stamp: phones get a
// recording of the Studio at a phone's size (taps, drawn at 3x), in a frame of its shape. The .mp4 comes
// first: every iPhone decodes H.264 itself, and it's the smaller file.
const PHONE = { width: 390, height: 844 };
for (const scheme of ['light', 'dark']) {
  test(`on a phone (${scheme}) it plays the phone recording, in a frame of its shape, and fetches nothing else`, async () => {
    const ctx = await browser.newContext({ viewport: PHONE, colorScheme: scheme, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const fetched = [];
    page.on('request', r => { if (/\/img\/notebook-run/.test(r.url())) fetched.push(new URL(r.url()).pathname); });
    await page.goto(server.url + '/');
    await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
    const own = scheme === 'dark' ? /\/img\/notebook-run-phone-dark\./ : /\/img\/notebook-run-phone\./;
    assert.match(await page.locator('.hm-video').evaluate(v => v.currentSrc), own);
    assert.match(await page.locator('.hm-video').getAttribute('poster'), own);
    assert.match(await page.locator('.hm-frame').evaluate(f => getComputedStyle(f).backgroundImage), own);
    const [w, h] = await page.locator('.hm-frame').evaluate(f => [f.clientWidth, f.clientHeight]);
    assert.ok(Math.abs(w / h - 390 / 600) < 0.01, `the frame has the phone recording's shape (${w} x ${h})`);
    assert.ok(fetched.length > 0);
    for (const path of fetched) assert.match(path, own, `${scheme}: fetched ${path}`);
    await ctx.close();
  });
}

test('the recording is offered as an .mp4 first, the phone one to phones, even without JavaScript', async () => {
  const { page, close } = await open('/', { javaScriptEnabled: false });
  const sources = await page.locator('.hm-video source').evaluateAll(ss => ss.map(s => [s.getAttribute('media'), s.type,
    s.getAttribute('src')]));
  assert.deepEqual(sources, [
    ['(max-width: 599px)', 'video/mp4', '/img/notebook-run-phone.mp4'],
    ['(max-width: 599px)', 'video/webm', '/img/notebook-run-phone.webm'],
    [null, 'video/mp4', '/img/notebook-run.mp4'],
    [null, 'video/webm', '/img/notebook-run.webm'],
  ]);
  await close();
  for (const scheme of ['light', 'dark']) {   // and the frame shows the phone poster on a phone
    const phone = await open('/', { javaScriptEnabled: false, colorScheme: scheme, viewport: PHONE });
    assert.match(await phone.page.locator('.hm-frame').evaluate(f => getComputedStyle(f).backgroundImage),
      scheme === 'dark' ? /notebook-run-phone-dark\.webp/ : /notebook-run-phone\.webp/, scheme);
    await phone.close();
  }
});

test('turning a phone to a wider screen changes to the desktop recording, and back', async () => {
  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(server.url + '/');
  await page.waitForFunction(() => /notebook-run-phone\./.test(document.querySelector('.hm-video').currentSrc));
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.waitForFunction(() => /\/notebook-run\.(mp4|webm)$/.test(document.querySelector('.hm-video').currentSrc));
  assert.match(await page.locator('.hm-video').getAttribute('poster'), /\/notebook-run\.webp$/);
  await page.setViewportSize(PHONE);
  await page.waitForFunction(() => /notebook-run-phone\./.test(document.querySelector('.hm-video').currentSrc));
  await ctx.close();
});

test('without JavaScript the frame still shows the poster for the system’s appearance', async () => {
  for (const scheme of ['light', 'dark']) {
    const { page, close } = await open('/', { javaScriptEnabled: false, colorScheme: scheme });
    assert.match(await page.locator('.hm-frame').evaluate(f => getComputedStyle(f).backgroundImage), scheme === 'dark'
      ? /notebook-run-dark\.webp/ : /notebook-run\.webp/, scheme);
    await close();
  }
});

test('Pause sits beside the caption, or below it on a phone, and is never part of the caption', async () => {
  for (const width of [360, 390, 1280]) {
    const { page, close } = await open('/', { viewport: { width, height: 860 } });
    const caption = page.locator('figure.hm-film > figcaption');
    assert.equal(await caption.count(), 1, `${width}: the figure's caption`);
    assert.equal(await caption.locator('button').count(), 0, `${width}: Pause isn't in it`);
    const [cap, pause, frame] = await page.evaluate(() => ['figure.hm-film > figcaption', '.hm-toggle', '.hm-frame']
      .map(s => document.querySelector(s).getBoundingClientRect().toJSON()));
    if (width < 600) {
      assert.ok(cap.width >= frame.width - 1, `${width}: the caption is as wide as the recording (${cap.width} of ${frame.width})`);
      assert.ok(pause.top >= cap.bottom, `${width}: Pause below the caption`);
    } else {
      assert.ok(pause.left >= cap.right && pause.top < cap.bottom, `${width}: Pause beside the caption`);
    }
    await close();
  }
});

test('with Reduce Motion the recording waits on its first frame until Play', async () => {
  const { page, close } = await open('/', { reducedMotion: 'reduce' });
  await page.waitForTimeout(800);
  const video = page.locator('.hm-video');
  assert.equal(await video.evaluate(v => v.paused), true);
  assert.equal(await video.evaluate(v => v.currentTime), 0);
  await page.getByRole('button', { name: 'Play the recording' }).click();
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  await page.getByRole('button', { name: 'Pause the recording' }).click();
  assert.equal(await video.evaluate(v => v.paused), true);
  await close();
});

test('without JavaScript the recording shows its first frame with the browser’s controls, and nothing plays', async () => {
  const { page, close } = await open('/', { javaScriptEnabled: false });
  const video = page.locator('.hm-video');
  assert.deepEqual(await video.evaluate(v => [v.controls, v.autoplay, v.paused, v.preload]), [true, false, true, 'none']);
  assert.equal(await page.locator('.hm-toggle').isVisible(), false);
  await close();
});

// The Tools section (Ryan, Oct 24) is the Tools page now (Oct 29): _tests/tools.test.js.

// Ryan, 11:06: "remove the title what it does and what it doesnt like make it sound better". A spec sheet in its place:
// one row per part, saying exactly what each is (supervised fine-tuning, 2B, OpenAI-compatible), so nothing it can't do
// is claimed and nothing needs a "doesn't" list.
test('Specifications: one row per part, in place of what it does and doesn’t', async () => {
  const { page, close } = await open('/');
  const specs = page.locator('#specs');
  assert.equal(await specs.locator('h2').innerText(), 'Specifications');
  assert.deepEqual(await specs.locator('dt').allInnerTexts(),
    ['Base model', 'Training', 'Training data', 'Evaluation', 'Promotion', 'Serving', 'Export', 'Access']);
  const row = async (term) => (await specs.locator('dl > div', { has: page.locator('dt', { hasText: new RegExp(`^${term}$`) }) })
    .locator('dd').innerText()).replace(/\s+/g, ' ');
  assert.match(await row('Base model'), /^Heura Arche, 2B, built on Qwen3-VL-2B-Instruct\. Or a model you bring: Claude, GPT, Gemini, or any model behind an OpenAI-compatible server\.$/);
  assert.match(await row('Training'), /^Supervised fine-tuning: LoRA adapters on Heura Arche, or OpenAI’s fine-tuning API for its fine-tunable models\.$/);
  assert.match(await row('Training data'), /plus a replay mix of Heura’s own data so the base keeps its general skills\. Answers written by Claude, GPT or Gemini never enter a training set\.$/);
  assert.match(await row('Evaluation'), /^Every run is scored on the eval set before and after it trains\.$/);
  assert.match(await row('Promotion'), /^A checkpoint that scores lower than the live one is held back\. Only the owner can promote it by hand\.$/);
  assert.match(await row('Serving'), /\/v1\/chat\/completions and \/v1\/models/);
  assert.match(await row('Export'), /Apache-2\.0 licence and a NOTICE for Qwen\.$/);
  assert.match(await row('Access'), /^The owner keeps the base model, the eval set, promotion, keys and exports\.$/);
  const text = await page.evaluate(() => document.body.innerText);
  for (const gone of ['What it does', 'It doesn’t', 'doesn’t yet']) assert.ok(!text.includes(gone), gone);
  assert.ok(!text.includes('Operators bring the signal.'), 'said where the tools are: the Tools page (tools.test.js)');
  // (Ryan, Oct 26: the line under Request access was "just yap"; the inquiry form keeps it that way: the heading alone)
  assert.equal(await page.locator('#inquire .ov-section-lead').count(), 0);
  for (const gone of ['contract with Ostravanne', 'A founder checks every request']) assert.ok(!text.includes(gone), gone);
  await close();
});

test('Inquiries asks for a name, an email and a question, and a company and a role if they like', async () => {
  const { page, close } = await open('/');
  assert.equal(await page.locator('#inquire h2').innerText(), 'Inquiries');
  const form = page.locator('#hm-form');
  assert.equal(await form.getAttribute('action'), SCRIPT);
  assert.equal(await form.getAttribute('method'), 'post');
  for (const [label, required] of [['Name', true], ['Email', true], ['Company', false], ['Role', false], ['Question', true]]) {
    assert.equal(await form.getByLabel(label, { exact: true }).evaluate(i => i.required), required, label);
  }
  assert.equal(await form.getByLabel('Question', { exact: true }).evaluate(t => [t.tagName, t.maxLength].join(' ')), 'TEXTAREA 2000');
  assert.equal(await form.locator('input[name="kind"]').inputValue(), 'inquiry');
  assert.equal(await form.getByRole('button').innerText(), 'Send inquiry');
  assert.match(await form.locator('.hm-fine').innerText(), /^A founder replies by email\. These details are used only to reply to you\./);
  // under the heading, nothing (no Log in: it's in the header now)
  assert.deepEqual(await page.locator('#inquire .ov-head > *').evaluateAll(es => es.map(e => e.className || e.tagName)),
    ['ov-h2']);
  await close();
});

test('sending an inquiry posts every field and says a founder will reply', async () => {
  const { page, errors, close } = await open('/');
  const sent = await standIn(page);
  await fill(page, { 'Name': ' Ann Lee ', 'Email': 'ann@acme.co', 'Company': 'Acme', 'Role': 'Head of ML',
    'Question': 'Can we train on our own support tickets?\nAnd export the result?' });
  await page.getByRole('button', { name: 'Send inquiry' }).click();
  const done = page.locator('#hm-done');
  await done.waitFor();
  assert.match(await done.innerText(), /Inquiry sent\s+A founder will reply to ann@acme\.co\./);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'hm-done');
  assert.equal(await page.locator('#hm-form').isVisible(), false);
  const got = Object.fromEntries(sent[0]);
  assert.deepEqual([got.name, got.email, got.company, got.role, got.message, got.kind, got.from, got.js, got.website],
    ['Ann Lee', 'ann@acme.co', 'Acme', 'Head of ML', 'Can we train on our own support tickets?\nAnd export the result?',
      'inquiry', '/', '1', '']);
  assert.doesNotMatch(await done.innerText(), /\bwe\b/i, 'the page never says "we", and nor does what it says after sending');
  assert.deepEqual(errors, []);
  await close();
});

test('an inquiry without a company or a role goes too', async () => {
  const { page, close } = await open('/');
  const sent = await standIn(page);
  await fill(page, { 'Name': 'Bo', 'Email': 'bo@example.com', 'Question': 'What does the Studio plan include?' });
  await page.getByRole('button', { name: 'Send inquiry' }).click();
  await page.locator('#hm-done').waitFor();
  const got = Object.fromEntries(sent[0]);
  assert.deepEqual([got.company, got.role], ['', '']);
  await close();
});

test('an inquiry says where the person came from: the page’s utm tags, like the waitlist’s joins', async () => {
  const { page, close } = await open('/?utm_source=launch&utm_medium=email');
  const sent = await standIn(page);
  await fill(page, { 'Name': 'Ann', 'Email': 'ann@acme.co', 'Question': 'Hi' });
  await page.getByRole('button', { name: 'Send inquiry' }).click();
  await page.locator('#hm-done').waitFor();
  assert.equal(Object.fromEntries(sent[0]).from, '/?utm_source=launch&utm_medium=email');
  await close();
});

test('a missing name, an email that does not look like one, or a missing question is caught before anything is sent', async () => {
  const { page, close } = await open('/');
  const sent = await standIn(page);
  const send = () => page.getByRole('button', { name: 'Send inquiry' }).click();
  const form = page.locator('#hm-form');
  await send();
  assert.equal(await page.locator('#hm-error').innerText(), 'Enter your name.');
  assert.equal(await form.getByLabel('Name', { exact: true }).getAttribute('aria-invalid'), 'true');
  await fill(page, { 'Name': 'Ann', 'Email': 'ann@acme' });
  await send();
  assert.equal(await page.locator('#hm-error').innerText(), 'Enter your email, like you@company.com.');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'hm-email');
  await fill(page, { 'Email': 'ann@acme.co', 'Question': '   ' });
  await send();
  assert.equal(await page.locator('#hm-error').innerText(), 'Write your question.');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'hm-message');
  assert.equal(sent.length, 0);
  await close();
});

test('an error is announced and tied to its field, which keeps its red edge while focused', async () => {
  const { page, close } = await open('/');
  const sent = await standIn(page);
  const error = page.locator('#hm-error');
  // in the accessibility tree before there's anything to say, so the first message is announced like the rest
  assert.notEqual(await error.evaluate(e => getComputedStyle(e).display), 'none');
  assert.equal(await error.getAttribute('role'), 'alert');
  await fill(page, { 'Name': 'Ann', 'Email': 'ann@acme.co' });
  const send = () => page.getByRole('button', { name: 'Send inquiry' }).click();
  await send();
  const question = page.locator('#hm-message');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'hm-message');
  assert.equal(await question.getAttribute('aria-invalid'), 'true');
  assert.equal(await question.getAttribute('aria-describedby'), 'hm-error');
  await page.waitForFunction(() => getComputedStyle(document.activeElement).borderTopColor === 'rgb(180, 35, 24)',
    null, { timeout: 2000 });   // red while focused (after the border's short transition)
  await fill(page, { 'Question': 'Hi', 'Email': 'ann' });   // now the email is the one to fix
  await send();
  assert.equal(await question.getAttribute('aria-describedby'), null);
  assert.equal(await question.getAttribute('aria-invalid'), null);
  assert.equal(await page.locator('#hm-email').getAttribute('aria-describedby'), 'hm-error');
  assert.equal(sent.length, 0);
  await close();
});

for (const [what, reply, status] of [['the script is down', { ok: true }, 500], ['the script is busy', { ok: false, error: 'busy' }, 200]]) {
  test(`when ${what}, the form stays, keeps what was typed and says to try again`, async () => {
    const { page, close } = await open('/');
    await standIn(page, reply, status);
    await fill(page, { 'Name': 'Ann', 'Email': 'ann@acme.co', 'Question': 'What does it cost?' });
    const button = page.getByRole('button', { name: 'Send inquiry' });
    await button.click();
    await page.waitForFunction(() => /try again/i.test(document.getElementById('hm-error').textContent));
    assert.equal(await page.locator('#hm-form').isVisible(), true);
    assert.equal(await button.isEnabled(), true);
    assert.equal(await page.locator('#hm-message').inputValue(), 'What does it cost?');
    await close();
  });
}

for (const [error, field, said] of [['company', 'hm-company', /company’s name/], ['message', 'hm-message', /up to 2,000 characters/],
  ['email', 'hm-email', /email address/]]) {
  test(`the script refusing the ${error} points at that field`, async () => {
    const { page, close } = await open('/');
    await standIn(page, { ok: false, error });
    await fill(page, { 'Name': 'Ann', 'Email': 'ann@acme.co', 'Company': 'Acme', 'Question': 'Hi' });
    await page.getByRole('button', { name: 'Send inquiry' }).click();
    await page.waitForFunction(() => document.getElementById('hm-error').textContent !== '');
    assert.equal(await page.evaluate(() => document.activeElement.id), field);
    assert.match(await page.locator('#hm-error').innerText(), said);
    await close();
  });
}

for (const width of [320, 390, 1440]) {
  test(`at ${width}px nothing scrolls sideways and no text is smaller than 11px`, async () => {
    const { page, close } = await open('/', { viewport: { width, height: 800 } });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
    const tooSmall = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
        if (!text) continue;
        const shown = el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true });
        if (shown && parseFloat(getComputedStyle(el).fontSize) < 11) out.push(text);
      }
      return out;
    });
    assert.deepEqual(tooSmall, []);
    await close();
  });
}

for (const width of [1280, 834, 375]) {
  test(`at ${width}px the headline starts on the same left edge as every section heading`, async () => {
    const { page, close } = await open('/', { viewport: { width, height: 860 } });
    const lefts = await page.evaluate(() => {
      const left = el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return Math.round(range.getClientRects()[0].left);
      };
      return [left(document.querySelector('h1')), ...[...document.querySelectorAll('main h2:not(.ov-sr)')].map(left)];
    });
    for (const x of lefts) assert.ok(Math.abs(x - lefts[0]) <= 4, `${lefts}`);
    await close();
  });
}

for (const scheme of ['light', 'dark']) {
  test(`secondary text reads at 4.5:1 or more (${scheme})`, async () => {
    const { page, close } = await open('/', { colorScheme: scheme });
    const pairs = await page.evaluate(() => ['.hm-caption', '.hm-specs dd', '.hm-fine', '.ov-top-login'].map(sel => {
      const el = document.querySelector(sel);
      let bg = 'rgba(0, 0, 0, 0)';
      for (let e = el; e && /rgba\(.*, 0\)$/.test(bg); e = e.parentElement) bg = getComputedStyle(e).backgroundColor;
      return [sel, getComputedStyle(el).color, /rgba\(.*, 0\)$/.test(bg) ? getComputedStyle(document.documentElement).backgroundColor : bg];
    }));
    for (const [sel, fg, bg] of pairs) assert.ok(ratio(fg, bg) >= 4.5, `${sel}: ${fg} on ${bg}`);
    await close();
  });
}

test('the appearance setting offers System, Light and Dark; Dark sticks across pages, System gives it back', async () => {
  const { page, ctx, close } = await open('/', { colorScheme: 'light' });
  const group = page.getByRole('radiogroup', { name: 'Appearance' });
  assert.deepEqual(await group.getByRole('radio').evaluateAll(rs => rs.map(r => r.labels[0].textContent.trim())), ['System', 'Light', 'Dark']);
  await group.getByRole('radio', { name: 'Dark' }).check();
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  const other = await ctx.newPage();
  await other.goto(server.url + '/waitlist/');
  assert.equal(await other.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  await group.getByRole('radio', { name: 'System' }).check();
  assert.equal(await page.evaluate(() => localStorage.getItem('ov-theme')), null);
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  await close();
});

test('the page never says "we", nor the words the voice leaves out', async () => {
  const { page, close } = await open('/');
  const text = await page.evaluate(() => document.body.innerText);
  assert.doesNotMatch(text, /\bwe\b|\bwe'll\b|\bwe're\b|\bwe’ll\b|\bwe’re\b/i);
  assert.doesNotMatch(text, /no code|build your own AI|cheaper than|AI-powered|seamless|unlock|supercharge|!/i);
  await close();
});

test('nothing but the recording moves, and nothing rises into place', async () => {
  const { page, close } = await open('/');
  await page.waitForTimeout(1200);
  assert.deepEqual(await page.evaluate(() => document.getAnimations().map(a => a.animationName || a.transitionProperty || 'x')), []);
  assert.equal(await page.locator('[data-reveal], [data-parallax]').count(), 0);
  await close();
});
