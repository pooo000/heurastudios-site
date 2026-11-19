// The forms' backend logic, free of Google services so it runs both in Apps Script (as the "core" script file)
// and in Node tests. Code.gs wires it to the sheet.

// Sheet columns. Name, Role and What they will specialize come only from the old Request access form (a waitlist join
// leaves them blank). Add new columns at the end so existing rows keep their places.
var WAITLIST_HEADER = ['Joined at', 'Email', 'Company', 'Came from', 'Name', 'Role', 'What they will specialize'];
var LIMITS = { email: 254, company: 100, from: 200, name: 100, role: 100, use: 1000 };
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Every new request for access and every inquiry emails these four (Ryan, Nov 8, 2026), with the person who wrote as
// the reply-to.
var FOUNDERS = ['ryan@heurastudios.com', 'william@heurastudios.com', 'tsun@heurastudios.com', 'ethan@heurastudios.com'];

// One line of plain text: control characters and runs of whitespace become single spaces.
function oneLine_(v) {
  return v == null ? '' : String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Sheets treats a cell that starts with = + - @ as a formula; a leading apostrophe keeps it as text.
function asText_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// The waitlist page's joins, and requests for access from the old home page form (kind=request: name, role and use).
// p: the form's fields (email, company, from; name, role and use from Request access; website is the hidden field
// only bots fill).
// deps: rows(), append(row), fill(i, cells) (Name, Role and What they will specialize on row i below the header), now(),
// withLock(fn), busy(); and, to email the founders about each new request, notify(mail), sheetUrl() and warn(error)
// (an email that fails is only warned about: the request is already saved).
// -> {ok:true} | {ok:true, already:true} | {ok:false, error:'email'|'company'|'name'|'busy'}
function handleJoin(p, deps) {
  if (oneLine_(p.website) !== '') return { ok: true };
  var email = oneLine_(p.email).toLowerCase();
  var company = oneLine_(p.company);
  var from = oneLine_(p.from).slice(0, LIMITS.from);
  var name = oneLine_(p.name);
  var role = oneLine_(p.role).slice(0, LIMITS.role);
  var use = oneLine_(p.use).slice(0, LIMITS.use);
  if (!email || email.length > LIMITS.email || !EMAIL_RE.test(email)) return { ok: false, error: 'email' };
  if (!company || company.length > LIMITS.company) return { ok: false, error: 'company' };
  if (name.length > LIMITS.name) return { ok: false, error: 'name' };
  var asked = null;   // the request to email the founders about, once it's saved
  var result = deps.withLock(function () {
    var rows = deps.rows();
    var at = -1;
    for (var i = 0; i < rows.length; i++) {
      if (oneLine_(rows[i][1]).toLowerCase() === email) { at = i; break; }
    }
    // one row per email. Someone on the waitlist who now asks for access (a name, and none on their row yet): the
    // request goes on that row, so the founders see it
    var onTheirRow = at >= 0 && name !== '' && oneLine_(rows[at][4]) === '';
    if (at >= 0 && !onTheirRow) return { ok: true, already: true };
    if (deps.busy()) return { ok: false, error: 'busy' };
    if (onTheirRow) deps.fill(at, [asText_(name), asText_(role), asText_(use)]);
    else deps.append([deps.now(), asText_(email), asText_(company), asText_(from), asText_(name), asText_(role), asText_(use)]);
    if (name !== '') asked = { name: name, email: email, company: company, role: role, use: use, from: from };
    return { ok: true };
  });
  // outside the lock: sending takes a moment, and a failed email must not lose the saved request
  if (asked && deps.notify) {
    try {
      deps.notify(requestEmail(asked, deps.sheetUrl ? deps.sheetUrl() : ''));
    } catch (err) {
      if (deps.warn) deps.warn(err);
    }
  }
  return result;
}

// The founders' email about one request: plain text, each field as they typed it (on one line), never the sheet's
// formula guard. r: {name, email, company, role, use, from}.
function requestEmail(r, sheetUrl) {
  var none = '(not given)';
  return {
    to: FOUNDERS.join(','),
    replyTo: r.email,
    subject: 'Request for access: ' + r.name + ', ' + r.company,
    body: [
      r.name + ' asked for access to Heura Studios.',
      '',
      'Name: ' + r.name,
      'Work email: ' + r.email,
      'Company: ' + r.company,
      'Role: ' + (r.role || none),
      'What they will specialize: ' + (r.use || none),
      'Came from: ' + (r.from || none),
      '',
      'Reply to this email to answer them.' + (sheetUrl ? ' Every request is in the sheet: ' + sheetUrl : ''),
    ].join('\n'),
  };
}

// ---- Inquiries (Ryan, Nov 18, 2026: sign-up is open, and the home page's form is for questions: "if you want to ask a
// question, you don't have to email the founder itself ... you just inquire"). Every inquiry is kept, one row each on
// the sheet's Inquiries tab, and emailed to the founders with the person who asked as the reply-to, however many times
// the same email writes.
var INQUIRY_HEADER = ['Sent at', 'Email', 'Name', 'Company', 'Role', 'Question', 'Came from'];
var INQUIRY_LIMITS = { name: 100, email: 254, company: 100, role: 100, message: 2000, from: 200 };

// Text of several lines (a question): its line breaks kept (an empty line at most between two), every other control
// character and run of spaces one space, each line trimmed.
function lines_(v) {
  if (v == null) return '';
  return String(v).replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
    .split('\n').map(function (line) { return line.replace(/\s+/g, ' ').trim(); }).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

// p: the form's fields (name, email, company, role, message, from; website is the hidden field only bots fill).
// deps: appendInquiry(row) (a row on the Inquiries tab), now(), withLock(fn), busy(); and notify(mail), sheetUrl() and
// warn(error) as for handleJoin (an email that fails is only warned about: the inquiry is already saved).
// -> {ok:true} | {ok:false, error:'name'|'email'|'company'|'message'|'busy'}
function handleInquiry(p, deps) {
  if (oneLine_(p.website) !== '') return { ok: true };
  var name = oneLine_(p.name);
  var email = oneLine_(p.email).toLowerCase();
  var company = oneLine_(p.company);
  var role = oneLine_(p.role).slice(0, INQUIRY_LIMITS.role);
  var message = lines_(p.message);
  var from = oneLine_(p.from).slice(0, INQUIRY_LIMITS.from);
  if (!name || name.length > INQUIRY_LIMITS.name) return { ok: false, error: 'name' };
  if (!email || email.length > INQUIRY_LIMITS.email || !EMAIL_RE.test(email)) return { ok: false, error: 'email' };
  if (company.length > INQUIRY_LIMITS.company) return { ok: false, error: 'company' };
  if (!message || message.length > INQUIRY_LIMITS.message) return { ok: false, error: 'message' };
  var result = deps.withLock(function () {
    if (deps.busy()) return { ok: false, error: 'busy' };
    deps.appendInquiry([deps.now(), asText_(email), asText_(name), asText_(company), asText_(role), asText_(message),
      asText_(from)]);
    return { ok: true };
  });
  // outside the lock: sending takes a moment, and a failed email must not lose the saved inquiry
  if (result.ok && deps.notify) {
    try {
      deps.notify(inquiryEmail({ name: name, email: email, company: company, role: role, message: message, from: from },
        deps.sheetUrl ? deps.sheetUrl() : ''));
    } catch (err) {
      if (deps.warn) deps.warn(err);
    }
  }
  return result;
}

// The founders' email about one inquiry: plain text, as they typed it, never the sheet's formula guard.
// q: {name, email, company, role, message, from}.
function inquiryEmail(q, sheetUrl) {
  var none = '(not given)';
  return {
    to: FOUNDERS.join(','),
    replyTo: q.email,
    subject: 'Inquiry: ' + q.name + (q.company ? ', ' + q.company : ''),
    body: [
      q.name + ' sent an inquiry from heurastudios.com.',
      '',
      'Name: ' + q.name,
      'Email: ' + q.email,
      'Company: ' + (q.company || none),
      'Role: ' + (q.role || none),
      'Came from: ' + (q.from || none),
      '',
      q.message,
      '',
      'Reply to this email to answer them.' + (sheetUrl ? ' Every inquiry is in the sheet, on its Inquiries tab: ' + sheetUrl : ''),
    ].join('\n'),
  };
}

if (typeof module !== 'undefined') {
  module.exports = { WAITLIST_HEADER: WAITLIST_HEADER, FOUNDERS: FOUNDERS, handleJoin: handleJoin, requestEmail: requestEmail,
    INQUIRY_HEADER: INQUIRY_HEADER, handleInquiry: handleInquiry, inquiryEmail: inquiryEmail };
}
