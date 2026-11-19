const test = require('node:test');
const assert = require('node:assert/strict');
const { handleJoin, WAITLIST_HEADER } = require('../core.js');

// A stand-in for the sheet: rows below the header, in the header's column order.
function fakeDeps(rows = [], opts = {}) {
  const appended = [];
  const filled = [];   // [row index below the header, [Name, Role, What they will specialize]]
  return {
    appended,
    filled,
    deps: {
      rows: () => rows.concat(appended),
      append: row => appended.push(row),
      fill: (i, cells) => filled.push([i, cells]),
      now: () => new Date('2026-10-12T07:00:00Z'),
      withLock: fn => fn(),
      busy: () => !!opts.busy,
    },
  };
}

test('the sheet has the columns the founders read', () => {
  assert.deepEqual(WAITLIST_HEADER, ['Joined at', 'Email', 'Company', 'Came from', 'Name', 'Role', 'What they will specialize']);
});

test('a new person is added with the time, their email in lowercase, the company and where they came from', () => {
  const { deps, appended } = fakeDeps();
  const r = handleJoin({ email: '  Ann@Acme.CO ', company: ' Acme Inc ', from: '/waitlist/?utm_source=x' }, deps);
  assert.deepEqual(r, { ok: true });
  assert.equal(appended.length, 1);
  assert.deepEqual(appended[0], [new Date('2026-10-12T07:00:00Z'), 'ann@acme.co', 'Acme Inc', '/waitlist/?utm_source=x', '', '', '']);
});

test('a request for access keeps the name, the role and what they will specialize', () => {
  const { deps, appended } = fakeDeps();
  const r = handleJoin({ email: 'ann@acme.co', company: 'Acme', from: '/', name: ' Ann Lee ', role: 'Head of ML',
    use: 'A support agent\nfor billing questions' }, deps);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(appended[0].slice(4), ['Ann Lee', 'Head of ML', 'A support agent for billing questions']);
});

// Someone who joined the waitlist and now asks for access: the founders need the request's name, role and what they
// will specialize, so those go on the row that email already has (one row per email), and the answer is a plain ok.
test('someone on the waitlist who then requests access gets the request on their row, and a plain ok', () => {
  const joined = [new Date('2026-10-01T00:00:00Z'), 'ann@acme.co', 'Acme', '/waitlist/', '', '', ''];
  const { deps, appended, filled } = fakeDeps([joined]);
  const r = handleJoin({ email: ' Ann@Acme.co', company: 'Acme Inc', from: '/', name: 'Ann Lee', role: '=Head of ML',
    use: 'A support agent\nfor billing' }, deps);
  assert.deepEqual(r, { ok: true });
  assert.equal(appended.length, 0, 'still one row per email');
  assert.deepEqual(filled, [[0, ['Ann Lee', "'=Head of ML", 'A support agent for billing']]]);
});

test('asking for access again keeps the first request and says so', () => {
  const asked = [new Date('2026-10-01T00:00:00Z'), 'ann@acme.co', 'Acme', '/', 'Ann Lee', 'Head of ML', 'A support agent'];
  const { deps, appended, filled } = fakeDeps([asked]);
  const r = handleJoin({ email: 'ann@acme.co', company: 'Acme', from: '/', name: 'Ann', role: 'CTO', use: 'Other' }, deps);
  assert.deepEqual(r, { ok: true, already: true });
  assert.equal(appended.length + filled.length, 0);
});

test('a name over 100 characters is refused; the role and what they will specialize are capped', () => {
  const { deps, appended } = fakeDeps();
  assert.deepEqual(handleJoin({ email: 'a@b.co', company: 'Acme', name: 'x'.repeat(101) }, deps), { ok: false, error: 'name' });
  assert.equal(appended.length, 0);
  handleJoin({ email: 'a@b.co', company: 'Acme', name: 'x'.repeat(100), role: 'r'.repeat(300), use: 'u'.repeat(3000) }, deps);
  assert.deepEqual(appended[0].slice(4).map(v => v.length), [100, 100, 1000]);
});

