// The browser's own bounce past the page's ends, on a trackpad or a phone (Ryan, Nov 14, the top: "elongate the strip
// so like when i scroll up theres still the black part"; Nov 15, the bottom: "The bottom is kina cooked too bro fix
// that gap too"; Nov 16, on a computer: "floating islands for text and make everything else just the background").
// Chromium bounces as a Mac's trackpad does with ElasticOverscroll on: a finger dragged on past an end pulls the page
// on with it, and it springs back when the finger lifts. What the pull uncovers: on a phone or a tablet, past the top
// the page's own color, past the end the footer's dark canvas, all the way across, never the page's color under the
// dark footer; on a computer, the picture that's the background of it all, as it is behind the islands.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, readPng } = require('./helpers');

const PAGE = { light: 255, dark: 0 };   // the page's own color, a channel
const FOOT = 12;                        // the footer's canvas, #0c0c0c

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
// there -> { shot, moved, alone }: the screen mid-pull, how far the page moved (found by lining the middle of the
// column up with the screen before the pull), and the screen with only what's fixed behind the page drawn (the picture)
async function pull(path, width, height, scheme, end) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => sessionStorage.setItem('ov-backdrop', 'mountains'));
  const page = await ctx.newPage();
  await page.goto(server.url + path);
  await page.evaluate(async () => {   // the margins' picture, if there is one, loaded and drawn
    const m = getComputedStyle(document.body, '::before').backgroundImage.match(/url\("?([^")]*)"?\)/);
    if (m) { const img = new Image(); img.src = m[1]; await img.decode(); }
  });
  const hide = await page.addStyleTag({ content: 'body > * { visibility: hidden !important; }' });
  await page.waitForTimeout(100);
  const alone = readPng(await page.screenshot());
  await hide.evaluate((el) => el.remove());
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
  return { shot, moved, alone };
}

// Whether every pixel in rows y0 to y1 (both in) of column x is a color (a channel, to within 2)
function all(shot, x, y0, y1, color) {
  for (let y = y0; y <= y1; y++) if (!shot.rgb(x, y).every(v => Math.abs(v - color) <= 2)) return false;
  return true;
}

// Whether rows y0 to y1 (both in) of column x are the picture, as it is with nothing over it (to within 3)
function picture(shot, alone, x, y0, y1) {
  for (let y = y0; y <= y1; y++) {
    const a = shot.rgb(x, y), b = alone.rgb(x, y);
    if (a.some((v, i) => Math.abs(v - b[i]) > 3)) return false;
  }
  return true;
}

test('pulled on past its end: on a phone or a tablet, more footer all the way across; on a computer, the picture', async () => {
  for (const [width, height] of [[1600, 1000], [1280, 900], [768, 1024], [390, 844]]) {
    const computer = width >= 1024;
    for (const scheme of ['light', 'dark']) {
      const { shot, moved, alone } = await pull('/', width, height, scheme, 'end');
      const at = `${width} ${scheme}`;
      assert.ok(moved >= 10, `${at}: the page bounced (${moved}px; Chromium's ElasticOverscroll)`);
      for (const x of [2, 30, Math.round(width / 2), width - 31, width - 3]) {
        if (computer) assert.ok(picture(shot, alone, x, height - moved + 2, height - 1), `${at}: the picture under the page at x ${x}`);
        else assert.ok(all(shot, x, height - moved + 2, height - 1, FOOT), `${at}: footer under the page at x ${x}`);
      }
    }
  }
});

test('pulled on past its top: on a phone or a tablet, the page’s own color; on a computer, the picture', async () => {
  for (const [width, height] of [[1600, 1000], [1024, 768], [390, 844]]) {
    const computer = width >= 1024;
    for (const scheme of ['light', 'dark']) {
      const { shot, moved, alone } = await pull('/', width, height, scheme, 'top');
      const at = `${width} ${scheme}`;
      assert.ok(moved >= 10, `${at}: the page bounced (${moved}px; Chromium's ElasticOverscroll)`);
      for (const x of [2, 30, Math.round(width / 2), width - 31, width - 3]) {
        if (computer) assert.ok(picture(shot, alone, x, 0, moved - 3), `${at}: the picture above the page at x ${x}`);
        else assert.ok(all(shot, x, 0, moved - 3, PAGE[scheme]), `${at}: the page's color above it at x ${x}`);
      }
    }
  }
});
