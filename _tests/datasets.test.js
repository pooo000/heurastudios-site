// The Datasets page (Ryan, Nov 18, 2026: "build a seperate tab on the heura studios site and have the dataset preview
// list of it, have like different slots for each topic and stuff something like https://www.argalabs.com/twins", then
// "have it as a seperate tab at the top"). The app's library (app.heurastudios.com, #/datasets): the title, its
// numbers and a featured row; search and the topics; each topic on its own island with a card per set; and each set's
// preview: three of its rows with their credits, how its rows were picked, its source and license. Downloads stay in
// the app. The sets are _data/datasets.json, made from the app with _tools/make-datasets.py.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, launch, ROOT } = require('./helpers');

const LIB = JSON.parse(fs.readFileSync(path.join(ROOT, '_data', 'datasets.json'), 'utf8'));
const PAGE_YML = fs.readFileSync(path.join(ROOT, '_data', 'datasets_page.yml'), 'utf8');
const FEATURED = PAGE_YML.match(/^featured: \[(.*)\]$/m)[1].split(',').map(s => s.trim());
const ICONS = [...PAGE_YML.matchAll(/^  ([a-z]+): '/gm)].map(m => m[1]);
// the app's topics, in its Datasets page's order (studio/datasets.py, CATEGORIES)
const TOPICS = [['engineering', 'Engineering'], ['cad', 'CAD & 3D'], ['coding', 'Coding'], ['it', 'IT & systems'],
  ['identify', 'Identify & classify'], ['business', 'Business & work'], ['science', 'Math & science'],
  ['knowledge', 'Knowledge & reading'], ['language', 'Languages & writing'], ['everyday', 'Everyday']];
const BY_SLUG = Object.fromEntries(LIB.datasets.map(d => [d.slug, d]));
const FOUNDERS = 'ryan@heurastudios.com,william@heurastudios.com,tsun@heurastudios.com,ethan@heurastudios.com';
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const n = (x) => x.toLocaleString('en-US');

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

async function open(options = {}, at = '/datasets/') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...options });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url + at);
  return { page, errors, close: () => ctx.close() };
}

// what the page shows of the library, read from the page itself
const visibleCards = (page) => page.locator('.ds-topic .ds-card').evaluateAll(cs => cs
  .filter(c => c.getBoundingClientRect().height > 0).map(c => c.getAttribute('data-slug')));
const visibleTopics = (page) => page.locator('.ds-topic').evaluateAll(ss => ss
  .filter(s => s.getBoundingClientRect().height > 0).map(s => s.getAttribute('data-topic')));

