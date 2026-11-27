// Every page: the footer's QOL suggestions box (_includes/footer.html; the shared form logic is in form.js). The
// suggestion grows as it's typed, up to its cap in site.css, then scrolls. "from" is the page it was sent from.
(function () {
  'use strict';
  var form = document.getElementById('ov-qol-form');
  if (!form || !window.ovForm) return;
  var text = form.elements.suggestion;

  // as tall as what's typed (its borders too: the box is border-box), between its CSS min-height and max-height
  function fit() {
    text.style.height = '';
    var edges = text.offsetHeight - text.clientHeight;
    text.style.height = (text.scrollHeight + edges) + 'px';
  }
  text.addEventListener('input', fit);
  form.addEventListener('reset', function () { setTimeout(fit, 0); });   // (the fields empty after the event)

  ovForm.setup({
    form: form,
    fields: ['suggestion', 'email'],
    error: document.getElementById('ov-qol-error'),
    done: document.getElementById('ov-qol-done'),
    doneText: document.getElementById('ov-qol-done-text'),
    again: document.getElementById('ov-qol-again'),
    sendingLabel: 'Sending…',
    from: function () { return location.pathname + location.search; },
    validate: function (v) {
      if (!v.suggestion) return ['Write your suggestion first.', 'suggestion'];
      if (v.email && !ovForm.isEmail(v.email)) return ['That email doesn’t look right. Fix it, or leave it empty.', 'email'];
    },
    serverErrors: {
      suggestion: ['Check your suggestion and try again. It can be up to 2,000 characters.', 'suggestion'],
      email: ['That email doesn’t look right. Fix it, or leave it empty.', 'email'],
    },
    doneMessage: function (email) {
      return email
        ? 'Thanks. The team reads every one, and writes to ' + email + ' if it has a question.'
        : 'Thanks. The team reads every one.';
    },
  });
})();
