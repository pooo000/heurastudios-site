// Code.gs against stand-ins for the Google services it uses, so the wiring is checked without deploying.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A stand-in for one tab of the sheet: its cells, row 1 the header.
function fakeSheet(name) {
  const cells = [[]];
  return {
    name,
    cells,
    frozen: 0,
    getName: () => name,
    getLastRow: () => cells.length,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (cells[r - 1 + i] || [])[c - 1 + j] ?? '')),
      setValue(v) { (cells[r - 1] ||= [])[c - 1] = v; return this; },
      setValues(rows) { rows.forEach((row, i) => row.forEach((v, j) => { (cells[r - 1 + i] ||= [])[c - 1 + j] = v; })); return this; },
      setFontWeight() { return this; },
    }),
    appendRow: row => cells.push(row),
    setFrozenRows(n) { this.frozen = n; },
  };
}

function load() {
  const sheet = fakeSheet('Waitlist');
  const cells = sheet.cells;   // the first tab: the waitlist's joins and the old requests for access
  const tabs = [sheet];
  const book = {
    getSheets: () => tabs.slice(),
    getSheetByName: n => tabs.find(t => t.name === n) || null,
    insertSheet: (n, at) => { const t = fakeSheet(n); tabs.splice(at ?? tabs.length, 0, t); return t; },
    getUrl: () => 'https://docs.google.com/spreadsheets/d/x/edit',
  };
  const cache = new Map();
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => book, flush() {} },
    MailApp: { sendEmail() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: text => ({ text, setMimeType(m) { this.mime = m; return this; } }),
    },
    HtmlService: {
      createHtmlOutput: html => ({ html, setTitle() { return this; }, addMetaTag() { return this; } }),
    },
  };
  vm.createContext(ctx);
  for (const f of ['core.js', 'Code.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  return { ctx, cells, tabs, inquiries: () => (book.getSheetByName('Inquiries') || { cells: null }).cells,
    suggestions: () => (book.getSheetByName('Suggestions') || { cells: null }).cells };
}

test('setup writes the header row once, and makes the Inquiries and Suggestions tabs, last, with their headers', () => {
  const { ctx, cells, tabs, inquiries, suggestions } = load();
  ctx.setup();
  ctx.setup();
  assert.deepEqual(cells[0], ['Joined at', 'Email', 'Company', 'Came from', 'Name', 'Role', 'What they will specialize']);
  assert.equal(cells.length, 1);
  assert.deepEqual(tabs.map(t => t.name), ['Waitlist', 'Inquiries', 'Suggestions'], 'the waitlist stays the first tab');
  assert.deepEqual(Array.from(inquiries()[0]), ['Sent at', 'Email', 'Name', 'Company', 'Role', 'Question', 'Came from']);
  assert.equal(inquiries().length, 1);
  assert.deepEqual(Array.from(suggestions()[0]), ['Sent at', 'Suggestion', 'Email', 'Page']);
  assert.equal(suggestions().length, 1);
  assert.equal(tabs[1].frozen, 1);
  assert.equal(tabs[2].frozen, 1);
});

// The live sheet already has its Inquiries tab (Nov 18): setup leaves it and its rows as they are, and adds Suggestions
// after it.
test('setup on a sheet that already has its Inquiries tab keeps it, rows and all, and adds Suggestions last', () => {
  const { ctx, tabs, inquiries, suggestions } = load();
  ctx.setup();
  ctx.doPost({ parameter: { js: '1', kind: 'inquiry', name: 'Ann', email: 'a@b.co', message: 'Hi', from: '/' } });
  tabs.splice(2, 1);   // (as the live sheet was before this version: no Suggestions tab yet)
  assert.equal(suggestions(), null);
  ctx.setup();
  assert.deepEqual(tabs.map(t => t.name), ['Waitlist', 'Inquiries', 'Suggestions']);
  assert.equal(inquiries().length, 2, 'the inquiry is still there');
  assert.deepEqual(Array.from(suggestions()[0]), ['Sent at', 'Suggestion', 'Email', 'Page']);
});

