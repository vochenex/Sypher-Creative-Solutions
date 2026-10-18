/* Performance Dashboard, Performance Chip, and footer "Display mode" link. */
(function (S) {
  'use strict';

  var C = S.copy;
  var $ = function (id) { return document.getElementById(id); };
  var panel = $('dashboard'), backdrop = $('dash-backdrop'), chip = $('perf-chip'), chipLabel = $('chip-label');
  var footerMode = $('footer-mode'), title = $('dash-title');
  var desktopQuery = null;
  try {
    if (window.matchMedia) desktopQuery = window.matchMedia('(min-width: 1024px)');
  } catch (e) {
    desktopQuery = null;
  }
  var opener = null, isOpen = false;
  var background = [$('main'), $('site-header'), document.querySelector('.site-footer'), chip];

  function modal() { return !(desktopQuery && desktopQuery.matches); }

  function setBackgroundInert(on) {
    background.forEach(function (n) { if (n) { if (on) n.setAttribute('inert', ''); else n.removeAttribute('inert'); } });
  }

  function open(opts) {
    opts = opts || {};
    opener = opts.opener || document.activeElement;
    isOpen = true;
    panel.hidden = false;
    chip.setAttribute('aria-expanded', 'true');
    if (modal()) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      backdrop.hidden = false;
      setBackgroundInert(true);
    } else {
      panel.setAttribute('role', 'region');
      panel.removeAttribute('aria-modal');
      backdrop.hidden = true;
    }
    S.storage.setDashboardOpen(true);
    render();
    var target = opts.focus === 'override' ? panel.querySelector('input[name="mode"]:checked') || title : title;
    if (opts.focus !== false) target.focus();
  }

  function close(restoreFocus) {
    if (!isOpen) return;
    isOpen = false;
    panel.hidden = true;
    backdrop.hidden = true;
    setBackgroundInert(false);
    chip.setAttribute('aria-expanded', 'false');
    S.storage.setDashboardOpen(false);
    if (restoreFocus !== false && opener && opener.focus && document.contains(opener)) opener.focus();
    else chip.focus();
  }

  chip.addEventListener('click', function () { if (isOpen) close(); else open({ opener: chip }); });
  footerMode.addEventListener('click', function () { open({ opener: footerMode, focus: 'override' }); });
  $('dash-close').addEventListener('click', function () { close(); });
  backdrop.addEventListener('click', function () { close(); });

  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    if (e.key === 'Escape' && !$('override-warn').contains(document.activeElement)) { close(); return; }
    if (e.key === 'Tab' && modal()) {
      var f = panel.querySelectorAll('button:not([hidden]), input, summary, [tabindex="0"]');
      f = Array.prototype.filter.call(f, function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === title)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  if (desktopQuery) {
    var onDesktopChange = function () {
      if (isOpen) { var o = opener; close(false); open({ opener: o, focus: false }); }
    };
    if (desktopQuery.addEventListener) desktopQuery.addEventListener('change', onDesktopChange);
    else if (desktopQuery.addListener) desktopQuery.addListener(onDesktopChange);
  }

  /* ---------- Rendering ---------- */

  function na(text) { return '<span class="na">' + (text || C.notAvailable) + '</span>'; }
  function set(id, html) { $(id).innerHTML = html; }

  var capText = {
    touchCap: 'Touch device on a smaller screen: capped at MEDIUM',
    saveData: 'Data Saver is on: lowered one level',
    slowNetwork: 'Slow network: lowered one level',
    lowBattery: 'Low battery, not charging: lowered one level',
    insufficientData: 'Not enough signals: balanced default',
    estimatedHighGuard: 'Smoothness test incomplete: HIGH needs 80+'
  };

  function renderChip() {
    if (S.state.phase === 'ANALYZING') {
      chipLabel.textContent = 'Finding your fit\u2026';
      chip.setAttribute('aria-label', 'Detecting the best performance mode for this device. Open performance settings.');
      chip.setAttribute('aria-busy', 'true');
      return;
    }
    chip.removeAttribute('aria-busy');
    var label = C.chip(S.state.mode, S.state.source) + (S.state.profile && S.state.profile.estimated ? ' est.' : '');
    chipLabel.textContent = label;
    chip.setAttribute('aria-label', 'Performance: ' + C.title(S.state.mode) + ' mode, ' + (S.state.source === 'manual' ? 'manual' : 'automatic') + '. Open performance dashboard.');
    footerMode.textContent = 'Display mode: ' + C.title(S.state.mode) + ' (' + (S.state.source === 'manual' ? 'Manual' : 'Auto') + ')';
  }

  function render() {
    renderChip();
    if (!isOpen) return;
    var st = S.state, p = st.profile;

    set('d-mode', C.title(st.mode) + ' (' + (st.source === 'manual' ? 'Manual' : 'Auto') + ')');

    var differs = p && st.source === 'manual' && p['class'].toLowerCase() !== st.mode;
    $('d-diff-row').hidden = !differs;
    if (differs) $('d-diff').textContent = C.diff(p['class'], st.mode);

    $('d-rm').textContent = st.motion === 'reduced' ? 'On (system setting)' : 'Off';

    if (!p) {
      ['d-cpu', 'd-mem', 'd-screen', 'd-fps', 'd-gl'].forEach(function (id) { set(id, 'Measuring\u2026'); });
      set('d-score', 'Measuring\u2026');
      return;
    }

    var s = p.signals || {};
    var fallback = p.source === 'fallback';
    set('d-score', p.score === null ? na() : p.score + ' / 100' + (p.estimated ? '<span class="badge">Estimated</span>' : ''));
    $('gauge-num').textContent = p.score === null ? '\u2013' : String(p.score);
    $('gauge-value').style.strokeDashoffset = String(157 - 157 * ((p.score || 0) / 100));
    $('d-why').innerHTML = fallback ? 'We couldn\u2019t read your device information. The site is using MEDIUM mode.' : '<strong>Why this mode?</strong> ' + escapeHtml(S.ui.whyLine(p));

    set('d-cpu', typeof s.cpuThreads === 'number' ? s.cpuThreads + ' threads' : na());
    set('d-mem', typeof s.deviceMemoryGB === 'number' ? s.deviceMemoryGB + ' GB <span class="na">(reported, rounded)</span>' : na());
    set('d-screen', s.screen ? s.screen.width + ' \u00d7 ' + s.screen.height + ' at ' + s.screen.dpr + 'x' + (p.megapixels ? ' (' + p.megapixels + ' MP)' : '') : na());
    set('d-fps', typeof s.fps === 'number' ? Math.round(s.fps) + ' fps' : fallback ? na() : na(C.notMeasured));
    set('d-gl', s.webgl === 'webgl2' ? 'WebGL 2' : s.webgl === 'webgl1' ? 'WebGL 1' : s.webgl === 'none' ? C.notSupported : na());

    var caps = (p.appliedCaps || []).map(function (c) { return capText[c] || c; });
    var manualNote = st.source === 'manual' && caps.length ? ' (not applied: manual mode)' : '';
    set('d-caps', caps.length ? escapeHtml(caps.join('; ') + manualNote) : 'None');

    var api = S.api.status();
    set('d-src', fallback ? 'Default (detection failed)' : p.confirmed ? 'Automatic, confirmed by server' : api === 'offline' ? 'Local (server unavailable)' : 'Automatic (local)');
    set('d-time', new Date(p.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }));

    var labels = { cpu: 'CPU', memory: 'Memory', screen: 'Screen', webgl: 'Graphics', fps: 'Frame rate' };
    var bars = $('d-bars');
    bars.innerHTML = '';
    ['cpu', 'memory', 'screen', 'webgl', 'fps'].forEach(function (k) {
      var v = p.breakdown[k], max = p.max[k];
      var li = document.createElement('li');
      li.innerHTML = '<span>' + labels[k] + '</span><span class="bars__track"><span class="bars__fill"></span></span><span class="bars__val">' + (v === null ? 'n/a' : v + '/' + max) + '</span>';
      bars.appendChild(li);
      var fill = li.querySelector('.bars__fill');
      requestAnimationFrame(function () { fill.style.width = (v === null ? 0 : (v / max) * 100) + '%'; });
    });
    var missing = ['cpu', 'memory', 'screen', 'webgl', 'fps'].filter(function (k) { return p.breakdown[k] === null; }).length;
    $('d-rescale').textContent = missing && !fallback ? 'Score rescaled because ' + missing + ' signal' + (missing > 1 ? 's were' : ' was') + ' not available.' : '';
  }

  function escapeHtml(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  ['adaptive:ready', 'adaptive:modechange', 'adaptive:profileupdate'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      render();
      if (ev === 'adaptive:modechange') {
        chip.classList.remove('is-bump');
        void chip.offsetWidth;
        chip.classList.add('is-bump');
      }
    });
  });

  document.addEventListener('adaptive:progress', function () {
    renderChip();
    if (isOpen && S.state.phase === 'ANALYZING') {
      ['d-cpu', 'd-mem', 'd-screen', 'd-fps', 'd-gl', 'd-score'].forEach(function (id) { set(id, 'Measuring\u2026'); });
    }
  });

  $('d-rerun').addEventListener('click', function () { S.controller.rerun(); });

  /* ---------- Debug: save test result ---------- */

  var saveBtn = $('d-save');
  if (S.debug.enabled) saveBtn.hidden = false;

  function deviceCategory(p) {
    var s = p.signals || {};
    if (s.pointerCoarse) return 'mobile';
    return p['class'] === 'HIGH' ? 'high-end-computer' : 'mid-low-computer';
  }

  function saveTest() {
    var p = S.state.profile;
    if (!p) return;
    var expected = window.prompt('Expected mode for this device (high, medium, basic):', p['class'].toLowerCase());
    if (expected === null) return;
    expected = expected.trim().toLowerCase();
    var notes = window.prompt('Notes (no personal data):', '') || '';
    var entry = {
      testerLabel: 'QA-' + (S.debug.sim.length ? 'sim' : 'device'),
      deviceDescription: navigator.platform || 'unknown',
      deviceCategory: deviceCategory(p),
      browser: browserName(),
      os: navigator.platform || 'unknown',
      profile: { score: p.score, 'class': p['class'], estimated: p.estimated, breakdown: p.breakdown, appliedCaps: p.appliedCaps, missingSignals: p.missingSignals },
      signals: p.signals ? { cpuThreads: p.signals.cpuThreads, deviceMemoryGB: p.signals.deviceMemoryGB, screen: p.signals.screen, webgl: p.signals.webgl, fps: p.signals.fps } : null,
      modeUsed: S.state.mode,
      source: S.state.source,
      expectedMode: expected,
      pass: expected === p['class'].toLowerCase(),
      notes: (S.debug.sim.length ? '[sim: ' + S.debug.sim.join(',') + '] ' : '') + notes.slice(0, 400),
      timing: { analysisMs: p.benchmark ? p.benchmark.durationMs : null }
    };
    S.api.postTestResult(entry).then(function () {
      S.controller.notice('test-saved', C.toast.testSaved, { tone: 'success' });
    }, function () {
      S.controller.notice('test-save-failed', C.toast.testFailed, { tone: 'warning', persistent: true, actions: [{ label: 'Retry', run: saveTest }] });
    });
  }

  function browserName() {
    var ua = navigator.userAgent;
    var m = ua.match(/(Edg|Firefox|Chrome|Version)\/(\d+)/);
    if (!m) return 'unknown';
    var name = m[1] === 'Edg' ? 'Edge' : m[1] === 'Version' ? 'Safari' : m[1];
    return name + ' ' + m[2];
  }

  saveBtn.addEventListener('click', saveTest);

  S.ui.dashboard = {
    open: open,
    close: close,
    render: render,
    restore: function () {
      if (desktopQuery && desktopQuery.matches && S.storage.getDashboardOpen()) {
        open({ focus: false, opener: chip });
      }
    }
  };
})(window.Sypher);
