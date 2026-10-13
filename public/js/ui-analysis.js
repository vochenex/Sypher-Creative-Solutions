/* Analysis Screen and Result Banner. */
(function (S) {
  'use strict';

  var C = S.copy;
  S.ui = S.ui || {};

  /* ---------- Analysis Screen ---------- */

  var el = document.getElementById('analysis');
  var bar = document.getElementById('analysis-bar');
  var progressEl = el.querySelector('.progress');
  var stepEl = document.getElementById('analysis-step');
  var skipBtn = document.getElementById('analysis-skip');
  var mainEls = [document.getElementById('main'), document.getElementById('site-header'), document.querySelector('.site-footer')];
  var skipHandler = null, skipTimer = null, open = false;

  function setInert(on) {
    mainEls.forEach(function (n) {
      if (!n) return;
      if (on) n.setAttribute('inert', ''); else n.removeAttribute('inert');
    });
  }

  function onKey(e) {
    if (e.key === 'Escape' && skipBtn.classList.contains('is-visible')) skip();
  }

  function skip() {
    if (!open || !skipHandler) return;
    var h = skipHandler;
    skipHandler = null;
    h();
  }

  document.addEventListener('adaptive:progress', function (e) {
    if (!open) return;
    var d = e.detail;
    bar.style.width = d.percent + '%';
    progressEl.setAttribute('aria-valuenow', String(d.percent));
    var label = C.steps[d.step] || '';
    progressEl.setAttribute('aria-valuetext', d.percent + ' percent, ' + label.toLowerCase());
    if (label && stepEl.textContent !== label) stepEl.textContent = label;
  });

  skipBtn.addEventListener('click', skip);
  document.querySelector('.skip-link').addEventListener('click', function () { skip(); });

  S.ui.analysis = {
    show: function (onSkip) {
      open = true;
      skipHandler = onSkip;
      el.hidden = false;
      el.classList.add('is-open');
      el.classList.remove('is-leaving');
      bar.style.width = '0%';
      skipBtn.classList.remove('is-visible');
      setInert(true);
      document.addEventListener('keydown', onKey);
      skipTimer = setTimeout(function () { skipBtn.classList.add('is-visible'); }, S.config.timing.analysisSkipVisibleMs);
      return document.getElementById('bench-canvas');
    },
    hide: function (done) {
      clearTimeout(skipTimer);
      document.removeEventListener('keydown', onKey);
      var instant = !open || !skipHandler || document.documentElement.getAttribute('data-motion') === 'reduced';
      var finish = function () {
        open = false;
        skipHandler = null;
        el.classList.remove('is-open', 'is-leaving');
        el.hidden = true;
        setInert(false);
        if (done) done();
      };
      if (instant) return finish();
      setTimeout(function () {
        el.classList.add('is-leaving');
        setTimeout(finish, 160);
      }, 150);
    }
  };

  /* ---------- Result Banner ---------- */

  var banner = document.getElementById('result-banner');
  var bannerTimer = null, remaining = 0, startedAt = 0, estimatedShown = false;

  function whyLine(profile) {
    if (!profile || profile.source === 'fallback') return '';
    var caps = profile.appliedCaps || [];
    var phrase;
    if (caps.length) {
      phrase = C.whyCap[caps[0]];
    } else {
      var keys = ['fps', 'cpu', 'memory', 'webgl', 'screen'].filter(function (k) { return profile.breakdown[k] !== null && profile.breakdown[k] !== undefined; });
      var ratio = function (k) { return profile.breakdown[k] / profile.max[k]; };
      var high = profile['class'] === 'HIGH';
      keys.sort(function (a, b) { return high ? ratio(b) - ratio(a) : ratio(a) - ratio(b); });
      var picks = keys.slice(0, 2).map(function (k) { return (high ? C.whyHigh : C.whyLow)[k]; });
      picks = picks.map(function (t, i) { return i === 0 ? t.charAt(0).toUpperCase() + t.slice(1) : t.charAt(0).toLowerCase() + t.slice(1); });
      phrase = picks.join(' and ');
    }
    if (!phrase) return '';
    return phrase + (profile.estimated ? ' (estimated).' : '.');
  }
  S.ui.whyLine = whyLine;

  function dismiss() {
    clearTimeout(bannerTimer);
    banner.hidden = true;
    var p = S.state.profile;
    if (p && p.estimated && p.source !== 'fallback' && !estimatedShown) {
      estimatedShown = true;
      S.controller.notice('estimated', C.toast.estimated, { actions: [{ label: 'Re-run detection', run: S.controller.rerun }] });
    }
  }

  function startTimer(ms) {
    clearTimeout(bannerTimer);
    remaining = ms;
    startedAt = Date.now();
    bannerTimer = setTimeout(dismiss, ms);
  }
  function pauseTimer() {
    clearTimeout(bannerTimer);
    remaining = Math.max(1500, remaining - (Date.now() - startedAt));
  }

  banner.addEventListener('mouseenter', pauseTimer);
  banner.addEventListener('mouseleave', function () { if (!banner.hidden) startTimer(remaining); });
  banner.addEventListener('focusin', pauseTimer);
  banner.addEventListener('focusout', function (e) { if (!banner.contains(e.relatedTarget) && !banner.hidden) startTimer(remaining); });

  function render(profile, mode, source) {
    var cls = profile['class'];
    var lines = [];
    if (profile.source === 'fallback') lines.push(C.resultFallback);
    else lines.push(C.resultBody[cls]);
    if (profile.benchmarkVerified && cls === 'HIGH') lines.push(C.resultVerified);
    if (profile.estimated && profile.source !== 'fallback') lines.push(C.resultEstimated);
    if (source === 'manual') lines.push(C.resultManual(mode));
    var why = whyLine(profile);

    banner.setAttribute('data-class', cls);
    banner.innerHTML =
      '<span class="result-banner__badge" aria-hidden="true"><span class="meter" data-level="' + (cls === 'HIGH' ? 3 : cls === 'MEDIUM' ? 2 : 1) + '"><i></i><i></i><i></i></span></span>' +
      '<div><p class="result-banner__title"></p><p class="result-banner__body"></p></div>' +
      '<div class="result-banner__actions">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-act="change">Change mode</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-act="dismiss" aria-label="Dismiss message">Dismiss</button>' +
      '</div>';
    banner.querySelector('.result-banner__title').textContent = C.resultTitle(cls);
    banner.querySelector('.result-banner__body').textContent = lines.join(' ') + (why ? ' Why: ' + why : '');
  }

  banner.addEventListener('click', function (e) {
    var act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.getAttribute('data-act') === 'dismiss') dismiss();
    else { dismiss(); S.ui.dashboard.open({ focus: 'override' }); }
  });

  document.addEventListener('adaptive:profileupdate', function (e) {
    if (!banner.hidden && e.detail) render(e.detail, S.state.mode, S.state.source);
  });

  S.ui.banner = {
    show: function (profile, mode, source) {
      render(profile, mode, source);
      banner.hidden = false;
      startTimer(S.config.timing.resultBannerMs);
    },
    hide: dismiss
  };
})(window.Sypher);