test('a join from the page (js=1) answers JSON and adds a row', () => {
  const { ctx, cells } = load();
  ctx.setup();
  const out = ctx.doPost({ parameter: { js: '1', email: 'Ann@Acme.co', company: 'Acme', from: '/waitlist/' } });
  assert.equal(out.mime, 'json');
  assert.deepEqual(JSON.parse(out.text), { ok: true });
  assert.equal(cells.length, 2);
  assert.equal(cells[1][1], 'ann@acme.co');
});

test('a request from someone already on the waitlist puts the name, role and use on their row', () => {
  const { ctx, cells } = load();
  ctx.setup();
  ctx.doPost({ parameter: { js: '1', email: 'ann@acme.co', company: 'Acme', from: '/waitlist/' } });
  const out = ctx.doPost({ parameter: { js: '1', kind: 'request', email: 'Ann@Acme.co', company: 'Acme', from: '/',
    name: 'Ann Lee', role: 'Head of ML', use: 'A support agent' } });
  assert.deepEqual(JSON.parse(out.text), { ok: true });
  assert.equal(cells.length, 2, 'one row for that email');
  assert.deepEqual(Array.from(cells[1]).slice(1, 7),   // (the row was made inside the script's own context)
    ['ann@acme.co', 'Acme', '/waitlist/', 'Ann Lee', 'Head of ML', 'A support agent']);
});

test('a plain form post (no JavaScript on the page) gets a page that says so', () => {
  const { ctx, cells } = load();
  ctx.setup();
  const ok = ctx.doPost({ parameter: { email: 'a@b.co', company: 'Acme' } });
  assert.match(ok.html, /on the waitlist/);
  const bad = ctx.doPost({ parameter: { email: 'nope', company: 'Acme' } });
  assert.match(bad.html, /didn.t go through/i);
  assert.equal(cells.length, 2);
});

test('a plain post of a request for access (no JavaScript on the page) gets a page that says it was sent', () => {
  const { ctx, cells } = load();
  ctx.setup();
  const ok = ctx.doPost({ parameter: { kind: 'request', email: 'a@b.co', company: 'Acme', name: 'Ann' } });
  assert.match(ok.html, /Request sent/);
  assert.doesNotMatch(ok.html, /waitlist/);
  assert.equal(cells[1][4], 'Ann');
});

test('the 61st join in a minute is turned away', () => {
  const { ctx } = load();
  ctx.setup();
  let last;
  for (let i = 0; i < 61; i++) last = JSON.parse(ctx.doPost({ parameter: { js: '1', email: `p${i}@b.co`, company: 'Acme' } }).text);
  assert.deepEqual(last, { ok: false, error: 'busy' });
});

test('a failure inside answers a plain error, never a stack trace', () => {
  const { ctx } = load();
  ctx.SpreadsheetApp.getActiveSpreadsheet = () => { throw new Error('boom: internal detail'); };
  const quiet = console.error;
  console.error = () => {};
  try {
    const out = ctx.doPost({ parameter: { js: '1', email: 'a@b.co', company: 'Acme' } });
    assert.deepEqual(JSON.parse(out.text), { ok: false, error: 'server' });
  } finally {
    console.error = quiet;
  }
});

test('a visit to the web app address says what it is, and that it takes inquiries and suggestions', () => {
  const { ctx } = load();
  assert.deepEqual(JSON.parse(ctx.doGet().text), { ok: true, service: 'Heura waitlist', inquiries: true, suggestions: true });
});

// The emails to the founders go through MailApp, from "Heura Studios", with a link to the sheet.
function loadWithMail(opts = {}) {
  const l = load();
  l.mails = [];
  l.ctx.MailApp = { sendEmail: m => { if (opts.fails) throw new Error('Service invoked too many times'); l.mails.push(m); } };
  return l;
}

