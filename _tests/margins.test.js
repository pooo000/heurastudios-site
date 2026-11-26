// The margins and the pipeline's wires (Ryan, Oct 29, 2026):
// - "make the website background the canvas thingy ... but only have it on the border/right and left sides": the
//   Studio's canvas (its grey and its dot grid) fills the page's margins, left and right of the column, on every page
//   and in both appearances, from the top of the screen ("can you also remove these two sides": the header's white
//   beside the column) down to the footer, and only where a screen leaves room beside the column: not on a phone, not
//   on a 1280px laptop. Nothing of it is ever behind the column's words.
// - "make the canvas thing still and only have the center part scroll": it stays still while the page scrolls.
// - Nov 14: the margins are a photograph now, not the canvas: "a shuffle between the mountains, the ocean and the
//   clouds". One picture per visit (mountains, the ocean or clouds, a third of the time each; clouds are one of five),
//   the same on every page while the visit lasts, never the last visit's twice running; dimmed in dark. Nov 17: "just
//   ditch the ocean stuff and go for the mountain background only": the mountains, always.
// - "make the middle section stand out more": the column was a sheet on the canvas, the page's color with an edge.
// - Nov 16: "a new concept of just having floating islands for text and make everything else just the background ...
//   like cut the strip in the middle", then "ship the computer version". On a computer (1024px and wider) there's no
//   sheet: the picture is the whole page's background and each section is an island floating on it (a reading page's
//   one block is one, as narrow as its column was), the header's capsule floats over it with no strip, and the footer
//   is an island too. Phones and tablets keep the page as it was, with no picture.
// - "for the privacy policy ... add like the pipeline lines as deco", then "make the terms like that too": each legal
//   page's title is a node on a pipeline, wires running in from the left and out past the right, never over the words
//   (on a computer they run to its island's edges). And ("make the bottom privacy and terms and blog thing into the
//   pipelines themselves") the footer is a pipeline: its sections are nodes on the Studio's dark canvas, wired in order.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, launch, readPng } = require('./helpers');

const PAGES = ['/', '/tools/', '/datasets/', '/waitlist/', '/privacy/', '/terms/'];
const LEGAL = ['/privacy/', '/terms/'];
const COLUMN = 1184;   // what .ov-wrap leaves for the words and panels on a wide screen: 1280px less 48px each side
const ISLAND = 1280;   // an island at its widest (a reading page's: 880)
const PAGE = { light: 255, dark: 0 };     // the page's own color, a channel
const EDGE = { light: 228, dark: 38 };    // the page's rule (#e4e4e4, #262626): the capsule's outline; in dark, an island's

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

// A page at a size, with what's in main hidden (or what `hide` names), so a screenshot shows only what's drawn behind
// it; its backdrop loaded before anything is measured
async function bare(path, width, scheme = 'light', height = 1000, hide = 'main *') {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(server.url + path);
  await page.addStyleTag({ content: `${hide} { visibility: hidden !important; }` });
  await loaded(page);
  return { page, close: () => ctx.close() };
}

// The margins' picture, if there is one: its address, once it has loaded and been drawn
async function loaded(page) {
  const url = await page.evaluate(async () => {
    const m = getComputedStyle(document.body, '::before').backgroundImage.match(/url\("?([^")]*)"?\)/);
    if (!m) return null;
    const img = new Image();
    img.src = m[1];
    await img.decode();
    return m[1];
  });
  await page.waitForTimeout(150);
  return url;
}

// A band of the screen: { x, y, width, height } -> its pixels
async function band(page, clip) {
  return readPng(await page.screenshot({ clip }));
}

// How far any pixel in columns x0 to x1 (both in) is from a color (a channel), at most
function farthest(shot, x0, x1, from) {
  let most = 0;
  for (let y = 0; y < shot.height; y++) {
    for (let x = x0; x <= x1; x++) {
      for (const v of shot.rgb(x, y)) most = Math.max(most, Math.abs(v - from));
    }
  }
  return most;
}

