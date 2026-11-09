// The forms' backend logic, free of Google services so it runs both in Apps Script (as the "core" script file)
// and in Node tests. Code.gs wires it to the sheet.

// Sheet columns. Name, Role and What they will specialize come only from Request access (a waitlist join leaves
// them blank). Add new columns at the end so existing rows keep their places.
var WAITLIST_HEADER = ['Joined at', 'Email', 'Company', 'Came from', 'Name', 'Role', 'What they will specialize'];
var LIMITS = { email: 254, company: 100, from: 200, name: 100, role: 100, use: 1000 };
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Every new request for access emails these four (Ryan, Nov 8, 2026), with the person who asked as the reply-to.
var FOUNDERS = ['ryan@heurastudios.com', 'william@heurastudios.com', 'tsun@heurastudios.com', 'ethan@heurastudios.com'];

// One line of plain text: control characters and runs of whitespace become single spaces.
function oneLine_(v) {
  return v == null ? '' : String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Sheets treats a cell that starts with = + - @ as a formula; a leading apostrophe keeps it as text.
function asText_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

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

if (typeof module !== 'undefined') {
  module.exports = { WAITLIST_HEADER: WAITLIST_HEADER, FOUNDERS: FOUNDERS, handleJoin: handleJoin, requestEmail: requestEmail };
}
