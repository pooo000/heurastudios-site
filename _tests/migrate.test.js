// The OpenAI migration page (/openai-fine-tuning/; Ryan, Nov 24, 2026: "do the migration page"): OpenAI's dates and
// where they come from, the converter (an OpenAI fine-tuning JSONL in, the Studio's question,answer CSV out, in the
// browser: nothing is sent anywhere), and the steps. The Studio's limits are the app's (studio/projects.py): questions
// up to 2,000 characters, answers up to 4,000, 1,000 rows an import, 5,000 an agent.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { startServer, launch } = require('./helpers');

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

async function open(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true, ...options });
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url + '/openai-fine-tuning/');
  page.on('request', r => { if (!r.url().startsWith('blob:') && !r.url().startsWith('data:')) requests.push(r.url()); });
  return { page, errors, requests, close: () => ctx.close() };
}

const jsonl = (...objs) => objs.map(o => (typeof o === 'string' ? o : JSON.stringify(o))).join('\n') + '\n';
const chat = (...ms) => ({ messages: ms.map(([role, content, extra]) => ({ role, content, ...extra })) });

// a file into the page's input -> what the page shows
async function convertFile(page, name, text) {
  await page.locator('#mg-file').setInputFiles({ name, mimeType: 'application/jsonl', buffer: Buffer.from(text) });
}
const counts = (page) => page.locator('[data-counts] dd').allInnerTexts();
async function download(page, link) {
  const [d] = await Promise.all([page.waitForEvent('download'), link.click()]);
  return { name: d.suggestedFilename(), text: fs.readFileSync(await d.path(), 'utf8') };
}
// the CSV as the app's import reads it (Python's csv.reader, RFC 4180): rows of cells
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

test('the top: OpenAI’s date, from its deprecations page, the days left, Convert your file and Sign up', async () => {
  const { page, errors, close } = await open();
  assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Moving off OpenAI fine-tuning');
  assert.match(await page.locator('.mg-lead').innerText(), /OpenAI stops new fine-tuning jobs on January 6, 2027\./);
  assert.equal(await page.getByRole('link', { name: 'OpenAI’s deprecations page' }).getAttribute('href'),
    'https://developers.openai.com/api/docs/deprecations');
  const left = page.locator('.mg-left');
  const days = Math.ceil((new Date('2027-01-06T00:00:00') - new Date()) / 864e5);
  if (days > 0) assert.match(await left.innerText(), new RegExp(`^${days.toLocaleString('en-US')} days? left\\.$`));
  else assert.equal(await left.isVisible(), false);
  assert.equal(await page.getByRole('link', { name: 'Convert your file' }).getAttribute('href'), '#convert');
  assert.equal(await page.locator('main').getByRole('link', { name: 'Sign up', exact: true }).first().getAttribute('href'),
    'https://app.heurastudios.com/signup');
  assert.deepEqual(errors, []);
  await close();
});