// How many different grey levels (a channel) columns x0 to x1 hold: a photograph has many, a flat color one
function levels(shot, x0, x1) {
  const seen = new Set();
  for (let y = 0; y < shot.height; y++) for (let x = x0; x <= x1; x++) seen.add(shot.rgb(x, y)[1]);
  return seen.size;
}

// The mean of a channel over columns x0 to x1
function mean(shot, x0, x1) {
  let sum = 0, n = 0;
  for (let y = 0; y < shot.height; y++) for (let x = x0; x <= x1; x++) { sum += shot.rgb(x, y)[1]; n++; }
  return sum / n;
}

// The share of pixels in column x that are a color (a channel, to within 2)
function share(shot, x, color) {
  let n = 0;
  for (let y = 0; y < shot.height; y++) if (shot.rgb(x, y).every(v => Math.abs(v - color) <= 2)) n++;
  return n / shot.height;
}

test('on a computer the backdrop photograph is the whole page’s background, from edge to edge, on every page', async () => {
  for (const width of [1024, 1600]) {
    const q = Math.round(width / 4);
    for (const scheme of ['light', 'dark']) {
      for (const path of PAGES) {
        const { page, close } = await bare(path, width, scheme, 1000, 'body > *');
        const shot = await band(page, { x: 0, y: 120, width, height: 360 });
        const at = `${path} at ${width}px (${scheme})`;
        for (const [x0, x1] of [[0, q - 1], [q, 3 * q - 1], [3 * q, width - 1]]) {
          assert.ok(share(shot, x0 + 30, PAGE[scheme]) < 0.05, `${at}: the picture, not the page, at x ${x0 + 30}`);
          assert.ok(levels(shot, x0, x1) > 12, `${at}: a photograph's tones at x ${x0} to ${x1} (${levels(shot, x0, x1)})`);
        }
        await close();
      }
    }
  }
});

