(function () {
  'use strict';
  var form = document.getElementById('contact-form');
  if (!form) return;
  var status = document.getElementById('form-status');
  var fallback = document.getElementById('email-fallback');
  var draftLink = document.getElementById('email-draft-link');
  var draftText = document.getElementById('email-draft-text');
  var destination = new URL(form.getAttribute('action'));
  var recipient = destination.protocol === 'mailto:' ? destination.pathname : '';
  // Native required/email validation remains available when JavaScript is off.
  form.noValidate = true;

  function feedback(message, tone) {
    status.textContent = message;
    status.setAttribute('data-tone', tone || 'info');
  }
  function clearDraft() {
    fallback.hidden = true;
    draftText.value = '';
    draftLink.removeAttribute('href');
    feedback('');
  }
  function field(id) { return document.getElementById(id); }
  function value(id) { return field(id).value.replace(/\0/g, '').trim(); }
  function validate() {
    var first = null;
    [['f-name', 'Please enter your name.'], ['f-email', 'Please enter a valid email address.'], ['f-msg', 'Please tell us a little about your project.']].forEach(function (pair) {
      var input = field(pair[0]);
      var text = value(pair[0]);
      var valid = Boolean(text) && text.length <= input.maxLength;
      if (input.type === 'email') valid = valid && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
      field(pair[0] + '-err').textContent = valid ? '' : pair[1];
      input.setAttribute('aria-invalid', String(!valid));
      if (!valid && !first) first = input;
    });
    if (first) first.focus();
    return !first;
  }
  form.addEventListener('input', clearDraft);
  form.addEventListener('change', clearDraft);
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearDraft();
    if (!validate()) { feedback('Please correct the highlighted fields.', 'error'); return; }
    if (!/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(recipient)) {
      feedback('The studio email address is unavailable. Please try the contact email link.', 'error');
      return;
    }
    var service = value('f-service') || 'Not sure yet';
    var subject = 'Project inquiry — Sypher' + (value('f-service') ? ' / ' + service : '');
    var body = [
      'Hello Sypher Creative Solutions,', '',
      'Name: ' + value('f-name'),
      'Email: ' + value('f-email'),
      'Service: ' + service,
      'Budget: ' + (value('f-budget') || 'Prefer not to say'),
      '', 'Message:', value('f-msg')
    ].join('\n').replace(/\r\n|\r|\n/g, '\r\n');
    var uri = 'mailto:' + recipient + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    draftLink.href = uri;
    draftText.value = 'To: ' + recipient + '\nSubject: ' + subject + '\n\n' + body;
    fallback.hidden = false;
    feedback('Your email draft is ready for ' + recipient + '. Press Send in your email app to complete your message. If it didn’t open, use the draft link or copy your message below.');
    // A mailto handoff cannot confirm delivery, so the form is deliberately preserved.
    try { window.location.assign(uri); }
    catch (error) { feedback('Your email app could not be opened. Use the draft link below, or copy your message and email it to ' + recipient + '.'); }
  });
})();