test('every format: chat (several turns, weight 0, tool calls, parts), preference, prompt/completion; the most common system message is the script', async () => {
  const { page, errors, requests, close } = await open();
  const sys = ['system', 'You are Ada, the help desk for Acme.'];
  await convertFile(page, 'acme-train.jsonl', jsonl(
    chat(sys, ['user', 'Reset my password?'], ['assistant', 'Go to Settings, then Security, then Reset.']),
    chat(sys, ['user', 'Hi'], ['assistant', 'skip me', { weight: 0 }], ['user', 'VPN down?'], ['assistant', 'Restart the client, then call IT.']),
    chat(sys, ['user', 'Order 12?'], ['assistant', null, { tool_calls: [{ id: 'c', type: 'function', function: { name: 't', arguments: '{}' } }] }]),
    chat(['system', 'Another system message'], ['user', [{ type: 'text', text: 'What is' }, { type: 'image_url', image_url: { url: 'x' } }, { type: 'text', text: 'this?' }]],
      ['assistant', [{ type: 'text', text: 'A router.' }]]),
    { input: { messages: [{ role: 'user', content: 'Is it free?' }] }, preferred_output: [{ role: 'assistant', content: 'The first month is.' }],
      non_preferred_output: [{ role: 'assistant', content: 'No.' }] },
    { prompt: 'Office hours?', completion: ' 9 to 5. ' },
    'not json at all',
    { something: 'else' },
    chat(['user', 'Only a question']),
    '',
  ));
  await page.locator('[data-result]').waitFor();
  assert.equal(await page.locator('[data-result-title]').innerText(), 'acme-train.jsonl');
  assert.deepEqual(await counts(page), ['5', '9', '5']);   // rows; lines read (not the blank one); left out
  const notes = await page.locator('[data-notes] li').allInnerTexts();
  assert.equal(notes[0], 'Left out: 1 line that isn’t JSON; 1 line in a format the converter doesn’t know; 1 reply marked "weight": 0; '
    + '1 tool call (the Studio trains on text); 1 line with no answer to train on.');
  assert.equal(notes[1], '1 row came from conversations with several turns: each is the reply with the question just before it.');
  assert.equal(await page.locator('[data-script-text]').inputValue(), 'You are Ada, the help desk for Acme.');
  assert.match(await page.locator('[data-script-note]').innerText(), /^Your file has 2 different system messages\. This one is the most common \(3 lines\)\./);

  const link = page.getByRole('link', { name: 'Download the CSV (5 rows)' });
  const { name, text } = await download(page, link);
  assert.equal(name, 'acme-train.csv');
  assert.deepEqual(parseCsv(text), [
    ['question', 'answer'],
    ['Reset my password?', 'Go to Settings, then Security, then Reset.'],
    ['VPN down?', 'Restart the client, then call IT.'],
    ['What is\nthis?', 'A router.'],
    ['Is it free?', 'The first month is.'],
    ['Office hours?', '9 to 5.'],
  ]);
  assert.deepEqual(requests, [], 'the file never leaves the browser');
  assert.deepEqual(errors, []);
  await close();
});

test('the CSV keeps quotes, commas and line breaks the way the Studio’s import reads them', async () => {
  const { page, errors, close } = await open();
  const q = 'Say "hi", then\r\nwait', a = 'Done, "really"\nyes';
  await convertFile(page, 'tricky.jsonl', jsonl(chat(['user', q], ['assistant', a])));
  const { text } = await download(page, page.getByRole('link', { name: /Download the CSV/ }));
  assert.match(text, /^question,answer\r\n/);
  assert.deepEqual(parseCsv(text), [['question', 'answer'], ['Say "hi", then\nwait', a]]);   // (\r\n as \n, as the Studio stores it)
  assert.deepEqual(errors, []);
  await close();
});

test('the Studio’s limits: rows over 2,000 or 4,000 characters are left out, and 2,500 rows come in parts of 1,000', async () => {
  const { page, errors, close } = await open();
  const lines = [chat(['user', 'q'.repeat(2000)], ['assistant', 'a'.repeat(4000)]),   // exactly at the limits: kept
    chat(['user', 'q'.repeat(2001)], ['assistant', 'ok']), chat(['user', 'ok'], ['assistant', 'a'.repeat(4001)])];
  for (let i = 1; i < 2500; i++) lines.push({ prompt: `Question ${i}`, completion: `Answer ${i}` });
  await convertFile(page, 'big.jsonl', jsonl(...lines));
  await page.locator('[data-result]').waitFor();
  assert.deepEqual(await counts(page), ['2,500', '2,502', '2']);
  assert.match((await page.locator('[data-notes] li').allInnerTexts())[0], /2 rows over the Studio’s limits \(questions up to 2,000 characters, answers up to 4,000\)/);
  const links = page.locator('[data-downloads] a');
  assert.deepEqual(await links.allInnerTexts(), ['Download part 1 of 3 (1,000 rows)', 'Download part 2 of 3 (1,000 rows)', 'Download part 3 of 3 (500 rows)']);
  const parts = [];
  for (let i = 0; i < 3; i++) parts.push(await download(page, links.nth(i)));
  assert.deepEqual(parts.map(p => p.name), ['big-part-1-of-3.csv', 'big-part-2-of-3.csv', 'big-part-3-of-3.csv']);
  const rows = parts.map(p => parseCsv(p.text));
  assert.deepEqual(rows.map(r => r.length - 1), [1000, 1000, 500]);
  assert.deepEqual(rows[2][500], ['Question 2499', 'Answer 2499']);
  assert.equal(await page.locator('[data-script]').isVisible(), false, 'no system message, no script');
  assert.deepEqual(errors, []);
  await close();
});