// An island on the screen: main's n-th child
async function island(page, n = 0) {
  return page.evaluate((n) => {
    const r = document.querySelector('main').children[n].getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, n);
}

test('on a computer the words sit on islands: the page’s color, rounded, the picture beside and between them', async () => {
  const width = 1600, r = 32;   // (an island's corners at this width)
  for (const scheme of ['light', 'dark']) {
    const color = [PAGE[scheme], PAGE[scheme], PAGE[scheme]].join();
    for (const [path, wide] of [['/', ISLAND], ['/tools/', ISLAND], ['/datasets/', ISLAND], ['/privacy/', 880]]) {
      const { page, close } = await bare(path, width, scheme, 1000, 'main > * *');
      const isle = await island(page);
      const at = `${path} (${scheme})`;
      assert.ok(Math.abs(isle.w - wide) < 1 && Math.abs(isle.x - (width - wide) / 2) < 1, `${at}: ${wide}px wide, in the middle (${isle.x}, ${isle.w})`);
      const left = Math.round(isle.x), right = Math.round(isle.x + isle.w) - 1;
      const shot = await band(page, { x: 0, y: Math.round(isle.y) + r, width, height: 200 });
      assert.equal(farthest(shot, left, right, PAGE[scheme]), 0, `${at}: the island is the page's color`);
      assert.ok(share(shot, 30, PAGE[scheme]) < 0.05 && share(shot, width - 31, PAGE[scheme]) < 0.05, `${at}: the picture beside it`);
      assert.ok(levels(shot, 0, left - 10) > 12, `${at}: a photograph's tones there`);
      if (scheme === 'dark') assert.equal(share(shot, left - 1, EDGE.dark), 1, `${at}: its outline, the page's rule`);
      // its corners rounded: the picture at the very corner, the island a radius in
      const corner = await band(page, { x: left, y: Math.round(isle.y), width: r, height: r });
      assert.notEqual(corner.rgb(1, 1).join(), color, `${at}: a rounded corner`);
      assert.equal(corner.rgb(r - 1, r - 1).join(), color, `${at}: the island inside it`);
      if (path === '/') {   // the picture between the first island and the next (scrolled to the middle of the screen)
        await page.evaluate((y) => scrollTo(0, y), Math.round(isle.y + isle.h) - 500);
        await page.waitForTimeout(100);
        const first = await island(page), next = await island(page, 1);
        const top = Math.round(first.y + first.h) + 2, gap = Math.round(next.y) - 2 - top;
        assert.ok(gap >= 20, `${at}: a gap between them (${gap}px)`);
        const between = await band(page, { x: 0, y: top, width, height: gap });
        assert.ok(share(between, width / 2, PAGE[scheme]) < 0.05 && levels(between, 0, width - 1) > 12, `${at}: the picture between two islands`);
      }
      await close();
    }
  }
});

test('in dark the backdrop is dimmed: under half as bright as in light', async () => {
  const width = 1600, margin = (width - COLUMN) / 2;
  const bright = {};
  for (const scheme of ['light', 'dark']) {
    const { page, close } = await bare('/', width, scheme);
    bright[scheme] = mean(await band(page, { x: 0, y: 120, width: margin - 60, height: 360 }), 0, margin - 61);
    await close();
  }
  assert.ok(bright.dark < bright.light * 0.5, `dark ${bright.dark.toFixed(0)}, light ${bright.light.toFixed(0)}`);
});

// Ryan, Nov 17: "just ditch the ocean stuff and go for the mountain background only". Since Nov 14 the backdrop was
// one of seven photographs per visit (the mountains, the ocean or one of five skies); now it's the mountains, always.
test('the backdrop is the mountains, on every page and every visit, the only picture fetched', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  for (let visit = 0; visit < 2; visit++) {   // (a new tab is a new visit)
    const page = await ctx.newPage();
    const fetched = [];
    page.on('request', (r) => { if (r.url().includes('/img/backdrops/')) fetched.push(new URL(r.url()).pathname); });
    for (const path of PAGES) {
      await page.goto(server.url + path);
      const shown = await page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage);
      assert.ok(shown.endsWith('/img/backdrops/mountains.webp")'), `${path}: ${shown}`);
      assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-backdrop')), false, `${path}: nothing picked`);
    }
    assert.deepEqual([...new Set(fetched)], ['/img/backdrops/mountains.webp'], `visit ${visit}: only the mountains fetched`);
    await page.close();
  }
  // a 2560 x 1440 photograph, asked for by the head on a computer, before the styles do
  const page = await ctx.newPage();
  await page.goto(server.url + '/');
  const preload = page.locator('link[rel="preload"][as="image"]');
  assert.equal(await preload.getAttribute('href'), '/img/backdrops/mountains.webp');
  assert.equal(await preload.getAttribute('media'), '(min-width: 1024px)');
  const size = await page.evaluate(async () => {
    const img = new Image(); img.src = '/img/backdrops/mountains.webp'; await img.decode(); return [img.naturalWidth, img.naturalHeight];
  });
  assert.deepEqual(size, [2560, 1440]);
  await ctx.close();
});

test('a phone or a tablet (under 1024px) gets no picture and no islands, and fetches no picture', async () => {
  for (const [width, height] of [[390, 844], [768, 1024], [1000, 800]]) {
    for (const path of PAGES) {
      const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const fetched = [];
      page.on('request', (r) => { if (r.url().includes('/img/backdrops/')) fetched.push(r.url()); });
      await page.goto(server.url + path);
      await page.addStyleTag({ content: 'main * { visibility: hidden !important; }' });
      await page.waitForTimeout(150);
      const shot = await band(page, { x: 0, y: 120, width, height: 360 });
      assert.equal(farthest(shot, 0, width - 1, PAGE.light), 0, `${path} at ${width}px`);
      assert.deepEqual(fetched, [], `${path} at ${width}px: no picture fetched`);
      const corners = await page.evaluate(() => [...document.querySelector('main').children, document.querySelector('.ov-foot')]
        .map(e => getComputedStyle(e).borderTopLeftRadius));
      assert.ok(corners.every(c => c === '0px'), `${path} at ${width}px: no islands (${corners})`);
      await ctx.close();
    }
  }
});