test('a request for access emails the founders from Heura Studios, with a link to the sheet', () => {
  const { ctx, mails } = loadWithMail();
  ctx.setup();
  const out = ctx.doPost({ parameter: { js: '1', kind: 'request', email: 'Ann@Acme.co', company: 'Acme', from: '/',
    name: 'Ann Lee', role: 'Head of ML', use: 'A support agent' } });
  assert.deepEqual(JSON.parse(out.text), { ok: true });
  assert.equal(mails.length, 1);
  const m = mails[0];
  assert.equal(m.to, 'ryan@heurastudios.com,william@heurastudios.com,tsun@heurastudios.com,ethan@heurastudios.com');
  assert.equal(m.replyTo, 'ann@acme.co');
  assert.equal(m.name, 'Heura Studios');
  assert.equal(m.subject, 'Request for access: Ann Lee, Acme');
  assert.match(m.body, /Every request is in the sheet: https:\/\/docs\.google\.com\/spreadsheets\/d\/x\/edit/);
});

test('a waitlist join sends no email', () => {
  const { ctx, mails } = loadWithMail();
  ctx.setup();
  ctx.doPost({ parameter: { js: '1', email: 'a@b.co', company: 'Acme', from: '/waitlist/' } });
  assert.equal(mails.length, 0);
});

test('when MailApp fails, the request is still saved and the page still says sent', () => {
  const { ctx, cells, mails } = loadWithMail({ fails: true });
  ctx.setup();
  const quiet = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.join(' '));
  try {
    const out = ctx.doPost({ parameter: { js: '1', kind: 'request', email: 'a@b.co', company: 'Acme', name: 'Ann' } });
    assert.deepEqual(JSON.parse(out.text), { ok: true });
    const page = ctx.doPost({ parameter: { kind: 'request', email: 'c@d.co', company: 'Acme', name: 'Bo' } });
    assert.match(page.html, /Request sent/);
  } finally {
    console.error = quiet;
  }
  assert.equal(cells.length, 3, 'both requests saved');
  assert.equal(mails.length, 0);
  assert.ok(logged.some(l => /email about it failed \(its row is saved\)/.test(l)), logged.join('\n'));
});

// ---- Inquiries (Nov 18, 2026): the home page's form posts kind=inquiry.
const INQUIRY = { js: '1', kind: 'inquiry', name: 'Ann Lee', email: 'Ann@Acme.co', company: 'Acme', role: 'Head of ML',
  message: 'Can we try it on our own data?', from: '/' };

test('an inquiry (js=1) answers JSON, goes on the Inquiries tab and emails the founders, never the waitlist', () => {
  const { ctx, cells, inquiries, mails } = loadWithMail();
  ctx.setup();
  const out = ctx.doPost({ parameter: INQUIRY });
  assert.equal(out.mime, 'json');
  assert.deepEqual(JSON.parse(out.text), { ok: true });
  assert.equal(cells.length, 1, 'nothing on the waitlist tab');
  assert.equal(inquiries().length, 2);
  assert.deepEqual(Array.from(inquiries()[1]).slice(1), ['ann@acme.co', 'Ann Lee', 'Acme', 'Head of ML', 'Can we try it on our own data?', '/']);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].name, 'Heura Studios');
  assert.equal(mails[0].replyTo, 'ann@acme.co');
  assert.equal(mails[0].subject, 'Inquiry: Ann Lee, Acme');
});

test('the first inquiry makes the Inquiries tab if setup has not run since', () => {
  const { ctx, tabs, inquiries } = loadWithMail();
  ctx.doPost({ parameter: INQUIRY });
  assert.deepEqual(tabs.map(t => t.name), ['Waitlist', 'Inquiries']);
  assert.equal(inquiries()[0][0], 'Sent at');
  assert.equal(inquiries().length, 2);
});

test('the same email asking twice: two rows, two emails', () => {
  const { ctx, inquiries, mails } = loadWithMail();
  ctx.setup();
  ctx.doPost({ parameter: INQUIRY });
  ctx.doPost({ parameter: { ...INQUIRY, message: 'One more question' } });
  assert.equal(inquiries().length, 3);
  assert.equal(mails.length, 2);
});

