'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../../public/js/contact-email.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
const action = html.match(/id="contact-form" action="([^"]+)"/)[1];

function harness({ failHandoff = false } = {}) {
  const elements = {}, calls = [], listeners = {};
  let focused = null;
  function element(id, value = '', type = 'text', maxLength = -1) {
    return (elements[id] = {
      value, type, maxLength, hidden: true, textContent: '', attributes: {},
      setAttribute(key, text) { this.attributes[key] = text; },
      removeAttribute(key) { delete this[key]; },
      focus() { focused = id; }
    });
  }
  const form = element('contact-form');
  form.getAttribute = key => key === 'action' ? action : null;
  form.addEventListener = (type, handler) => { listeners[type] = handler; };
  form.reset = () => { throw new Error('Draft handoff must preserve form values'); };
  element('f-name', 'Sample Visitor', 'text', 120);
  element('f-email', 'visitor@example.org', 'email', 254);
  element('f-msg', 'A brand identity inquiry.', 'textarea', 4000);
  element('f-service', 'Branding');
  element('f-budget', '$5k to $15k');
  ['f-name-err', 'f-email-err', 'f-msg-err', 'form-status', 'email-fallback', 'email-draft-link', 'email-draft-text'].forEach(id => element(id));
  vm.runInNewContext(script, {
    URL,
    document: { getElementById: id => elements[id] },
    window: { location: { assign(uri) { calls.push(uri); if (failHandoff) throw new Error('No email handler'); } } }
  });
  return { elements, calls, listeners, focused: () => focused, submit() {
    let prevented = false;
    listeners.submit({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  } };
}

describe('contact email draft handoff', () => {
  it('routes the actual form to the studio, with native email fallback', () => {
    assert.equal(new URL(action).pathname, 'syphersolutions@gmail.com');
    assert.match(html, /id="contact-form"[^>]+method="post"[^>]+enctype="text\/plain"/);
    assert.ok(!html.includes('hello@sypher.example'));
    const h = harness(); h.submit();
    const uri = new URL(h.calls[0]);
    assert.equal(uri.protocol, 'mailto:');
    assert.equal(uri.pathname, 'syphersolutions@gmail.com');
    assert.match(uri.searchParams.get('body'), /Email: visitor@example.org/);
    assert.match(uri.searchParams.get('body'), /Service: Branding/);
    assert.match(uri.searchParams.get('body'), /Budget: \$5k to \$15k/);
  });

  it('encodes Unicode, special characters, and message lines without adding recipients', () => {
    const h = harness();
    h.elements['f-name'].value = 'José & Co.';
    h.elements['f-msg'].value = 'Design + web? Yes & more.\nBcc: unwanted@example.org\n絵文字 ✨';
    h.submit();
    const uri = new URL(h.calls[0]);
    assert.deepEqual([...uri.searchParams.keys()], ['subject', 'body']);
    assert.equal(uri.pathname, 'syphersolutions@gmail.com');
    assert.ok(!h.calls[0].includes('\n'));
    assert.match(uri.searchParams.get('body'), /José & Co\./);
    assert.ok(uri.searchParams.get('body').endsWith('Design + web? Yes & more.\r\nBcc: unwanted@example.org\r\n絵文字 ✨'));
  });

  it('blocks invalid fields before preparing or opening a draft', () => {
    const h = harness();
    h.elements['f-name'].value = '   ';
    h.elements['f-email'].value = 'invalid';
    h.elements['f-msg'].value = '';
    h.submit();
    assert.equal(h.calls.length, 0);
    assert.equal(h.elements['email-fallback'].hidden, true);
    assert.equal(h.focused(), 'f-name');
    ['f-name', 'f-email', 'f-msg'].forEach(id => assert.equal(h.elements[id].attributes['aria-invalid'], 'true'));
  });

  it('preserves the form and never reports an email as delivered', () => {
    const h = harness(); h.submit();
    assert.equal(h.elements['f-name'].value, 'Sample Visitor');
    assert.equal(h.elements['f-msg'].value, 'A brand identity inquiry.');
    assert.match(h.elements['form-status'].textContent, /Press Send in your email app/);
    assert.doesNotMatch(h.elements['form-status'].textContent, /message sent|successfully sent|delivered/i);
    assert.equal(h.elements['email-draft-link'].href, h.calls[0]);
    assert.equal(h.elements['email-fallback'].hidden, false);
  });

  it('removes the old draft when the visitor edits the form', () => {
    const h = harness(); h.submit(); h.listeners.input();
    assert.equal(h.elements['email-fallback'].hidden, true);
    assert.equal(h.elements['email-draft-text'].value, '');
    assert.equal(h.elements['email-draft-link'].href, undefined);
  });

  it('keeps a usable draft when the email app cannot open', () => {
    const h = harness({ failHandoff: true }); h.submit();
    assert.equal(h.elements['email-fallback'].hidden, false);
    assert.match(h.elements['email-draft-text'].value, /^To: syphersolutions@gmail.com/);
    assert.match(h.elements['form-status'].textContent, /could not be opened/);
  });

  it('keeps the whole allowed message and supplies optional-field defaults', () => {
    const h = harness();
    h.elements['f-service'].value = ''; h.elements['f-budget'].value = '';
    h.elements['f-msg'].value = 'a'.repeat(4000); h.submit();
    const uri = new URL(h.calls[0]);
    assert.ok(uri.searchParams.get('body').endsWith('a'.repeat(4000)));
    assert.match(uri.searchParams.get('body'), /Service: Not sure yet/);
    assert.match(uri.searchParams.get('body'), /Budget: Prefer not to say/);
    assert.equal(uri.searchParams.get('subject'), 'Project inquiry — Sypher');
  });
});