test('joining twice with the same email (any case) keeps one row and still says ok', () => {
  const { deps, appended } = fakeDeps([[new Date(), 'ann@acme.co', 'Acme', '/']]);
  assert.deepEqual(handleJoin({ email: 'ANN@acme.co', company: 'Acme' }, deps), { ok: true, already: true });
  assert.equal(appended.length, 0);
});

test('an email that does not look like one is refused', () => {
  const { deps, appended } = fakeDeps();
  for (const email of ['', 'ann', 'ann@acme', 'a b@acme.co', 'x'.repeat(250) + '@a.co']) {
    assert.deepEqual(handleJoin({ email, company: 'Acme' }, deps), { ok: false, error: 'email' }, email);
  }
  assert.equal(appended.length, 0);
});

test('the company is required and at most 100 characters', () => {
  const { deps, appended } = fakeDeps();
  assert.deepEqual(handleJoin({ email: 'a@b.co', company: '   ' }, deps), { ok: false, error: 'company' });
  assert.deepEqual(handleJoin({ email: 'a@b.co', company: 'x'.repeat(101) }, deps), { ok: false, error: 'company' });
  assert.deepEqual(handleJoin({ email: 'a@b.co', company: 'x'.repeat(100) }, deps), { ok: true });
  assert.equal(appended.length, 1);
});

test('a bot that fills the hidden field is told ok but nothing is saved', () => {
  const { deps, appended } = fakeDeps();
  assert.deepEqual(handleJoin({ email: 'bot@spam.co', company: 'Spam', website: 'http://spam' }, deps), { ok: true });
  assert.equal(appended.length, 0);
});

test('text that Sheets would run as a formula is stored as plain text', () => {
  const { deps, appended } = fakeDeps();
  handleJoin({ email: 'a@b.co', company: '=HYPERLINK("http://x","y")', from: '+1', name: '@me', role: '-1', use: '=2+2' }, deps);
  assert.equal(appended[0][2], '\'=HYPERLINK("http://x","y")');
  assert.equal(appended[0][3], "'+1");
  assert.deepEqual(appended[0].slice(4), ["'@me", "'-1", "'=2+2"]);
});

test('line breaks and control characters are flattened, and where they came from is capped', () => {
  const { deps, appended } = fakeDeps();
  handleJoin({ email: 'a@b.co', company: 'Acme\n\tInc\u0000', from: '/' + 'p'.repeat(400) }, deps);
  assert.equal(appended[0][2], 'Acme Inc');
  assert.equal(appended[0][3].length, 200);
});

test('when a flood of joins arrives, new ones are turned away for the minute', () => {
  const { deps, appended } = fakeDeps([], { busy: true });
  assert.deepEqual(handleJoin({ email: 'a@b.co', company: 'Acme' }, deps), { ok: false, error: 'busy' });
  assert.equal(appended.length, 0);
});

test('the duplicate check and the write happen under the lock', () => {
  const { deps } = fakeDeps();
  let inside = false;
  const seen = [];
  deps.withLock = fn => { inside = true; try { return fn(); } finally { inside = false; } };
  const rows = deps.rows;
  deps.rows = () => { seen.push(['rows', inside]); return rows(); };
  const append = deps.append;
  deps.append = row => { seen.push(['append', inside]); append(row); };
  handleJoin({ email: 'a@b.co', company: 'Acme' }, deps);
  assert.deepEqual(seen, [['rows', true], ['append', true]]);
});

// Every new request for access emails the four founders (Ryan, Nov 8, 2026: the new @heurastudios.com addresses),
// with the person who asked as the reply-to, so a founder can answer straight from the email.
const { FOUNDERS } = require('../core.js');
function withMail(rows = [], opts = {}) {
  const f = fakeDeps(rows, opts);
  f.sent = [];
  f.order = [];
  f.deps.notify = m => { f.order.push('notify'); if (opts.mailFails) throw new Error('quota'); f.sent.push(m); };
  const append = f.deps.append;
  f.deps.append = row => { f.order.push('append'); append(row); };
  return f;
}

test('the founders are the four new heurastudios.com addresses', () => {
  assert.deepEqual(FOUNDERS, ['ryan@heurastudios.com', 'william@heurastudios.com', 'tsun@heurastudios.com',
    'ethan@heurastudios.com']);
});

