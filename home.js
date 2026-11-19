// The home page: the screen recording, and the inquiry form.
(function () {
  'use strict';

  // ---- the recording (recording.js: plays while on screen, in the current appearance's files, Pause and Play)
  var video = document.querySelector('.hm-video');
  var toggle = document.querySelector('.hm-toggle');
  if (video && toggle && video.canPlayType && window.ovRecording) ovRecording(video, toggle);

  // ---- Inquiries (the shared form logic is in form.js)

  var form = document.getElementById('hm-form');
  if (!form || !window.ovForm) return;
  ovForm.setup({
    form: form,
    fields: ['name', 'email', 'company', 'role', 'message'],
    error: document.getElementById('hm-error'),
    done: document.getElementById('hm-done'),
    doneText: document.getElementById('hm-done-text'),
    sendingLabel: 'Sending…',
    validate: function (v) {
      if (!v.name) return ['Enter your name.', 'name'];
      if (!ovForm.isEmail(v.email)) return ['Enter your email, like you@company.com.', 'email'];
      if (!v.message) return ['Write your question.', 'message'];
    },
    serverErrors: {
      email: ['That email address doesn’t look right. Check it and try again.', 'email'],
      company: ['Check your company’s name and try again.', 'company'],
      name: ['Check your name and try again.', 'name'],
      message: ['Check your question and try again. It can be up to 2,000 characters.', 'message'],
    },
    doneMessage: function (email) {
      return 'A founder will reply to ' + email + '.';
    },
  });
})();
