/* Nonblocking analysis status and result banner. */
(function (S) {
  'use strict';

  var C = S.copy;
  S.ui = S.ui || {};

  /* ---------- Analysis status (never blocks the page) ---------- */

  var el = document.getElementById('analysis');
  var stepEl = document.getElementById('analysis-step');
  var titleEl = document.getElementById('analysis-title');
  var open = false;

  S.ui.analysis = {
    show: function () {
      open = true;
      if (!el) return null;
      el.hidden = false;
      el.classList.add('is-open');
      el.classList.remove('is-done');
      if (titleEl) titleEl.textContent = 'Analyzing Device Performance\u2026';
      if (stepEl) stepEl.textContent = 'Checking your device quietly in the background.';
      // Off-DOM canvas keeps the page usable while the benchmark runs.
      return document.createElement('canvas');
    },
    hide: function (done) {
      if (el) {
        el.classList.remove('is-open');
        el.classList.add('is-done');
        // Keep a brief polite confirmation in the live region, then clear.
        setTimeout(function () {
          if (!open) return;
          open = false;
          el.hidden = true;
          el.classList.remove('is-done');
        }, 1200);
      } else {
        open = false;
      }
      if (done) done();
    },
    setDoneMessage: function (text) {
      if (titleEl) titleEl.textContent = text || 'Experience ready';
      if (stepEl) stepEl.textContent = '';
    }
  };

  document.addEventListener('adaptive:progress', function (e) {
    if (!open || !stepEl) return;
    var labels = {
      signals: 'Reading available device signals',
      webgl: 'Checking graphics support',
      benchmark: 'Observing frame timing',
      scoring: 'Choosing a recommended mode',
      done: 'Finishing up'
    };
    var label = labels[e.detail && e.detail.step];
    if (label) stepEl.textContent = label;
  });

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
      var keys = ['fps', 'cpu', 'memory', 'webgl', 'screen'].filter(function (k) {
        return profile.breakdown && profile.breakdown[k] !== null && profile.breakdown[k] !== undefined;
      });
      var ratio = function (k) { return profile.breakdown[k] / profile.max[k]; };
      var high = profile['class'] === 'HIGH';
      keys.sort(function (a, b) { return high ? ratio(b) - ratio(a) : ratio(a) - ratio(b); });
      var picks = keys.slice(0, 2).map(function (k) { return (high ? C.whyHigh : C.whyLow)[k]; });
      picks = picks.map(function (t, i) {
        return i === 0 ? t.charAt(0).toUpperCase() + t.slice(1) : t.charAt(0).toLowerCase() + t.slice(1);
      });
      phrase = picks.join(' and ');
    }
    if (!phrase) return '';
    return phrase + (profile.estimated ? ' (estimated).' : '.');
  }
  S.ui.whyLine = whyLine;

  function dismiss() {
    clearTimeout(bannerTimer);
    if (banner) banner.hidden = true;
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

  if (banner) {
    banner.addEventListener('mouseenter', pauseTimer);
    banner.addEventListener('mouseleave', function () { if (!banner.hidden) startTimer(remaining); });
    banner.addEventListener('focusin', pauseTimer);
    banner.addEventListener('focusout', function (e) {
      if (!banner.contains(e.relatedTarget) && !banner.hidden) startTimer(remaining);
    });
    banner.addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.getAttribute('data-act') === 'dismiss') dismiss();
      else { dismiss(); S.ui.dashboard.open({ focus: 'override' }); }
    });
  }

  function render(profile, mode, source) {
    if (!banner) return;
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

  document.addEventListener('adaptive:profileupdate', function (e) {
    if (banner && !banner.hidden && e.detail) render(e.detail, S.state.mode, S.state.source);
  });

  S.ui.banner = {
    show: function (profile, mode, source) {
      render(profile, mode, source);
      if (banner) {
        banner.hidden = false;
        startTimer(S.config.timing.resultBannerMs);
      }
      if (S.ui.analysis && S.ui.analysis.setDoneMessage) {
        S.ui.analysis.setDoneMessage('Using ' + S.copy.title(mode) + ' experience');
      }
    },
    hide: dismiss
  };
})(window.Sypher);