test('a new request for access emails the four founders, with a reply-to of the person who asked', () => {
  const { deps, sent } = withMail();
  const r = handleJoin({ email: 'Ann@Acme.co', company: 'Acme', from: '/', name: 'Ann Lee', role: 'Head of ML',
    use: 'A support agent\nfor billing questions' }, deps);
  assert.deepEqual(r, { ok: true });
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.equal(m.to, 'ryan@heurastudios.com,william@heurastudios.com,tsun@heurastudios.com,ethan@heurastudios.com');
  assert.equal(m.replyTo, 'ann@acme.co');
  assert.equal(m.subject, 'Request for access: Ann Lee, Acme');
  for (const line of ['Name: Ann Lee', 'Work email: ann@acme.co', 'Company: Acme', 'Role: Head of ML',
    'What they will specialize: A support agent for billing questions', 'Came from: /']) {
    assert.ok(m.body.includes(line), line);
  }
  assert.match(m.body, /Reply to this email to answer them\./);
});

test('someone on the waitlist who then asks for access: the founders get the email too', () => {
  const joined = [new Date('2026-10-01T00:00:00Z'), 'ann@acme.co', 'Acme', '/waitlist/', '', '', ''];
  const { deps, sent } = withMail([joined]);
  handleJoin({ email: 'ann@acme.co', company: 'Acme', from: '/', name: 'Ann Lee' }, deps);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, 'Request for access: Ann Lee, Acme');
  assert.ok(sent[0].body.includes('Role: (not given)'));
});

test('a waitlist join, asking again, a bot, a refused or a busy request email no one', () => {
  const asked = [new Date('2026-10-01T00:00:00Z'), 'ann@acme.co', 'Acme', '/', 'Ann Lee', '', ''];
  for (const [rows, p, opts] of [
    [[], { email: 'a@b.co', company: 'Acme', from: '/waitlist/' }, {}],
    [[asked], { email: 'ann@acme.co', company: 'Acme', name: 'Ann' }, {}],
    [[], { email: 'bot@spam.co', company: 'Spam', name: 'Bot', website: 'http://spam' }, {}],
    [[], { email: 'nope', company: 'Acme', name: 'Ann' }, {}],
    [[], { email: 'a@b.co', company: 'Acme', name: 'Ann' }, { busy: true }],
  ]) {
    const { deps, sent } = withMail(rows, opts);
    handleJoin(p, deps);
    assert.equal(sent.length, 0, JSON.stringify(p));
  }
});

test('the email goes out after the row is saved, outside the lock', () => {
  const f = withMail();
  let inside = false;
  f.deps.withLock = fn => { inside = true; try { return fn(); } finally { inside = false; } };
  const notify = f.deps.notify;
  f.deps.notify = m => { assert.equal(inside, false, 'not under the lock'); notify(m); };
  handleJoin({ email: 'a@b.co', company: 'Acme', name: 'Ann' }, f.deps);
  assert.deepEqual(f.order, ['append', 'notify']);
});

test('if the email fails, the request is still saved and the answer is still ok', () => {
  const { deps, appended, sent } = withMail([], { mailFails: true });
  const warned = [];
  deps.warn = e => warned.push(String(e));
  assert.deepEqual(handleJoin({ email: 'a@b.co', company: 'Acme', name: 'Ann' }, deps), { ok: true });
  assert.equal(appended.length, 1);
  assert.equal(sent.length, 0);
  assert.deepEqual(warned, ['Error: quota']);
});

test('the email shows what they typed as plain text: flattened, never escaped for the sheet', () => {
  const { deps, sent, appended } = withMail();
  handleJoin({ email: 'a@b.co', company: '=Acme', name: '@Ann\nLee', role: '-1', use: '=2+2' }, deps);
  assert.equal(appended[0][4], "'@Ann Lee", 'the sheet keeps its formula guard');
  assert.equal(sent[0].subject, 'Request for access: @Ann Lee, =Acme');
  assert.ok(sent[0].body.includes('Role: -1'));
  assert.ok(sent[0].body.includes('What they will specialize: =2+2'));
});

