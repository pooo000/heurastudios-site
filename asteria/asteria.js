// Heura Asteria's page (/asteria/): the form for joining the waitlist without an account (the shared form logic is in
// form.js; it posts to the Apps Script like the old waitlist). The Apps Script keeps a join's "use" (the sheet's What
// they will specialize column), so the GPU answer and what they'd train go there, after "Asteria waitlist": the
// founders find these rows by it, and by Came from /asteria/.
(function () {
  'use strict';
  var form = document.getElementById('as-form');
  if (!form || !window.ovForm) return;

  var GPU = { have: 'has a GPU', need: 'needs one from us', unsure: 'not sure' };
  function oneLine(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  // before form.js's own submit handler (listeners run in the order they were added): what goes in "use"
  form.addEventListener('submit', function () {
    var picked = form.querySelector('input[name="gpu"]:checked');
    var train = oneLine(form.elements.train.value);
    form.elements.use.value = 'Asteria waitlist. GPU: ' + (picked ? GPU[picked.value] : 'not said') +
      (train ? '. Would train: ' + train : '');
  });

  ovForm.setup({
    form: form,
    fields: ['email', 'company'],
    error: document.getElementById('as-error'),
    done: document.getElementById('as-done'),
    doneText: document.getElementById('as-done-text'),
    sendingLabel: 'Joining…',
    validate: function (v) {
      if (!ovForm.isEmail(v.email)) return ['Enter your email, like you@company.com.', 'email'];
      if (!v.company) return ['Enter your company, or the project you’d use Asteria for.', 'company'];
      if (v.company.length > 100) return ['Keep the company or project to 100 characters.', 'company'];
      if (!form.querySelector('input[name="gpu"]:checked')) {
        form.querySelector('input[name="gpu"]').focus();
        return ['Say whether you have a GPU.', null];
      }
    },
    serverErrors: {
      email: ['That email address doesn’t look right. Check it and try again.', 'email'],
      company: ['Check the company or project and try again.', 'company'],
      busy: ['Lots of people are joining right now. Try again in a minute.', null],
    },
    doneMessage: function (email, already) {
      return already
        ? email + ' is already on our list, so you’ll hear from us there when Asteria opens. Account holders get it first.'
        : 'We’ll email ' + email + ' when Asteria opens. Account holders get it first: make one any time to move up.';
    },
  });
})();
