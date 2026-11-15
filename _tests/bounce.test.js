// The browser's own bounce past the page's ends, on a trackpad or a phone (Ryan, Nov 14, the top: "elongate the strip
// so like when i scroll up theres still the black part"; Nov 15, the bottom: "The bottom is kina cooked too bro fix
// that gap too"). Chromium bounces as a Mac's trackpad does with ElasticOverscroll on: a finger dragged on past an end
// pulls the page on with it, and it springs back when the finger lifts. What the pull uncovers: past the top, the page's
// own color between the margins; past the end, the footer's dark canvas, all the way across: never the margins'
// picture, and never the page's color under the dark footer.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, readPng } = require('./helpers');

const PAGE = { light: 255, dark: 0 };   // the page's own color, a channel
const FOOT = 12;                        // the footer's canvas, #0c0c0c
const SHEET = 1280;                     // the sheet under the column, on a wide screen

let server, browser;
test.before(async () => {
  server = await startServer();
  browser = await chromium.launch({
    ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
    args: ['--enable-features=ElasticOverscroll'],
  });
});
test.after(async () => { await browser.close(); await server.close(); });

// The page at a size, scrolled to an end ('top' or 'end'), then a finger on it dragged 600px on past that end and held
// there -> { shot, moved }: the screen mid-pull, and how far the page moved (found by lining the middle of the column
// up with the screen before the pull)
async function pull(path, width, height, scheme, end) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => sessionStorage.setItem('ov-backdrop', 'mountains'));
  const page = await ctx.newPage();
  await page.goto(server.url + path);
  await page.evaluate(async () => {   // the margins' picture, if there is one, loaded and drawn
    const m = getComputedStyle(document.body, '::before').backgroundImage.match(/url\("?([^")]*)"?\)/);
    if (m) { const img = new Image(); img.src = m[1]; await img.decode(); }
  });
  await page.evaluate((e) => scrollTo(0, e === 'end' ? document.documentElement.scrollHeight : 0), end);
  await page.waitForTimeout(250);
  const still = readPng(await page.screenshot());
  const cdp = await ctx.newCDPSession(page);
  const x = Math.round(width / 2), from = end === 'end' ? height - 150 : 150, step = end === 'end' ? -20 : 20;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] });
  for (let i = 1; i <= 30; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + i * step }] });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(100);
  const shot = readPng(await page.screenshot());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await ctx.close();
  const x0 = Math.max(0, x - 300), x1 = Math.min(width - 1, x + 300), sign = end === 'end' ? 1 : -1;
  let moved = 0, least = Infinity;
  for (let s = 0; s <= 120; s++) {
    let off = 0;
    for (let y = 200; y < height - 200; y += 3) {
      for (let cx = x0; cx <= x1; cx += 5) {
        const a = shot.rgb(cx, y), b = still.rgb(cx, y + sign * s);
        off += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      }
    }
    if (off < least) { least = off; moved = s; }
  }
  return { shot, moved };
}

// Whether every pixel in rows y0 to y1 (both in) of column x is a color (a channel, to within 2)
function all(shot, x, y0, y1, color) {
  for (let y = y0; y <= y1; y++) if (!shot.rgb(x, y).every(v => Math.abs(v - color) <= 2)) return false;
  return true;
}

test('pulled on past its end, the page shows more footer all the way across', async () => {
  for (const [width, height] of [[1600, 1000], [1280, 900], [390, 844]]) {
    for (const scheme of ['light', 'dark']) {
      const { shot, moved } = await pull('/', width, height, scheme, 'end');
      assert.ok(moved >= 10, `${width} ${scheme}: the page bounced (${moved}px; Chromium's ElasticOverscroll)`);
      for (const x of [2, 30, Math.round(width / 2), width - 31, width - 3]) {
        assert.ok(all(shot, x, height - moved + 2, height - 1, FOOT), `${width} ${scheme}: footer under the page at x ${x}`);
      }
    }
  }
});

test('pulled on past its top, the page shows its own color between the margins', async () => {
  for (const [width, height] of [[1600, 1000], [390, 844]]) {
    const xs = width > SHEET ? [(width - SHEET) / 2 + 2, width / 2, (width + SHEET) / 2 - 3] : [2, width / 2, width - 3];
    for (const scheme of ['light', 'dark']) {
      const { shot, moved } = await pull('/', width, height, scheme, 'top');
      assert.ok(moved >= 10, `${width} ${scheme}: the page bounced (${moved}px; Chromium's ElasticOverscroll)`);
      for (const x of xs) {
        assert.ok(all(shot, Math.round(x), 0, moved - 3, PAGE[scheme]), `${width} ${scheme}: the page's color above it at x ${x}`);
      }
    }
  }
});