// Ryan, 22:29 (the header's white over both margins circled): "can you also remove these two sides". Nov 14: the header
// is a capsule floating at the top (option B), outlined, with no rule under it. Nov 16, on a computer: no strip at all,
// the capsule floats on the picture; the footer is an island of the Studio's dark canvas.
test('on a computer the header’s capsule floats on the picture, no strip beside or above it, outlined; the footer is an island of the Studio’s dark canvas', async () => {
  const width = 1600;
  for (const scheme of ['light', 'dark']) {
    const { page, close } = await bare('/', width, scheme);
    const header = await page.locator('header.ov-top').boundingBox();
    const capsule = await page.locator('.ov-top-row').boundingBox();
    const clip = { x: 0, y: 0, width, height: Math.round(header.y + header.height) };
    const still = await band(page, clip);
    await page.evaluate(() => scrollTo(0, 700));
    await page.waitForTimeout(150);
    const top = await band(page, clip);
    const at = `${scheme}`, cl = Math.round(capsule.x), cr = Math.round(capsule.x + capsule.width) - 1;
    const color = `${PAGE[scheme]},${PAGE[scheme]},${PAGE[scheme]}`, edge = `${EDGE[scheme]},${EDGE[scheme]},${EDGE[scheme]}`;
    for (const shot of [still, top]) {
      for (const x of [30, cl - 30, cr + 30, width - 31]) {
        assert.ok(share(shot, x, PAGE[scheme]) < 0.05, `${at}: the picture beside the capsule, at x ${x}`);
      }
      // (a flat fill is one level; the dimmed sky in dark keeps fewer than in light)
      assert.ok(levels(shot, 0, cl - 10) > 8, `${at}: a photograph's tones there (${levels(shot, 0, cl - 10)})`);
      let flat = 0;   // above it too: the picture, not a strip of the page's color
      for (let x = cl + 40; x < cr - 40; x += 10) if (shot.rgb(x, Math.round(capsule.y) - 5).join() === color) flat++;
      assert.ok(flat < 5, `${at}: the picture above the capsule (${flat} of the page's color)`);
    }
    // the picture beside the capsule stays still while the page scrolls under it
    let moved = 0;
    for (let y = 0; y < still.height; y++) {
      for (const x of [0, 40, 80, 120, width - 121, width - 81, width - 41, width - 1]) {
        if (still.rgb(x, y).join() !== top.rgb(x, y).join()) moved++;
      }
    }
    assert.equal(moved, 0, `${at}: the picture beside the header doesn't move`);
    // the capsule's outline in the page's line color, its inside the page's color
    const mid = Math.round(width / 2);
    for (const shot of [still, top]) {
      assert.equal(shot.rgb(mid, Math.round(capsule.y)).join(), edge, `${at}: the capsule's top edge`);
      assert.equal(shot.rgb(mid, Math.round(capsule.y + capsule.height) - 1).join(), edge, `${at}: its bottom edge`);
      assert.equal(shot.rgb(mid, Math.round(capsule.y) + 3).join(), color, `${at}: inside it`);
    }
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
    const foot = await page.locator('.ov-foot').boundingBox();
    const row = await page.locator('.ov-foot-bottom').boundingBox();   // (the wires run higher up, by the nodes)
    const shot = await band(page, { x: 0, y: Math.ceil(row.y) + 2, width, height: 40 });
    const fx = Math.round(foot.x);
    assert.ok(Math.abs(foot.width - ISLAND) < 1 && Math.abs(foot.x - (width - ISLAND) / 2) < 1, `${at}: the footer as wide as an island (${foot.x}, ${foot.width})`);
    // its own canvas, always the Studio's dark one: #0c0c0c, its dots #2c2c2c (between its edge and its words)
    const dark = farthest(shot, fx + 6, fx + 40, 12);
    assert.ok(dark > 20 && dark <= 33, `${at}: the footer's dark canvas and its dots (${dark})`);
    assert.ok(share(shot, 30, 12) < 0.05 && levels(shot, 0, fx - 10) > 8, `${at}: the picture beside the footer`);
    await close();
  }
});