test('a plain post of an inquiry (no JavaScript) gets a page that says it was sent, or what to check', () => {
  const { ctx, inquiries } = loadWithMail();
  ctx.setup();
  const { js, ...plain } = INQUIRY;
  const ok = ctx.doPost({ parameter: plain });
  assert.match(ok.html, /Inquiry sent/);
  assert.doesNotMatch(ok.html, /waitlist/);
  const bad = ctx.doPost({ parameter: { ...plain, message: '' } });
  assert.match(bad.html, /didn.t go through/i);
  assert.match(bad.html, /name, email and question/);
  assert.equal(inquiries().length, 2);
});

test('an inquiry missing its question answers which field (js=1)', () => {
  const { ctx } = loadWithMail();
  ctx.setup();
  assert.deepEqual(JSON.parse(ctx.doPost({ parameter: { ...INQUIRY, message: ' ' } }).text), { ok: false, error: 'message' });
});

test('inquiries and joins share the minute\'s limit', () => {
  const { ctx } = loadWithMail();
  ctx.setup();
  for (let i = 0; i < 60; i++) ctx.doPost({ parameter: { js: '1', email: `p${i}@b.co`, company: 'Acme' } });
  assert.deepEqual(JSON.parse(ctx.doPost({ parameter: INQUIRY }).text), { ok: false, error: 'busy' });
});

// Heura Asteria's page (/asteria/, Nov 24, 2026) joins without an account through the same doPost: what they said
// about a GPU and what they'd train rides in "use", which a join keeps (the sheet's What they will specialize), and
// with no name it is a join, not a request: no email to the founders.
test('an Asteria join keeps its note in What they will specialize and emails no one', () => {
  const { ctx, cells, mails } = loadWithMail();
  ctx.setup();
  const out = ctx.doPost({ parameter: { email: 'Dana@Acme.com', company: 'Acme', from: '/asteria/', gpu: 'need', train: 'x',
    use: 'Asteria waitlist. GPU: needs one from us. Would train: a help desk agent', js: '1' } });
  assert.deepEqual(JSON.parse(out.text), { ok: true });
  const row = cells[1];
  assert.deepEqual(Array.from(row.slice(1)), ['dana@acme.com', 'Acme', '/asteria/', '', '', 'Asteria waitlist. GPU: needs one from us. Would train: a help desk agent']);
  assert.equal(mails.length, 0);
  assert.equal(row.length, 7, 'the extra fields (gpu, train) add no columns');
});

// ---- QOL suggestions (Nov 27, 2026): the footer's box posts kind=suggestion. Each goes on the Suggestions tab and is
// emailed to contact@heurastudios.com; the email address is optional, and without one there's no reply-to at all.
const SUGGESTION = { js: '1', kind: 'suggestion', suggestion: 'Let me rename a notebook from its card', email: 'Ann@Acme.co',
  from: '/tools/' };

test('a suggestion (js=1) answers JSON, goes on the Suggestions tab and emails contact@, never the waitlist or inquiries', () => {
  const { ctx, cells, inquiries, suggestions, mails } = loadWithMail();
  ctx.setup();
  const out = ctx.doPost({ parameter: SUGGESTION });
  assert.equal(out.mime, 'json');
  assert.deepEqual(JSON.parse(out.text), { ok: true });
  assert.equal(cells.length, 1, 'nothing on the waitlist tab');
  assert.equal(inquiries().length, 1, 'nothing on the Inquiries tab');
  assert.equal(suggestions().length, 2);
  assert.deepEqual(Array.from(suggestions()[1]).slice(1), ['Let me rename a notebook from its card', 'ann@acme.co', '/tools/']);
  assert.equal(mails.length, 1);
  const m = mails[0];
  assert.equal(m.to, 'contact@heurastudios.com');
  assert.equal(m.replyTo, 'ann@acme.co');
  assert.equal(m.name, 'Heura Studios');
  assert.equal(m.subject, 'QOL suggestion: Let me rename a notebook from its card');
  assert.match(m.body, /on its Suggestions tab: https:\/\/docs\.google\.com\/spreadsheets\/d\/x\/edit/);
});

