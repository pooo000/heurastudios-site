// The logo since Oct 26, 2026 (Ryan: "make that our company logo now ... fully just change evry logo"): five pipeline
// wires; the outer two run straight and the next two dip into the middle wire, so three run as one bundle through the
// middle. Since Nov 17, 2026 (Ryan sent "Bundle_no_dots"): no plugs, and every wire is centred, so the mark is
// mirror-symmetric both ways. Black and white only: the header and the footer draw it inline in the ink's
// color, from the one drawing in _tools/make-logo.py. The old mark (an ink square with an orange band) is gone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { startServer, launch, buildSite, ROOT } = require('./helpers');

const PAGES = ['/', '/tools/', '/datasets/', '/waitlist/', '/privacy/', '/terms/'];
const BLOG = ['/blog/', '/blog/heura-eval-004/'];
// the drawing's own inline SVG, as the tool prints it
const MARK = execFileSync('python3', ['-c', [
  'import importlib.util',
  "s = importlib.util.spec_from_file_location('m', '_tools/make-logo.py')",
  'm = importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.MARK, end="")',
].join('\n')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });

let server, built, browser;
test.before(async () => {
  server = await startServer();
  built = await startServer(buildSite());
  browser = await launch();
});
test.after(async () => { await browser.close(); await server.close(); await built.close(); });

test('every page and the blog draw the mark from the drawing, in the header and the footer', async () => {
  for (const [srv, list] of [[server, PAGES], [built, BLOG]]) {
    for (const p of list) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(srv.url + p);
      const marks = await page.locator('.ov-logo > svg.ov-mark').evaluateAll(els => els.map(e => e.outerHTML));
      assert.equal(marks.length, 2, `${p}: one mark in the header, one in the footer`);
      for (const m of marks) {
        const norm = s => s.replace(/\s+/g, ' ').replace(/="?([^"\s>]*)"?/g, '="$1"');
        assert.equal(norm(m), norm(MARK.replace(/<path d="([^"]*)"\/>/g, '<path d="$1"></path>')),
          `${p}: the mark is the drawing`);
      }
      assert.equal(await page.locator('.ov-logo > span.ov-mark').count(), 0, `${p}: no old square`);
      await ctx.close();
    }
  }
});

test('the mark is the drawing: five wires, no plugs, the bundle through the middle, centred', () => {
  assert.match(MARK, /^<svg class="ov-mark" viewBox="9\.75 14\.05 100\.5 91\.9" aria-hidden="true" focusable="false">/);
  assert.equal((MARK.match(/<path /g) || []).length, 5, 'five wires');
  assert.equal((MARK.match(/<circle /g) || []).length, 0, 'no plugs');
  for (const d of MARK.match(/d="[^"]*"/g)) {
    const xs = d.match(/M([\d.]+) [\d.]+.*H([\d.]+)"$/);
    assert.ok(Math.abs(Number(xs[1]) + Number(xs[2]) - 120) < 0.02, `${d}: centred on x 60`);
  }
  assert.equal((MARK.match(/ C/g) || []).length + (MARK.match(/C\d/g) || []).length, 4, 'two wires bend in and out');
  assert.match(MARK, /stroke="currentColor"/);
});

test('the mark is the ink: black on the light page, light on the dark one, beside the name and level with it', async () => {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ colorScheme: theme, viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    await page.goto(server.url + '/');
    const got = await page.locator('.ov-top .ov-logo').evaluate(a => {
      const svg = a.querySelector('svg');
      const r = svg.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(a.lastChild);
      const t = range.getBoundingClientRect();
      return { color: getComputedStyle(svg).color, text: getComputedStyle(a).color, w: r.width, h: r.height,
        mid: r.top + r.height / 2, textMid: t.top + t.height / 2, gap: t.left - r.right };
    });
    assert.equal(got.color, got.text, `${theme}: the mark is the logo's ink`);
    assert.equal(got.color, theme === 'light' ? 'rgb(0, 0, 0)' : 'rgb(245, 245, 245)', theme);
    assert.equal(got.w, 24);
    assert.ok(Math.abs(got.h - 21.95) < 0.02, `height ${got.h}`);
    assert.ok(Math.abs(got.mid - got.textMid) < 2, `${theme}: level with the name (${got.mid} vs ${got.textMid})`);
    assert.ok(got.gap > 8 && got.gap < 12, `${theme}: 10px from the name, got ${got.gap}`);
    await ctx.close();
  }
});

test('black and white only: no orange in any served page, style or script', () => {
  const files = ['index.html', 'waitlist/index.html', 'privacy/index.html', 'terms/index.html', '_layouts/default.html',
    '_layouts/blog.html', '_layouts/post.html', '_includes/head.html', '_includes/header.html',
    '_includes/footer.html', '_includes/logo.html', 'home.css', 'form.js', 'blog/index.html', 'site.css', 'blog.css', 'legal.css', 'waitlist/waitlist.css', 'site.js',
    'home.js', 'waitlist/waitlist.js', 'favicon.svg'];
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(text, /#ff4f00|#ff6a26|--accent/i, `${file}: no Heura orange`);
    assert.doesNotMatch(text, /<span class="ov-mark"/, `${file}: no old square`);
  }
});