// Ryan, Nov 14 (dark, the page pulled down past its top, the picture showing above the sheet): "elongate the strip so
// like when i scroll up theres still the black part"; that sheet ran a screen's height above the page. Nov 16, on a
// computer, the picture is the background of it all: pulled down past its top the page shows more picture, with no
// strip to run out. (Pulled here by moving the page's own boxes down, as the browser's bounce does; the picture is
// fixed and stays. bounce.test.js pulls with Chromium's own bounce, phones and tablets too.)
test('on a computer, pulled down past its top, the page shows the picture above it, all the way across', async () => {
  for (const width of [1600, 1024]) {
    for (const scheme of ['light', 'dark']) {
      const { page, close } = await bare('/', width, scheme);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.ov-top'), '::before').content), 'none',
        `${width} ${scheme}: no strip above the header`);
      await page.evaluate(() => { for (const el of document.body.children) if (el.tagName !== 'SCRIPT') el.style.translate = '0 150px'; });
      await page.waitForTimeout(100);
      const shot = await band(page, { x: 0, y: 0, width, height: 140 });
      for (const x of [30, Math.round(width / 2), width - 31]) {
        assert.ok(share(shot, x, PAGE[scheme]) < 0.05, `${width} ${scheme}: the picture above the page at x ${x}`);
      }
      assert.ok(levels(shot, 0, width - 1) > 12, `${width} ${scheme}: a photograph's tones`);
      await close();
    }
  }
});

// Ryan, Nov 15: "The bottom is kina cooked too bro fix that gap too". Pulled up past its end, the page showed the
// picture under the dark footer (or, where there's no picture, the page's own color: white in light). On a phone or a
// tablet the footer's canvas runs a screen's height on below the page now, as ink that doesn't scroll (a shadow), so
// a pull past the end shows more footer and the page still ends where the footer does. Nov 16, on a computer: the
// footer is an island, the picture below it, so a pull shows more picture. (Pulled as above, deeper than a bounce goes.)
test('pulled up past its end: on a phone or a tablet more footer, not the page color; on a computer the picture', async () => {
  const FOOT = 12;   // the footer's canvas, #0c0c0c
  const tones = (shot, x) => levels(shot, Math.max(0, x - 5), Math.min(shot.width - 1, x + 5));
  for (const [width, height] of [[1600, 1000], [1280, 900], [1024, 768], [768, 1024], [390, 844]]) {
    const computer = width >= 1024;
    for (const scheme of ['light', 'dark']) {
      const { page, close } = await bare('/', width, scheme, height);
      const end = await page.evaluate(() => {
        scrollTo(0, document.documentElement.scrollHeight);
        const root = document.documentElement, foot = document.querySelector('.ov-foot');
        return { foot: foot.getBoundingClientRect().bottom, after: parseFloat(getComputedStyle(foot).marginBottom),
          sideways: root.scrollWidth - root.clientWidth };
      });
      const at = `${width} ${scheme}`;
      assert.ok(Math.abs(end.foot + end.after - height) < 1, `${at}: the page ends at the footer and its margin (${end.foot} + ${end.after})`);
      assert.equal(end.after > 0, computer, `${at}: ${computer ? 'picture' : 'nothing'} below the footer`);
      assert.equal(end.sideways, 0, `${at}: and doesn't scroll sideways`);
      await page.evaluate(() => { for (const el of document.body.children) if (el.tagName !== 'SCRIPT') el.style.translate = '0 -150px'; });
      await page.waitForTimeout(100);
      const shot = await band(page, { x: 0, y: height - 140, width, height: 140 });
      for (const x of [2, 30, Math.round(width / 2), width - 31, width - 3]) {
        if (computer) assert.ok(tones(shot, x) > 8 && share(shot, x, PAGE[scheme]) < 0.05, `${at}: the picture below the page at x ${x}`);
        else assert.equal(share(shot, x, FOOT), 1, `${at}: footer below the page at x ${x}`);
      }
      await close();
    }
  }
});