// ---- Inquiries (Ryan, Nov 18, 2026): the home page's form is for questions now that sign-up is open. Every one is
// kept, a row each on the Inquiries tab, and emailed to the founders, however many times the same person writes.
const { handleInquiry, inquiryEmail, INQUIRY_HEADER } = require('../core.js');
function inquiryDeps(opts = {}) {
  const rows = [];
  const sent = [];
  const order = [];
  return {
    rows,
    sent,
    order,
    deps: {
      appendInquiry: row => { order.push('append'); rows.push(row); },
      now: () => new Date('2026-11-18T23:00:00Z'),
      withLock: fn => fn(),
      busy: () => !!opts.busy,
      notify: m => { order.push('notify'); if (opts.mailFails) throw new Error('quota'); sent.push(m); },
      sheetUrl: () => 'https://docs.google.com/spreadsheets/d/x/edit',
    },
  };
}
const ASK = { name: ' Ann Lee ', email: ' Ann@Acme.CO ', company: ' Acme ', role: 'Head of ML', message: 'Do you train on our data?', from: '/' };

test('the Inquiries tab has the columns the founders read', () => {
  assert.deepEqual(INQUIRY_HEADER, ['Sent at', 'Email', 'Name', 'Company', 'Role', 'Question', 'Came from']);
});

test('an inquiry is saved with the time, the email in lowercase, the name, company, role, question and where it came from', () => {
  const { deps, rows } = inquiryDeps();
  assert.deepEqual(handleInquiry(ASK, deps), { ok: true });
  assert.deepEqual(rows, [[new Date('2026-11-18T23:00:00Z'), 'ann@acme.co', 'Ann Lee', 'Acme', 'Head of ML',
    'Do you train on our data?', '/']]);
});

test('the same person asking again is a new row and a new email every time', () => {
  const { deps, rows, sent } = inquiryDeps();
  handleInquiry(ASK, deps);
  assert.deepEqual(handleInquiry({ ...ASK, message: 'And what does the Studio plan include?' }, deps), { ok: true });
  assert.equal(rows.length, 2);
  assert.equal(sent.length, 2);
  assert.match(sent[1].body, /And what does the Studio plan include\?/);
});

test('an inquiry emails the four founders, with the person who asked as the reply-to and their question as they wrote it', () => {
  const { deps, sent } = inquiryDeps();
  handleInquiry({ ...ASK, message: 'Two things:\r\n\r\n\r\n1. Pricing\n2.   Exports  ' }, deps);
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.equal(m.to, 'ryan@heurastudios.com,william@heurastudios.com,tsun@heurastudios.com,ethan@heurastudios.com');
  assert.equal(m.replyTo, 'ann@acme.co');
  assert.equal(m.subject, 'Inquiry: Ann Lee, Acme');
  for (const line of ['Ann Lee sent an inquiry from heurastudios.com.', 'Name: Ann Lee', 'Email: ann@acme.co',
    'Company: Acme', 'Role: Head of ML', 'Came from: /']) {
    assert.ok(m.body.split('\n').includes(line), line);
  }
  assert.ok(m.body.includes('Two things:\n\n1. Pricing\n2. Exports'), 'line breaks kept, one empty line at most');
  assert.match(m.body, /Reply to this email to answer them\. Every inquiry is in the sheet, on its Inquiries tab: https:\/\/docs\.google\.com/);
});

test('without a company or a role, the email says so and the subject is the name alone', () => {
  const { deps, sent, rows } = inquiryDeps();
  assert.deepEqual(handleInquiry({ name: 'Bo', email: 'bo@b.co', message: 'Hi' }, deps), { ok: true });
  assert.equal(sent[0].subject, 'Inquiry: Bo');
  assert.ok(sent[0].body.includes('Company: (not given)'));
  assert.ok(sent[0].body.includes('Role: (not given)'));
  assert.deepEqual(rows[0].slice(3, 5), ['', '']);
});