test('over 5,000 rows it says an agent holds 5,000; a file with nothing to import says why', async () => {
  const { page, errors, close } = await open();
  const lines = [];
  for (let i = 0; i < 5001; i++) lines.push({ prompt: `q${i}`, completion: `a${i}` });
  await convertFile(page, 'huge.jsonl', jsonl(...lines));
  await page.locator('[data-result]').waitFor();
  assert.ok((await page.locator('[data-notes]').innerText()).includes('An agent holds up to 5,000 examples.'));
  assert.equal(await page.locator('[data-downloads] a').count(), 6);

  await convertFile(page, 'nothing.jsonl', jsonl('nope', chat(['user', 'q'], ['assistant', 'x', { weight: 0 }])));
  await page.locator('[data-error]').filter({ hasText: 'No rows' }).waitFor();
  assert.equal(await page.locator('[data-error]').innerText(),
    'No rows to import in nothing.jsonl. 1 line that isn’t JSON; 1 reply marked "weight": 0.');
  assert.equal(await page.locator('[data-result]').isVisible(), false);
  await convertFile(page, 'empty.jsonl', '\n\n');
  await page.locator('[data-error]').filter({ hasText: 'empty' }).waitFor();
  assert.equal(await page.locator('[data-error]').innerText(), 'empty.jsonl is empty.');
  assert.deepEqual(errors, []);
  await close();
});

test('the sample file, a dropped file, and Copy', async () => {
  const { page, errors, requests, close } = await open({ permissions: ['clipboard-read', 'clipboard-write'] });
  await page.getByRole('button', { name: 'Load a sample file' }).click();
  assert.deepEqual(await counts(page), ['5', '5', '1']);
  assert.equal(await page.locator('[data-result]').evaluate(el => el === document.activeElement), true, 'the result takes focus');
  assert.deepEqual(await page.locator('[data-rows] tr').count(), 3);
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.getByRole('button', { name: 'Copied' }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'You are Pip, the support agent for Northwind Bikes. Answer in two sentences or fewer.');
  // dropping a file on the box
  const data = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['{"prompt":"Dropped?","completion":"Yes."}\n'], 'dropped.jsonl'));
    return dt;
  });
  await page.locator('[data-drop]').dispatchEvent('drop', { dataTransfer: data });
  await page.locator('[data-result-title]').filter({ hasText: 'dropped.jsonl' }).waitFor();
  assert.deepEqual(await counts(page), ['1', '1', '0']);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  await close();
});

test('without JavaScript it says the converter needs it, and the steps and the map are still there', async () => {
  const { page, close } = await open({ javaScriptEnabled: false });
  assert.equal(await page.locator('[data-tool]').isVisible(), false);
  assert.match(await page.locator('main').innerText(), /The converter needs JavaScript\./);
  assert.deepEqual(await page.locator('.mg-step-list h3').allInnerTexts(), ['Make a notebook', 'Import the CSV', 'Test and train']);
  assert.equal(await page.locator('.mg-map tbody tr').count(), 7);
  await close();
});

test('on a phone and in dark it fits the screen, and the search engines can find it', async () => {
  for (const options of [{ viewport: { width: 375, height: 812 } }, { colorScheme: 'dark' }]) {
    const { page, errors, close } = await open(options);
    await page.getByRole('button', { name: 'Load a sample file' }).click();
    assert.ok(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []);
    await close();
  }
  const sitemap = await (await fetch(server.url + '/sitemap.xml')).text();
  assert.match(sitemap, /<loc>https:\/\/heurastudios\.com\/openai-fine-tuning\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/heurastudios\.com\/<\/loc>/);
  assert.doesNotMatch(sitemap, /waitlist|\/20\d\d-/);
  assert.match(await (await fetch(server.url + '/robots.txt')).text(), /^Sitemap: https:\/\/heurastudios\.com\/sitemap\.xml$/m);
});