test('the picture stays still while the page scrolls: only the column moves', async () => {
  const width = 1600, margin = (width - COLUMN) / 2;
  const { page, close } = await bare('/', width);
  const clip = { x: 0, y: 120, width: margin - 60, height: 300 };
  const before = await band(page, clip);
  await page.evaluate(() => scrollTo(0, 310));
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => scrollY), 310, 'the page scrolled');
  const after = await band(page, clip);
  let moved = 0;
  for (let y = 0; y < before.height; y++) {
    for (let x = 0; x < before.width; x++) if (before.rgb(x, y).join() !== after.rgb(x, y).join()) moved++;
  }
  assert.equal(moved, 0, 'the margin looks the same after scrolling 310px');
  await close();
});

// pixels in columns x0 to x1 (both in) far from a color: a wire's, not the canvas's, its dots' or the sheet's edge
function wire(shot, x0, x1, from) {
  let n = 0;
  for (let y = 0; y < shot.height; y++) {
    for (let x = x0; x <= x1; x++) if (shot.rgb(x, y).some(v => Math.abs(v - from) > 100)) n++;
  }
  return n;
}

// A node's wires: in from the left edge x0 to ports left of box, out of one right of it to the right edge x1, nothing
// between (box: the node's words, hidden), and nothing past the edges
function wired(shot, box, x0, x1, from, at) {
  const left = Math.floor(box.x) - 9, right = Math.ceil(box.x + box.width) + 8;
  assert.ok(wire(shot, x0, left, from) > 0, `${at}: wires on the left`);
  assert.ok(wire(shot, right, x1, from) > 0, `${at}: wires on the right`);
  assert.ok(wire(shot, x0, x0 + 2, from) > 0, `${at}: in from the left edge (${x0})`);
  assert.ok(wire(shot, x1 - 2, x1, from) > 0, `${at}: out to the right edge (${x1})`);
  assert.equal(farthest(shot, left + 9, right - 8, from), 0, `${at}: nothing over the words`);
  if (x0 > 2) assert.equal(wire(shot, 0, x0 - 3, from) + wire(shot, x1 + 3, shot.width - 1, from), 0, `${at}: nothing past the edges`);
}

test('the Privacy Policy and the Terms: wires run in to the title and out, never over the words; on a computer from its island’s left edge to its right edge', async () => {
  for (const path of LEGAL) {
    for (const scheme of ['light', 'dark']) {
      for (const width of [1600, 1180]) {
        const ctx = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: scheme, reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        await page.goto(server.url + path);
        await page.addStyleTag({ content: '.lg-title h1, .lg-main section { visibility: hidden !important; } body::before { background: none !important; }' });
        const title = await page.locator('.lg-title').boundingBox();
        const isle = await page.locator('main > .lg-wrap').boundingBox();
        const middle = Math.round(title.y + title.height / 2);
        const shot = await band(page, { x: 0, y: middle - 80, width, height: 160 });
        wired(shot, title, Math.round(isle.x), Math.round(isle.x + isle.width) - 1, PAGE[scheme], `${path} at ${width}px (${scheme})`);
        await ctx.close();
      }
    }
  }
});

// The footer's nodes, their ports and the wires' ends, on the screen
async function footerPipe(page) {
  return page.evaluate(() => {
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; };
    const ends = (svg) => [...svg.querySelectorAll('path')].map((p) => {
      const m = p.getScreenCTM(), n = p.getTotalLength();
      const at = (l) => { const q = p.getPointAtLength(l); return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }; };
      return { from: at(0), to: at(n), shown: getComputedStyle(svg).display !== 'none' };
    });
    const nodes = [...document.querySelectorAll('.ov-pipe > .ov-node')];
    return {
      nodes: nodes.map((n) => ({ ...box(n), name: (n.querySelector('h2') || n.querySelector('.ov-logo')).textContent.trim(),
        in: box(n.querySelector('.ov-port.is-in')), out: box(n.querySelector('.ov-port.is-out')),
        joint: getComputedStyle(n, '::before').content !== 'none' && getComputedStyle(n, '::before').display !== 'none' })),
      wires: [...document.querySelectorAll('.ov-pipe > .ov-wire')].map((w) => ends(w)[0]),
      gaps: [...document.querySelectorAll('.ov-pipe > .ov-wire')].map((w) => ends(w)),
      lanes: [...document.querySelectorAll('.ov-pipe > .ov-node')].map((n) => [...n.querySelectorAll('.ov-lane')].map((l) => {
        const r = l.getBoundingClientRect(), b = parseFloat(getComputedStyle(l).borderTopWidth);
        return { x: r.x, w: r.width, y: r.y + b / 2, shown: getComputedStyle(l).display !== 'none' };
      })),
      edges: [...document.querySelectorAll('.ov-edge')].map((w) => ends(w)),
      width: innerWidth,
    };
  });
}