test('a name, an email and a question are needed; the name and company at most 100 characters, the question 2,000', () => {
  const { deps, rows, sent } = inquiryDeps();
  const refused = [
    [{ ...ASK, name: '  ' }, 'name'],
    [{ ...ASK, name: 'x'.repeat(101) }, 'name'],
    [{ ...ASK, email: 'ann' }, 'email'],
    [{ ...ASK, email: '' }, 'email'],
    [{ ...ASK, company: 'x'.repeat(101) }, 'company'],
    [{ ...ASK, message: ' \n ' }, 'message'],
    [{ ...ASK, message: 'q'.repeat(2001) }, 'message'],
  ];
  for (const [p, error] of refused) assert.deepEqual(handleInquiry(p, deps), { ok: false, error }, JSON.stringify(p).slice(0, 80));
  assert.equal(rows.length + sent.length, 0);
  assert.deepEqual(handleInquiry({ ...ASK, name: 'x'.repeat(100), company: 'c'.repeat(100), message: 'q'.repeat(2000) }, deps), { ok: true });
  // a browser posting the form without JavaScript sends its line breaks as CRLF: they count once
  assert.deepEqual(handleInquiry({ ...ASK, message: ('q'.repeat(99) + '\r\n').repeat(20).trim() }, deps), { ok: true });
});

test('the role and where it came from are capped', () => {
  const { deps, rows } = inquiryDeps();
  handleInquiry({ ...ASK, role: 'r'.repeat(300), from: '/' + 'p'.repeat(400) }, deps);
  assert.equal(rows[0][4].length, 100);
  assert.equal(rows[0][6].length, 200);
});

test('a bot that fills the hidden field is told ok, and nothing is saved or sent', () => {
  const { deps, rows, sent } = inquiryDeps();
  assert.deepEqual(handleInquiry({ ...ASK, website: 'http://spam' }, deps), { ok: true });
  assert.equal(rows.length + sent.length, 0);
});

test('in a flood, inquiries are turned away for the minute, and no one is emailed', () => {
  const { deps, rows, sent } = inquiryDeps({ busy: true });
  assert.deepEqual(handleInquiry(ASK, deps), { ok: false, error: 'busy' });
  assert.equal(rows.length + sent.length, 0);
});

test('in the sheet, text Sheets would run as a formula is plain text; the email has it as typed', () => {
  const { deps, rows, sent } = inquiryDeps();
  handleInquiry({ name: '@Ann', email: 'a@b.co', company: '=Acme', role: '-1', message: '=2+2', from: '+x' }, deps);
  assert.deepEqual(rows[0].slice(1), ['a@b.co', "'@Ann", "'=Acme", "'-1", "'=2+2", "'+x"]);
  assert.equal(sent[0].subject, 'Inquiry: @Ann, =Acme');
  assert.ok(sent[0].body.split('\n').includes('=2+2'));
});

test('the row is saved under the lock, and the email goes out after it, outside the lock', () => {
  const f = inquiryDeps();
  let inside = false;
  const seen = [];
  f.deps.withLock = fn => { inside = true; try { return fn(); } finally { inside = false; } };
  const append = f.deps.appendInquiry, notify = f.deps.notify;
  f.deps.appendInquiry = row => { seen.push(['append', inside]); append(row); };
  f.deps.notify = m => { seen.push(['notify', inside]); notify(m); };
  handleInquiry(ASK, f.deps);
  assert.deepEqual(seen, [['append', true], ['notify', false]]);
});

test('if the email fails, the inquiry is still saved and the answer is still ok', () => {
  const { deps, rows, sent } = inquiryDeps({ mailFails: true });
  const warned = [];
  deps.warn = e => warned.push(String(e));
  assert.deepEqual(handleInquiry(ASK, deps), { ok: true });
  assert.equal(rows.length, 1);
  assert.equal(sent.length, 0);
  assert.deepEqual(warned, ['Error: quota']);
});

test('inquiryEmail on its own: a sheet link only when there is one', () => {
  const m = inquiryEmail({ name: 'Ann', email: 'a@b.co', company: '', role: '', message: 'Hi', from: '' }, '');
  assert.equal(m.subject, 'Inquiry: Ann');
  assert.ok(m.body.endsWith('Reply to this email to answer them.'));
  assert.ok(m.body.includes('Came from: (not given)'));
});