test('the data: the app’s 100 sets in its 10 topics, each set’s samples its own rows, credited where its license asks', () => {
  assert.equal(LIB.from.repo, 'pooo000/heurastudios-app');
  assert.match(LIB.from.commit, /^[0-9a-f]{7}$/, 'the app commit the library came from');
  assert.equal(LIB.count, 100);
  assert.equal(LIB.datasets.length, 100);
  assert.equal(LIB.rows, sum(LIB.datasets.map(d => d.rows)));
  assert.equal(LIB.rows_label, n(LIB.rows));
  assert.deepEqual(LIB.topics.map(t => [t.id, t.name]), TOPICS);
  for (const t of LIB.topics) {
    const sets = LIB.datasets.filter(d => d.topic === t.id);
    assert.equal(t.count, sets.length, t.id);
    assert.equal(t.rows_label, n(sum(sets.map(d => d.rows))), t.id);
    assert.ok(ICONS.includes(t.id), `${t.id}: an icon in _data/datasets_page.yml`);
  }
  // by topic, in the app's order
  const order = TOPICS.map(([id]) => id);
  const topicsInOrder = LIB.datasets.map(d => order.indexOf(d.topic));
  assert.deepEqual(topicsInOrder, [...topicsInOrder].sort((a, b) => a - b), 'sets grouped by topic, in order');
  const slugs = LIB.datasets.map(d => d.slug);
  assert.equal(new Set(slugs).size, 100, 'one slug each');
  for (const s of slugs) assert.ok(!order.includes(s) && !['main', 'all', 'ask'].includes(s), `${s}: not an id the page uses`);
  assert.equal(FEATURED.length, 4);
  for (const s of FEATURED) assert.ok(BY_SLUG[s], `featured ${s} is a set`);

  let credited = 0;
  for (const d of LIB.datasets) {
    const where = d.slug;
    assert.match(d.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, where);
    assert.ok(d.title && d.description && d.how && d.source.name && d.source.license, where);
    assert.ok(d.rows >= 300 && d.rows <= 1000, `${where}: ${d.rows} rows (one Import CSV holds 1,000)`);
    assert.equal(d.rows_label, n(d.rows), where);
    assert.match(d.size_label, /^\d+ KB$/, where);
    assert.match(d.source.license_url, /^https:\/\//, where);
    assert.doesNotMatch(JSON.stringify(d), /credits\.csv/, `${where}: no file the site doesn't serve`);
    assert.doesNotMatch(JSON.stringify(d), /Heura Studio(?!s)/, where);
    assert.equal(d.samples.length, 3, where);
    for (const s of d.samples) {
      assert.ok(Number.isInteger(s.row) && s.row >= 1 && s.row <= d.rows, `${where}: row ${s.row}`);
      assert.ok(s.q && s.a, where);
      if (!s.credit) continue;
      credited += 1;
      assert.ok(s.credit.parts.length >= 1, where);
      for (const p of s.credit.parts) {
        assert.match(p.url, /^https?:\/\//, `${where}: ${p.what}`);
        if (p.by_url) assert.match(p.by_url, /^https:\/\//, `${where}: ${p.by}`);
        if (p.license) assert.match(p.license_url, /^https:\/\/creativecommons\.org\//, where);
      }
      assert.ok(s.credit.license || s.credit.parts.every(p => p.license), `${where}: every part's license is said`);
    }
    // a Stack Exchange or Tatoeba set credits each of its rows (their licenses ask that)
    if (/Stack Exchange|Stack Overflow|Super User|Server Fault|Ask Ubuntu|Ask Different|Tatoeba|Cross Validated/.test(d.source.name)) {
      assert.ok(d.samples.every(s => s.credit), `${where}: each row credited`);
    }
  }
  assert.ok(credited >= 200, `${credited} credited sample rows`);
});

test('Datasets is a page of its own: the title, the lead, its numbers, and the header says it’s the page you’re on', async () => {
  const { page, errors, close } = await open();
  assert.equal(await page.title(), 'Datasets – Heura Studios');
  assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Datasets');
  assert.equal((await page.locator('.ds-lead').innerText()).replace(/\s+/g, ' '),
    'Ready-made examples for training a model in Heura Studios. One question,answer CSV each, up to 1,000 rows. Written by people and openly licensed.');
  const stats = await page.locator('.ds-stats > div').evaluateAll(ds => ds.map(d => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]));
  assert.deepEqual(stats, [['Datasets', '100'], ['Examples', LIB.rows_label], ['Topics', '10']]);
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  assert.match(description, /^100 ready-made datasets for training a model in Heura Studios/);
  assert.ok(description.length <= 170, `a search result's length (${description.length})`);
  for (const where of ['header', 'footer']) {
    const link = page.locator(where).getByRole('link', { name: 'Datasets', exact: true });
    assert.equal(await link.getAttribute('href'), '/datasets/', where);
    assert.equal(await link.getAttribute('aria-current'), 'page', where);
  }
  assert.deepEqual(errors, []);
  await close();
});

test('the featured row: one set from each of the topics Ryan named first, each with a row of it, opening its preview', async () => {
  const { page, close } = await open();
  const cards = await page.locator('.ds-featured > .ds-card').evaluateAll(cs => cs.map(c => ({
    topic: c.querySelector('.ds-card-topic').textContent.trim(), title: c.querySelector('.ds-card-title').textContent.trim(),
    href: c.querySelector('a.ds-open').getAttribute('href'),
    peek: [...c.querySelectorAll('.ds-peek dt, .ds-peek dd')].map(e => e.textContent.trim()),
    tags: [...c.querySelectorAll('.ds-tag')].map(e => e.textContent.trim()),
  })));
  assert.deepEqual(cards.map(c => c.href), FEATURED.map(s => `#${s}`));
  for (const [i, c] of cards.entries()) {
    const d = BY_SLUG[FEATURED[i]];
    assert.equal(c.title, d.title);
    assert.equal(c.topic, d.topic_name);
    assert.deepEqual(c.peek, ['question', d.teaser.q, 'answer', d.teaser.a], d.slug);
    assert.ok(d.teaser.q.length <= 85 && d.teaser.a.length <= 85, `${d.slug}: a short peek`);
    assert.deepEqual(c.tags, [`${d.rows_label} examples`, d.source.license]);
  }
  assert.deepEqual(cards.map(c => c.topic), ['Engineering', 'CAD & 3D', 'Coding', 'Identify & classify']);
  await page.locator('.ds-featured .ds-open').nth(2).click();
  assert.equal(await page.locator('dialog#python').evaluate(d => d.open), true);
  await close();
});

test('every set has its card in its topic’s island: title, what it does, how many examples, its license', async () => {
  const { page, errors, close } = await open();
  const topics = await page.locator('.ds-topic').evaluateAll(ss => ss.map(s => ({
    id: s.id, name: s.querySelector('h2').textContent.trim(), count: s.querySelector('.ds-topic-count').textContent.trim(),
    icon: s.querySelector('h2 .ds-tile use').getAttribute('href'),
    cards: [...s.querySelectorAll('.ds-card')].map(c => ({
      slug: c.getAttribute('data-slug'), title: c.querySelector('h3').textContent.trim(),
      href: c.querySelector('a.ds-open').getAttribute('href'), haspopup: c.querySelector('a.ds-open').getAttribute('aria-haspopup'),
      desc: c.querySelector('.ds-card-desc').textContent.trim(), tags: [...c.querySelectorAll('.ds-tag')].map(e => e.textContent.trim()),
      links: c.querySelectorAll('a').length,
    })),
  })));
  assert.deepEqual(topics.map(t => [t.id, t.name]), TOPICS);
  for (const t of topics) {
    const data = LIB.topics.find(x => x.id === t.id);
    assert.equal(t.count, `${data.count} datasets · ${data.rows_label} examples`, t.id);
    assert.equal(t.icon, `#ds-i-${t.id}`, `${t.id}: its icon`);
    assert.equal(await page.locator(`symbol#ds-i-${t.id}`).count(), 1, `${t.id}: its icon is drawn once`);
    const sets = LIB.datasets.filter(d => d.topic === t.id);
    assert.deepEqual(t.cards.map(c => c.slug), sets.map(d => d.slug), `${t.id}: its sets, in the app's order`);
    for (const [i, c] of t.cards.entries()) {
      const d = sets[i];
      assert.equal(c.title, d.title, d.slug);
      assert.equal(c.desc, d.description, d.slug);
      assert.deepEqual(c.tags, [`${d.rows_label} examples`, d.source.license], d.slug);
      assert.equal(c.href, `#${d.slug}`, d.slug);
      assert.equal(c.haspopup, 'dialog', d.slug);
      assert.equal(c.links, 1, `${d.slug}: one link, its title (the card is it)`);
    }
  }
  assert.equal(await page.locator('#ds-shown').innerText(), '100 datasets');
  // no downloads, no prices, nothing casual
  assert.equal(await page.locator('a[download], a[href$=".csv"], a[href*="/api/"]').count(), 0, 'downloads stay in the app');
  const words = await page.locator('body').innerText();
  assert.doesNotMatch(words, /\bTry it\b|\$\d/i);
  assert.deepEqual(errors, []);
  await close();
});

test('the whole card is its link: a click anywhere on it opens its preview', async () => {
  const { page, close } = await open();
  const card = page.locator('.ds-card[data-slug="robotics"]');
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  await page.mouse.click(box.x + 12, box.y + box.height - 12);   // (on its tags, far from the title)
  assert.equal(await page.locator('dialog#robotics').evaluate(d => d.open), true);
  await close();
});

test('search keeps the sets with every word typed, and a topic with none is put away', async () => {
  const { page, close } = await open();
  const search = page.getByRole('searchbox', { name: 'Search datasets' });
  const words = (d) => [d.title, d.description, `${d.rows_label} examples`, d.source.license, d.source.name, d.topic_name]
    .join(' ').toLowerCase();
  for (const q of ['python', 'stack exchange circuit', 'Translate', 'cc by 4.0', 'blender']) {
    await search.fill(q);
    const want = LIB.datasets.filter(d => q.toLowerCase().split(/\s+/).every(w => words(d).includes(w))).map(d => d.slug);
    assert.ok(want.length > 0, q);
    assert.deepEqual(await visibleCards(page), want, q);
    assert.deepEqual(await visibleTopics(page), [...new Set(want.map(s => BY_SLUG[s].topic))], `${q}: only topics with a match`);
    assert.equal(await page.locator('#ds-shown').innerText(), `${want.length} of 100 datasets`, q);
    assert.equal(await page.locator('#ds-none').isVisible(), false, q);
  }
  await search.fill('zzzzqx');
  assert.deepEqual(await visibleCards(page), []);
  assert.equal(await page.locator('#ds-shown').innerText(), '0 of 100 datasets');
  assert.equal(await page.locator('#ds-none').innerText().then(t => t.split('\n')[0]), 'No dataset matches that.');
  await page.getByRole('button', { name: 'Show all datasets' }).click();
  assert.equal(await search.inputValue(), '');
  assert.equal((await visibleCards(page)).length, 100);
  assert.equal(await page.locator('#ds-shown').innerText(), '100 datasets');
  // "/" goes to search, from anywhere but a field
  await page.locator('h1').click();
  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ds-search');
  await close();
});

test('the topics: All, or one, as toggle buttons; with search too', async () => {
  const { page, close } = await open();
  const chips = await page.locator('.ds-chip').evaluateAll(bs => bs.map(b => [b.textContent.replace(/\s+/g, ' ').trim(), b.getAttribute('aria-pressed')]));
  assert.deepEqual(chips, [['All 100', 'true'], ...LIB.topics.map(t => [`${t.name} ${t.count}`, 'false'])]);
  assert.equal(await page.getByRole('group', { name: 'Topics' }).count(), 1);
  await page.getByRole('button', { name: /^CAD & 3D/ }).click();
  assert.deepEqual(await visibleTopics(page), ['cad']);
  assert.deepEqual(await visibleCards(page), LIB.datasets.filter(d => d.topic === 'cad').map(d => d.slug));
  assert.equal(await page.getByRole('button', { name: /^CAD & 3D/ }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#ds-shown').innerText(), '7 of 100 datasets');
  await page.getByRole('searchbox', { name: 'Search datasets' }).fill('printing');
  assert.deepEqual(await visibleCards(page), ['3d-printing']);
  await page.getByRole('button', { name: /^Coding/ }).click();
  assert.deepEqual(await visibleCards(page), [], 'nothing about printing in Coding');
  assert.equal(await page.locator('#ds-none').isVisible(), true);
  await page.getByRole('button', { name: /^All/ }).click();
  assert.ok((await visibleCards(page)).includes('3d-printing'));
  await close();
});

// A set's preview: its rows as the CSV has them, with their credits; how they were picked; its source and license.
async function preview(page, slug) {
  return page.locator(`dialog#${slug}`).evaluate(d => ({
    open: d.open, modal: d.matches(':modal'), label: document.getElementById(d.getAttribute('aria-labelledby')).textContent,
    topic: d.querySelector('.ds-card-topic').textContent.trim(), desc: d.querySelector('.ds-p-desc').textContent,
    tags: [...d.querySelectorAll('.ds-tag')].map(e => e.textContent),
    head: [...d.querySelectorAll('thead th')].map(e => e.textContent),
    rows: [...d.querySelectorAll('tbody')].map(b => ({
      row: b.querySelector('td.ds-n').textContent, q: b.querySelector('td.ds-q').textContent, a: b.querySelector('td.ds-a').textContent,
      credit: b.querySelector('.ds-credit') && b.querySelector('.ds-credit td:last-child').textContent,
      links: [...b.querySelectorAll('.ds-credit a')].map(a => [a.textContent, a.getAttribute('href')]),
    })),
    subs: [...d.querySelectorAll('.ds-p-sub')].map(e => e.textContent),
    text: [...d.querySelectorAll('.ds-p-text')].map(e => e.textContent),
    fine: [...d.querySelectorAll('.ds-fine')].map(e => e.textContent),
    source: [...d.querySelectorAll('.ds-p-text a')].map(a => [a.textContent, a.getAttribute('href')]),
    ask: [...d.querySelectorAll('.ds-p-foot a')].map(a => [a.textContent, a.getAttribute('href')]),
  }));
}

test('a card opens its preview: three of its rows with their credits, how they were picked, its source and license', async () => {
  const { page, errors, close } = await open();
  for (const slug of ['python', 'translate-english-spanish', 'health-info', 'math-word-problems', 'identify-question-field']) {
    const d = BY_SLUG[slug];
    await page.locator(`.ds-topic a.ds-open[href="#${slug}"]`).click();
    const p = await preview(page, slug);
    assert.ok(p.open && p.modal, `${slug}: open, as a modal dialog`);
    assert.equal(await page.evaluate(() => location.hash), `#${slug}`, `${slug}: its address`);
    assert.equal(p.label, d.title);
    assert.equal(p.topic, d.topic_name);
    assert.equal(p.desc, d.description);
    assert.deepEqual(p.tags, [`${d.rows_label} examples`, `${d.size_label} CSV`, d.source.license]);
    assert.deepEqual(p.head, ['row', 'question', 'answer'], 'the CSV’s columns');
    assert.deepEqual(p.rows.map(r => [Number(r.row), r.q, r.a]), d.samples.map(s => [s.row, s.q, s.a]), slug);
    for (const [i, s] of d.samples.entries()) {
      const r = p.rows[i];
      assert.equal(Boolean(r.credit), Boolean(s.credit), `${slug} row ${s.row}: credited as its license asks`);
      if (!s.credit) continue;
      for (const part of s.credit.parts) {
        assert.ok(r.links.some(([t, h]) => t === part.what && h === part.url), `${slug}: ${part.what} linked`);
        if (part.by) assert.match(r.credit, new RegExp(`${part.what} by ${part.by.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), slug);
        if (part.by_url) assert.ok(r.links.some(([t, h]) => t === part.by && h === part.by_url), `${slug}: ${part.by} linked`);
      }
      const license = s.credit.license ? [[s.credit.license, s.credit.license_url]] : s.credit.parts.map(x => [x.license, x.license_url]);
      for (const l of license) assert.ok(r.links.some(([t, h]) => t === l[0] && h === l[1]), `${slug}: its license, linked`);
    }
    assert.deepEqual(p.subs, ['A few of its rows', 'How the rows were picked', 'Source and license']);
    assert.equal(p.text[0], d.how);
    assert.deepEqual(p.source, [[d.source.name, d.source.url], [d.source.license, d.source.license_url]]);
    assert.ok(p.fine.includes(d.source.attribution), `${slug}: its attribution`);
    if (d.note) assert.ok(p.fine.includes(d.note), `${slug}: what was changed`);
    assert.deepEqual(p.ask, [['Sign up', 'https://app.heurastudios.com/signup']]);   // (open to anyone since Nov 18)
    await page.getByRole('dialog').getByRole('link', { name: 'Close' }).click();
    assert.equal(await page.locator(`dialog#${slug}`).evaluate(x => x.open), false, `${slug}: Close`);
    assert.equal(await page.evaluate(() => location.hash), '', `${slug}: the address goes back`);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), `#${slug}`, `${slug}: focus back on its card`);
  }
  assert.deepEqual(errors, []);
  await close();
});

test('every preview has its set’s rows and credits, and its Close goes back to its topic', async () => {
  const { page, close } = await open();
  const all = await page.locator('dialog.ds-preview').evaluateAll(ds => ds.map(d => ({
    id: d.id, rows: [...d.querySelectorAll('tbody td.ds-n:not(:empty)')].map(e => Number(e.textContent)),
    credits: d.querySelectorAll('.ds-credit').length, close: d.querySelector('.ds-close').getAttribute('href'),
  })));
  assert.deepEqual(all.map(d => d.id), LIB.datasets.map(d => d.slug));
  for (const p of all) {
    const d = BY_SLUG[p.id];
    assert.deepEqual(p.rows, d.samples.map(s => s.row), p.id);
    assert.equal(p.credits, d.samples.filter(s => s.credit).length, p.id);
    assert.equal(p.close, `#${d.topic}`, p.id);
  }
  // they're outside main: not islands, and not in the page's reading order until one is open
  assert.equal(await page.locator('main dialog').count(), 0);
  assert.equal(await page.getByRole('dialog').count(), 0, 'none open');
  await close();
});

test('Escape closes a preview, and so does a click beside it, but not a click in it', async () => {
  const { page, close } = await open();
  const isOpen = () => page.locator('dialog#git').evaluate(d => d.open);
  await page.locator('.ds-topic a.ds-open[href="#git"]').click();
  await page.keyboard.press('Escape');
  assert.equal(await isOpen(), false, 'Escape');
  await page.locator('.ds-topic a.ds-open[href="#git"]').click();
  await page.locator('dialog#git .ds-p-desc').click();
  assert.equal(await isOpen(), true, 'a click in it');
  await page.mouse.click(10, 450);
  assert.equal(await isOpen(), false, 'a click beside it');
  // and the page stays where it was under it
  const y = await page.evaluate(() => scrollY);
  await page.locator('.ds-topic a.ds-open[href="#git"]').click();
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => scrollY), y);
  await close();
});

test('a set’s address opens its preview: /datasets/#<slug>', async () => {
  const { page, errors, close } = await open({}, '/datasets/#circuit-design');
  assert.equal(await page.locator('dialog#circuit-design').evaluate(d => d.open && d.matches(':modal')), true);
  assert.equal(await page.getByRole('dialog').getByRole('heading', { level: 2 }).innerText(), 'Circuit design & analysis');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog#circuit-design').evaluate(d => d.open), false);
  await page.waitForFunction(() => location.hash === '', null, { timeout: 2000 });   // (its close event comes a moment later)
  assert.deepEqual(errors, []);
  await close();
  const other = await open({}, '/datasets/#engineering');   // a topic's address is just the topic
  assert.equal(await other.page.locator('dialog[open]').count(), 0);
  await other.close();
});

test('without a script every topic shows, and a card’s link still opens its preview', async () => {
  const { page, close } = await open({ javaScriptEnabled: false });
  assert.equal((await visibleCards(page)).length, 100);
  assert.deepEqual(await visibleTopics(page), TOPICS.map(([id]) => id));
  assert.equal(await page.locator('#ds-search').isVisible(), false, 'search needs the script');
  assert.equal(await page.locator('.ds-filters').isVisible(), false, 'so does the filter');
  await page.locator('.ds-topic a.ds-open[href="#sql"]').click();
  const sheet = page.locator('dialog#sql');
  assert.equal(await sheet.isVisible(), true, 'the preview, as the page’s target');
  const box = await sheet.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 1440 && box.y >= 0 && box.height <= 900, 'on the screen');
  await sheet.getByRole('link', { name: 'Close' }).click();
  assert.equal(await sheet.isVisible(), false);
  assert.equal(new URL(page.url()).hash, '#coding', 'back at its topic');
  await close();
});

test('on a computer each topic is an island; on a phone one column and a preview that fits, nothing sideways', async () => {
  const wide = await open({ viewport: { width: 1600, height: 1000 } });
  const isles = await wide.page.locator('main > section').evaluateAll(ss => ss.map(s => {
    const r = s.getBoundingClientRect(), cs = getComputedStyle(s);
    return { id: s.id || s.className, w: Math.round(r.width), x: Math.round(r.x), radius: parseFloat(cs.borderTopLeftRadius) };
  }));
  assert.equal(isles.length, 13, 'the top, search, the 10 topics and the end');
  for (const i of isles) assert.ok(i.w === 1280 && i.x === 160 && i.radius > 0, `${i.id}: an island (${i.w}, ${i.x}, ${i.radius})`);
  const cols = await wide.page.locator('#coding .ds-card').evaluateAll(cs => new Set(cs.slice(0, 6).map(c => Math.round(c.getBoundingClientRect().x))).size);
  assert.equal(cols, 3, 'three sets to a row');
  await wide.close();

  for (const width of [320, 390, 768, 1024, 1440]) {
    const { page, close } = await open({ viewport: { width, height: 800 } });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `${width}px: nothing sideways`);
    await page.locator('.ds-topic a.ds-open[href="#python"]').click();
    const box = await page.locator('dialog#python').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width && box.height <= 800, `${width}px: the preview fits (${JSON.stringify(box)})`);
    if (width < 640) {
      assert.equal(await page.locator('dialog#python thead').isVisible(), false, `${width}px: rows stacked`);
      const [q, a] = await Promise.all(['td.ds-q', 'td.ds-a'].map(s => page.locator(`dialog#python tbody >> nth=0 >> ${s}`).boundingBox()));
      assert.ok(a.y >= q.y + q.height, `${width}px: the answer under the question`);
    }
    await page.keyboard.press('Escape');
    await close();
  }
  const phone = await open({ viewport: { width: 390, height: 844 } });
  const b = await phone.page.locator('.ds-topic .ds-card').evaluateAll(cs => cs.slice(0, 2).map(c => c.getBoundingClientRect().toJSON()));
  assert.ok(b[1].top >= b[0].bottom && b.every(r => r.left >= 0 && r.right <= 390), 'one card under another');
  const chips = await phone.page.locator('.ds-filters').evaluate(f => ({ scrolls: f.scrollWidth > f.clientWidth, wrap: getComputedStyle(f).flexWrap }));
  assert.deepEqual(chips, { scrolls: true, wrap: 'nowrap' }, 'the topics in one row that scrolls sideways');
  await phone.close();
});

test('light and dark: the cards and the preview in the page’s colors, the quiet words at 4.5:1 or more', async () => {
  const lum = (css) => {
    const scale = /^color\(srgb/.test(css) ? 1 : 255;
    const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / scale)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  for (const [scheme, page_, panel] of [['light', 'rgb(255, 255, 255)', 'rgb(243, 243, 243)'], ['dark', 'rgb(0, 0, 0)', 'rgb(22, 22, 22)']]) {
    const { page, close } = await open({ colorScheme: scheme });
    assert.equal(await page.locator('.ds-topic .ds-card').first().evaluate(c => getComputedStyle(c).backgroundColor), panel, scheme);
    for (const sel of ['.ds-topic .ds-card-desc', '.ds-topic .ds-tag', '.ds-topic .ds-more', '.ds-topic-count', '.ds-chip-n']) {
      const [fg, bg] = await page.locator(sel).first().evaluate(el => {
        let bg = 'rgba(0, 0, 0, 0)';
        for (let e = el; e && /rgba\(.*, 0\)$/.test(bg); e = e.parentElement) bg = getComputedStyle(e).backgroundColor;
        return [getComputedStyle(el).color, bg];
      });
      assert.ok(ratio(fg, bg) >= 4.5, `${scheme} ${sel}: ${fg} on ${bg} (${ratio(fg, bg).toFixed(2)})`);
    }
    await page.locator('.ds-topic a.ds-open[href="#react"]').click();
    const look = await page.locator('dialog#react').evaluate(d => [getComputedStyle(d).backgroundColor, getComputedStyle(d).color,
      getComputedStyle(d.querySelector('.ds-rows-box')).backgroundColor]);
    assert.deepEqual(look.slice(0, 1), [page_], `${scheme}: the preview is the page's color`);
    assert.equal(look[2], panel, `${scheme}: its rows on a panel`);
    const credit = await page.locator('dialog#react .ds-credit td:last-child').first().evaluate(el => [getComputedStyle(el).color,
      getComputedStyle(el.closest('.ds-rows-box')).backgroundColor]);
    assert.ok(ratio(...credit) >= 4.5, `${scheme}: the credits read (${ratio(...credit).toFixed(2)})`);
    await close();
  }
});

test('the end: a set that isn’t here can be asked for, and Sign up', async () => {
  const { page, close } = await open();
  const ask = page.locator('#ask');
  assert.equal(await ask.getByRole('heading', { level: 2 }).innerText(), 'Don’t see the dataset you need?');
  assert.equal(await ask.getByRole('link', { name: 'Request a dataset' }).getAttribute('href'), `mailto:${FOUNDERS}?subject=Dataset%20request`);
  assert.equal(await ask.getByRole('link', { name: 'Sign up' }).getAttribute('href'), 'https://app.heurastudios.com/signup');
  assert.equal(await ask.getByRole('link', { name: 'Request access' }).count(), 0);
  await close();
});