const near = (a, b) => Math.abs(a - b) <= 1.5;

test('the footer is a pipeline: its sections are nodes, wired in order, with wires in from the left edge and out past the right', async () => {
  for (const path of PAGES) {
    for (const width of [1600, 1100, 900]) {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await ctx.newPage();
      await page.goto(server.url + path);
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      const f = await footerPipe(page);
      const at = `${path} at ${width}px`;
      assert.deepEqual(f.nodes.map(n => n.name), ['Heura Studios', 'Product', 'Legal', 'Contact'], at);
      for (let i = 1; i < f.nodes.length; i++) {
        assert.ok(f.nodes[i].x > f.nodes[i - 1].x + f.nodes[i - 1].w, `${at}: ${f.nodes[i].name} right of the one before`);
      }
      // each wire runs from one node's out port to the next one's in port
      assert.equal(f.wires.length, 3, at);
      f.wires.forEach((w, i) => {
        const a = f.nodes[i].out, b = f.nodes[i + 1].in;
        assert.ok(near(w.from.x, a.cx) || near(w.from.x, a.x + a.w - 4), `${at}: wire ${i + 1} leaves ${f.nodes[i].name}'s port (${w.from.x} vs ${a.cx})`);
        assert.ok(near(w.from.y, a.cy), `${at}: wire ${i + 1} level with ${f.nodes[i].name}'s port (${w.from.y} vs ${a.cy})`);
        assert.ok(near(w.to.y, b.cy), `${at}: wire ${i + 1} meets ${f.nodes[i + 1].name}'s port (${w.to.y} vs ${b.cy})`);
        assert.ok(w.to.x >= b.x - 1.5 && w.to.x <= b.x + b.w + 1.5, `${at}: wire ${i + 1} ends at ${f.nodes[i + 1].name}'s port`);
      });
      // and at the ends, wires from the screen's left edge into the first node, and out of the last past the right
      const [into, out] = f.edges, first = f.nodes[0].in, last = f.nodes[3].out;
      for (const w of into) {
        assert.ok(w.from.x <= 0, `${at}: in from the left edge`);
        assert.ok(near(w.to.y, first.cy) && w.to.x >= first.x - 1.5 && w.to.x <= first.x + first.w + 1.5, `${at}: into Heura Studios' port`);
      }
      for (const w of out) {
        assert.ok(w.to.x >= f.width, `${at}: out past the right edge`);
        assert.ok(near(w.from.y, last.cy) && w.from.x >= last.x - 1.5 && w.from.x <= last.x + last.w + 1.5, `${at}: out of Contact's port`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `${at}: sideways`);
      await ctx.close();
    }
  }
});

test('the footer’s nodes are wired across too: a port feeds several, and a wire passing a node runs under or over it', async () => {
  for (const width of [1600, 1100, 900]) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto(server.url + '/');
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const f = await footerPipe(page);
    const at = `${width}px`;
    const all = f.gaps.flat();
    const leaving = (n) => all.filter(w => near(w.from.y, n.out.cy) && Math.abs(w.from.x - n.out.cx) <= 2).length;
    const coming = (n) => all.filter(w => near(w.to.y, n.in.cy) && Math.abs(w.to.x - n.in.cx) <= 2).length;
    const [brand, product, legal, contact] = f.nodes;
    assert.equal(leaving(brand), 3, `${at}: Heura Studios feeds Product, Legal and Contact`);
    assert.equal(leaving(product), 2, `${at}: Product feeds Legal and Contact`);
    assert.equal(coming(legal), 2, `${at}: Legal takes Product and Heura Studios`);
    assert.equal(coming(contact), 3, `${at}: Contact takes Legal, Product and Heura Studios`);
    // a wire that passes a node: clear of its card, across its whole width, meeting the wires in the cells either side
    f.nodes.forEach((n, i) => f.lanes[i].forEach((l) => {
      assert.ok(l.y < n.y - 8 || l.y > n.y + n.h + 8, `${at}: the wire passing ${n.name} clears its card (${l.y} vs ${n.y}..${n.y + n.h})`);
      assert.ok(near(l.x, n.x) && near(l.x + l.w, n.x + n.w), `${at}: it runs the whole width of ${n.name}`);
      assert.ok(f.gaps[i - 1].some(w => near(w.to.y, l.y) && near(w.to.x, n.x)), `${at}: it meets a wire on ${n.name}'s left`);
      assert.ok(f.gaps[i].some(w => near(w.from.y, l.y) && near(w.from.x, n.x + n.w)), `${at}: and one on its right`);
    }));
    assert.equal(f.lanes.flat().length, 4, `${at}: two under Product, one under Legal and one over it`);
    // the long loop clears the bottom row
    const bottom = await page.locator('.ov-foot-bottom').boundingBox();
    assert.ok(Math.max(...f.lanes.flat().map(l => l.y)) < bottom.y - 16, `${at}: above the bottom row`);
    await ctx.close();
  }
});

