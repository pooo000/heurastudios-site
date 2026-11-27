/** @OnlyCurrentDoc */
// Google Apps Script entry points for the site's forms: the waitlist page's joins, the home page's inquiries
// (kind=inquiry; until Nov 18, 2026 the home page sent requests for access, kind=request, which still work) and the
// footer's QOL suggestions (kind=suggestion, since Nov 27, 2026). Bound to the "Heura waitlist" sheet; @OnlyCurrentDoc
// limits its sheet permissions to that one spreadsheet. Joins go on its first tab, inquiries on its Inquiries tab and
// suggestions on its Suggestions tab (setup() makes both). Each new request for access and every inquiry is also
// emailed to the founders, and every suggestion to contact@heurastudios.com (MailApp, sent as the account the web app
// runs as). The logic is in core.js (paste it in as a second script file named "core"); this file wires it to the
// sheet and to MailApp.
//
// First deploy: run setup(), then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone),
//   and put the /exec URL in form_endpoint in _config.yml.
// Ship a change: paste, run setup() (adds any missing header cell, and the Inquiries and Suggestions tabs), then
//   Deploy > Manage deployments > Edit > Version: New version (keeps the same /exec URL).

var JOINS_PER_MINUTE = 60;   // rate limit: more new rows than this in a minute are turned away (bot floods)
var INQUIRIES = 'Inquiries';   // the tab inquiries go on
var SUGGESTIONS = 'Suggestions';   // the tab the footer's QOL suggestions go on

function sheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

// A tab of its own (Inquiries, Suggestions), made (last, so the waitlist stays the first tab) with its header if it
// isn't there yet.
function tab_(name, names) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(name);
  if (sheet) return sheet;
  sheet = book.insertSheet(name, book.getSheets().length);
  header_(sheet, names);
  return sheet;
}

function inquirySheet_() {
  return tab_(INQUIRIES, INQUIRY_HEADER);
}

function suggestionSheet_() {
  return tab_(SUGGESTIONS, SUGGESTION_HEADER);
}

// Fills in any missing header cell and freezes the header row. Rows below it are never touched.
function header_(sheet, names) {
  var have = sheet.getRange(1, 1, 1, names.length).getValues()[0];
  for (var c = 0; c < names.length; c++) {
    if (!have[c]) sheet.getRange(1, c + 1).setValue(names[c]).setFontWeight('bold');
  }
  sheet.setFrozenRows(1);
}

// The waitlist's header, and the Inquiries and Suggestions tabs with their own.
function setup() {
  header_(sheet_(), WAITLIST_HEADER);
  header_(inquirySheet_(), INQUIRY_HEADER);
  header_(suggestionSheet_(), SUGGESTION_HEADER);
}

function deps_() {
  var sheet = sheet_();
  return {
    rows: function () {
      var last = sheet.getLastRow();
      return last < 2 ? [] : sheet.getRange(2, 1, last - 1, WAITLIST_HEADER.length).getValues();
    },
    append: function (row) {
      sheet.appendRow(row);
    },
    appendInquiry: function (row) {   // one row per inquiry, on the Inquiries tab
      inquirySheet_().appendRow(row);
    },
    appendSuggestion: function (row) {   // one row per suggestion, on the Suggestions tab
      suggestionSheet_().appendRow(row);
    },
    fill: function (i, cells) {   // row i below the header: its Name, Role and What they will specialize
      sheet.getRange(i + 2, 5, 1, cells.length).setValues([cells]);
    },
    now: function () {
      return new Date();
    },
    withLock: function (fn) {
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        return fn();
      } finally {
        SpreadsheetApp.flush();   // the next request sees this one's row
        lock.releaseLock();
      }
    },
    // the email about one request, inquiry or suggestion (core.js requestEmail, inquiryEmail, suggestionEmail); a
    // suggestion without an email address has no reply-to
    notify: function (mail) {
      var message = { to: mail.to, subject: mail.subject, body: mail.body, name: 'Heura Studios' };
      if (mail.replyTo) message.replyTo = mail.replyTo;
      MailApp.sendEmail(message);
    },
    sheetUrl: function () {
      return SpreadsheetApp.getActiveSpreadsheet().getUrl();
    },
    warn: function (err) {
      console.error('The email about it failed (its row is saved): ' + err);
    },
    busy: function () {
      var cache = CacheService.getScriptCache();
      var key = 'joins-' + Math.floor(Date.now() / 60000);
      var n = Number(cache.get(key) || 0) + 1;
      cache.put(key, String(n), 120);
      return n > JOINS_PER_MINUTE;
    },
  };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function page_(title, body) {
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><div style="font:17px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;' +
    'max-width:34em;margin:12vh auto;padding:0 20px;color:#000">' + body + '</div>')
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Every form posts here. With js=1 (form.js) the answer is JSON; without JavaScript the browser posts the form
// itself, so the answer is a plain page.
function doPost(e) {
  var p = (e && e.parameter) || {};
  var inquiry = p.kind === 'inquiry';   // the home page's inquiry form
  var suggestion = p.kind === 'suggestion';   // the footer's QOL suggestions
  var result;
  try {
    result = inquiry ? handleInquiry(p, deps_()) : suggestion ? handleSuggestion(p, deps_()) : handleJoin(p, deps_());
  } catch (err) {
    console.error(err);
    result = { ok: false, error: 'server' };
  }
  if (p.js === '1') return json_(result);
  if (!result.ok) {
    return page_('Something went wrong', inquiry
      ? "<h1>That didn't go through.</h1><p>Go back, check your name, email and question, and try again.</p>"
      : suggestion
        ? "<h1>That didn't go through.</h1><p>Go back, check your suggestion (and your email, if you gave one), and try again.</p>"
        : "<h1>That didn't go through.</h1><p>Go back, check your work email and company, and try again.</p>");
  }
  if (inquiry) {
    return page_('Inquiry sent', '<h1>Inquiry sent.</h1><p>A founder will reply by email.</p>' +
      '<p><a href="https://heurastudios.com">Back to heurastudios.com</a></p>');
  }
  if (suggestion) {
    return page_('Suggestion sent', '<h1>Suggestion sent.</h1><p>Thanks. The team reads every one.</p>' +
      '<p><a href="https://heurastudios.com">Back to heurastudios.com</a></p>');
  }
  return p.kind === 'request'   // the home page's Request access form, until Nov 18, 2026
    ? page_('Request sent', '<h1>Request sent.</h1><p>A founder will reply by email.</p>' +
      '<p><a href="https://heurastudios.com">Back to heurastudios.com</a></p>')
    : page_("You're on the waitlist", "<h1>You're on the waitlist.</h1><p>We'll email you when the Heura Studio beta opens.</p>" +
      '<p><a href="https://heurastudios.com">Back to heurastudios.com</a></p>');
}

// (inquiries, suggestions: this version takes the home page's inquiries and the footer's suggestions, so a look at the
// address says whether it's deployed)
function doGet() {
  return json_({ ok: true, service: 'Heura waitlist', inquiries: true, suggestions: true });
}