test('a suggestion without an email address goes too, and its email has no reply-to at all', () => {
  const { ctx, suggestions, mails } = loadWithMail();
  ctx.setup();
  assert.deepEqual(JSON.parse(ctx.doPost({ parameter: { ...SUGGESTION, email: '' } }).text), { ok: true });
  assert.equal(suggestions()[1][2], '');
  assert.equal(mails.length, 1);
  assert.equal('replyTo' in mails[0], false, 'MailApp is never handed an empty reply-to');
  assert.match(mails[0].body, /They left no email, so there is no one to reply to\./);
});

test('the request and inquiry emails still carry their reply-to', () => {
  const { ctx, mails } = loadWithMail();
  ctx.setup();
  ctx.doPost({ parameter: { js: '1', kind: 'inquiry', name: 'Ann', email: 'Ann@Acme.co', message: 'Hi', from: '/' } });
  ctx.doPost({ parameter: { js: '1', kind: 'request', email: 'bo@b.co', company: 'B', name: 'Bo' } });
  assert.deepEqual(mails.map(m => m.replyTo), ['ann@acme.co', 'bo@b.co']);
});

test('the first suggestion makes the Suggestions tab if setup has not run since', () => {
  const { ctx, tabs, suggestions } = loadWithMail();
  ctx.doPost({ parameter: SUGGESTION });
  assert.deepEqual(tabs.map(t => t.name), ['Waitlist', 'Suggestions']);
  assert.equal(suggestions()[0][0], 'Sent at');
  assert.equal(suggestions().length, 2);
});

test('a plain post of a suggestion (no JavaScript) gets a page that says it was sent, or what to check', () => {
  const { ctx, suggestions } = loadWithMail();
  ctx.setup();
  const { js, ...plain } = SUGGESTION;
  const ok = ctx.doPost({ parameter: plain });
  assert.match(ok.html, /Suggestion sent/);
  assert.match(ok.html, /The team reads every one/);
  assert.doesNotMatch(ok.html, /waitlist|founder/i);
  const bad = ctx.doPost({ parameter: { ...plain, suggestion: ' ' } });
  assert.match(bad.html, /didn.t go through/i);
  assert.match(bad.html, /check your suggestion/);
  assert.equal(suggestions().length, 2);
});

test('a suggestion missing its text, or with an email that is not one, answers which field (js=1)', () => {
  const { ctx, mails } = loadWithMail();
  ctx.setup();
  assert.deepEqual(JSON.parse(ctx.doPost({ parameter: { ...SUGGESTION, suggestion: '' } }).text), { ok: false, error: 'suggestion' });
  assert.deepEqual(JSON.parse(ctx.doPost({ parameter: { ...SUGGESTION, email: 'ann@' } }).text), { ok: false, error: 'email' });
  assert.equal(mails.length, 0);
});

test('suggestions share the minute\'s limit with joins and inquiries', () => {
  const { ctx } = loadWithMail();
  ctx.setup();
  for (let i = 0; i < 60; i++) ctx.doPost({ parameter: { js: '1', email: `p${i}@b.co`, company: 'Acme' } });
  assert.deepEqual(JSON.parse(ctx.doPost({ parameter: SUGGESTION }).text), { ok: false, error: 'busy' });
});

test('when MailApp fails, the suggestion is still saved and the answer is still ok', () => {
  const { ctx, suggestions, mails } = loadWithMail({ fails: true });
  ctx.setup();
  const quiet = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.join(' '));
  try {
    assert.deepEqual(JSON.parse(ctx.doPost({ parameter: SUGGESTION }).text), { ok: true });
  } finally {
    console.error = quiet;
  }
  assert.equal(suggestions().length, 2);
  assert.equal(mails.length, 0);
  assert.ok(logged.some(l => /email about it failed/.test(l)), logged.join('\n'));
});
