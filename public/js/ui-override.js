/* Override Control: Auto | High | Medium | Basic, with the High-on-BASIC confirmation. */
(function (S) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var group = $('override');
  var radios = Array.prototype.slice.call(group.querySelectorAll('input[name="mode"]'));
  var warn = $('override-warn'), resetBtn = $('override-reset'), rmNote = $('override-rm'), autoDesc = $('opt-auto-desc');
  var pointerPick = false, debounce = null, pendingFocus = null;

  function currentChoice() { return S.state.source === 'manual' ? S.state.mode : 'auto'; }

  function sync() {
    var choice = currentChoice();
    radios.forEach(function (r) { r.checked = r.value === choice; });
    resetBtn.hidden = S.state.source !== 'manual';
    rmNote.hidden = !(S.state.motion === 'reduced');
    var p = S.state.profile;
    autoDesc.textContent = p ? 'Chosen for this device: ' + p['class'] : 'Chosen for this device';
  }

  function apply(choice) {
    clearTimeout(debounce);
    if (choice === currentChoice()) { warn.hidden = true; return; }
    var result = S.controller.setOverride(choice);
    if (result === 'confirm') {
      pendingFocus = radios.filter(function (r) { return r.value === 'high'; })[0];
      warn.hidden = false;
      warn.focus();
      return;
    }
    warn.hidden = true;
    sync();
  }

  function cancelConfirm() {
    warn.hidden = true;
    sync();
    var r = radios.filter(function (x) { return x.checked; })[0];
    if (r) r.focus();
  }

  group.addEventListener('pointerdown', function () { pointerPick = true; });
  group.addEventListener('change', function (e) {
    if (e.target.name !== 'mode') return;
    var value = e.target.value;
    if (pointerPick) { pointerPick = false; apply(value); return; }
    clearTimeout(debounce);
    debounce = setTimeout(function () { apply(value); }, 400);
  });
  group.addEventListener('keydown', function (e) {
    if (e.target.name === 'mode' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      apply(e.target.value);
    }
  });

  $('warn-confirm').addEventListener('click', function () {
    warn.hidden = true;
    S.controller.setOverride('high', { confirmed: true });
    sync();
    if (pendingFocus) pendingFocus.focus();
  });
  $('warn-cancel').addEventListener('click', cancelConfirm);
  warn.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); cancelConfirm(); } });

  resetBtn.addEventListener('click', function () {
    apply('auto');
    var r = radios.filter(function (x) { return x.value === 'auto'; })[0];
    if (r) r.focus();
  });

  ['adaptive:ready', 'adaptive:modechange', 'adaptive:profileupdate'].forEach(function (ev) {
    document.addEventListener(ev, function () { if (warn.hidden) sync(); });
  });

  S.ui.override = { sync: sync };
})(window.Sypher);