test('the footer’s links are still a heading and its links in each node, and the wires are drawn, not read', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(server.url + '/terms/');
  const foot = page.locator('footer');
  assert.deepEqual(await foot.getByRole('heading', { level: 2 }).allTextContents(), ['Product', 'Legal', 'Contact']);
  assert.deepEqual(await foot.getByRole('navigation').evaluateAll(ns => ns.map(n => n.getAttribute('aria-labelledby'))),
    ['ov-foot-product', 'ov-foot-legal']);
  assert.equal(await foot.getByRole('link', { name: 'Terms of Service' }).getAttribute('aria-current'), 'page');
  assert.equal(await foot.locator('.ov-wire, .ov-edge, .ov-port, .ov-tile').evaluateAll(
    els => els.filter(e => e.getAttribute('aria-hidden') !== 'true').length), 0, 'decoration is hidden from screen readers');
  await ctx.close();
});

test('on a phone the footer’s nodes stack, a wire down from each one to the next; none at the ends', async () => {
  for (const width of [390, 768]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(server.url + '/');
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const f = await footerPipe(page);
    const at = `${width}px`;
    for (let i = 1; i < f.nodes.length; i++) {
      const a = f.nodes[i - 1], b = f.nodes[i];
      assert.ok(b.y > a.y + a.h, `${at}: ${b.name} under ${a.name}`);
      assert.ok(near(a.out.cx, b.in.cx), `${at}: ${a.name}'s port above ${b.name}'s`);
      assert.ok(a.out.cy > a.y + a.h - 3 && b.in.cy < b.y + 3, `${at}: the ports on the bottom and top edges`);
      assert.ok(b.joint, `${at}: a wire down into ${b.name}`);
    }
    assert.equal(f.nodes[0].joint, false, `${at}: nothing into the first`);
    assert.ok(f.wires.every(w => !w.shown) && f.edges.flat().every(w => !w.shown) && f.lanes.flat().every(l => !l.shown),
      `${at}: the row's wires are put away`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `${at}: sideways`);
    await ctx.close();
  }
});

test('no title wires where there is no room (under 1100px), none on the other pages; nothing scrolls sideways', async () => {
  // (the drawing itself: the box the wires meet is a line, 0px tall)
  const shown = async (page, sel) => page.locator(sel).first().isVisible();
  for (const width of [390, 1024, 1100, 1280, 1600, 2560]) {
    for (const path of [...PAGES, '/blog/']) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(server.url + path);
      const at = `${path} at ${width}px`;
      if (LEGAL.includes(path)) assert.equal(await shown(page, '.lg-title .ov-wires-in'), width >= 1100, `${at}: the title's`);
      else assert.equal(await page.locator('main .ov-wires').count(), 0, `${at}: no title wires`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `${at}: sideways`);
      await ctx.close();
    }
  }
});
