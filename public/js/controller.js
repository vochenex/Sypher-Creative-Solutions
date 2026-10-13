/* Mode Controller and Accessibility Guard. Resolves the final mode, sets root hooks, loads assets, fires adaptive:* events. */
(function (S) {
  'use strict';

  var cfg = S.config;
  var root = document.documentElement;
  var reducedQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  var state = S.state = {
    phase: 'INITIALIZING',
    profile: null,
    mode: root.getAttribute('data-mode') || 'basic',
    source: root.getAttribute('data-source') || 'auto',
    motion: root.getAttribute('data-motion') || 'full',
    flags: null,
    serverFlags: {},
    ready: false
  };

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent('adaptive:' + name, { detail: detail }));
  }

  function setPhase(p) {
    state.phase = p;
    root.setAttribute('data-phase', p.toLowerCase());
  }

  function notice(type, message, opts) {
    opts = opts || {};
    emit('notice', { type: type, message: message, tone: opts.tone || 'info', actions: opts.actions || [], persistent: !!opts.persistent, timeoutMs: opts.timeoutMs });
  }

  /* ---------- Flags and assets ---------- */

  function effectiveFlags(mode) {
    var flags = Object.assign({}, cfg.modes[mode], state.serverFlags[mode] || {});
    flags.testimonialsAutoAdvance = flags.testimonials === 'carousel';
    if (state.motion === 'reduced') Object.assign(flags, cfg.reducedMotionOverrides);
    return flags;
  }

  function ensureStylesheet(id, href, wanted) {
    var el = document.getElementById(id);
    if (wanted && !el) {
      el = document.createElement('link');
      el.id = id; el.rel = 'stylesheet'; el.href = href;
      document.head.appendChild(el);
    } else if (!wanted && el) {
      el.parentNode.removeChild(el);
    }
  }

  var highEffectsLoading = null;
  function loadHighEffects() {
    if (S.highEffects) return Promise.resolve(S.highEffects);
    if (highEffectsLoading) return highEffectsLoading;
    highEffectsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'js/effects/high-effects.js';
      s.onload = function () { resolve(S.highEffects); };
      s.onerror = function () { highEffectsLoading = null; reject(new Error('high-effects failed to load')); };
      document.head.appendChild(s);
    });
    return highEffectsLoading;
  }

  function applyAssets(flags) {
    ensureStylesheet('css-mode-medium', 'css/mode-medium.css', state.mode !== 'basic');
    ensureStylesheet('css-mode-high', 'css/mode-high.css', state.mode === 'high');

    var needsHigh = flags.webglScene || flags.cursorEffects || flags.parallax || flags.hoverEffects === 'tilt-preview';
    if (needsHigh) {
      loadHighEffects().then(function (fx) { if (fx) fx.start(state.flags); }, function () {});
    } else if (S.highEffects) {
      S.highEffects.stop();
    }
  }

  function writeRoot() {
    root.setAttribute('data-mode', state.mode);
    root.setAttribute('data-source', state.source);
    root.setAttribute('data-motion', state.motion);
  }

  function applyMode(mode, source, opts) {
    opts = opts || {};
    var changed = mode !== state.mode || source !== state.source || opts.force;
    state.mode = mode;
    state.source = source;
    state.flags = effectiveFlags(mode);

    var commit = function () {
      writeRoot();
      applyAssets(state.flags);
    };
    var canTransition = !opts.initial && document.startViewTransition && state.flags.pageTransitions === 'view-transition';
    if (canTransition) document.startViewTransition(commit);
    else commit();

    S.api.getModeConfig(mode).then(function (data) {
      if (!data || !data.flags) return;
      var before = JSON.stringify(state.serverFlags[mode] || {});
      state.serverFlags[mode] = data.flags;
      if (state.mode === mode && before !== JSON.stringify(data.flags)) {
        state.flags = effectiveFlags(mode);
        applyAssets(state.flags);
        emit('modechange', { mode: state.mode, source: state.source, motion: state.motion, flags: state.flags });
      }
    }, function () {});

    if (changed && state.ready) {
      emit('modechange', { mode: state.mode, source: state.source, motion: state.motion, flags: state.flags });
    }
    liveWatch.reset();
  }

  /* ---------- Accessibility Guard ---------- */

  function setMotion(reduced) {
    state.motion = reduced ? 'reduced' : 'full';
    state.flags = effectiveFlags(state.mode);
    writeRoot();
    applyAssets(state.flags);
    if (state.ready) {
      emit('modechange', { mode: state.mode, source: state.source, motion: state.motion, flags: state.flags });
      if (reduced && state.mode === 'high') notice('reduced-motion', S.copy.toast.rmHigh);
    }
  }

  if (reducedQuery) {
    var onMotion = function (e) { setMotion(e.matches); };
    if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onMotion);
    else if (reducedQuery.addListener) reducedQuery.addListener(onMotion);
    state.motion = reducedQuery.matches ? 'reduced' : 'full';
  }

  /* ---------- Profile building ---------- */

  function missingList(signals) {
    var m = [];
    if (signals.cpuThreads === null) m.push('cpuThreads');
    if (signals.deviceMemoryGB === null) m.push('deviceMemory');
    if (signals.screen === null) m.push('screen');
    if (signals.webgl === null) m.push('webgl');
    if (signals.fps === null) m.push('fps');
    if (signals.saveData === null) m.push('saveData');
    if (signals.effectiveType === null) m.push('effectiveType');
    if (signals.battery === null) m.push('battery');
    return m;
  }

  function buildProfile(signals, bench, scored, result) {
    return {
      score: scored.score,
      class: result.cls,
      estimated: scored.estimated || result.fallback,
      benchmarkVerified: result.benchmarkVerified,
      breakdown: scored.breakdown,
      max: scored.max,
      appliedCaps: result.appliedCaps,
      missingSignals: missingList(signals),
      megapixels: scored.physicalMegapixels,
      source: result.fallback ? 'fallback' : 'auto',
      confirmed: false,
      signals: signals,
      benchmark: bench,
      timestamp: Date.now()
    };
  }

  function fallbackProfile(signals) {
    return {
      score: null, class: 'MEDIUM', estimated: true, benchmarkVerified: false,
      breakdown: { cpu: null, memory: null, screen: null, webgl: null, fps: null },
      max: cfg.scoring.weights, appliedCaps: [], missingSignals: signals ? missingList(signals) : ['all'],
      megapixels: null, source: 'fallback', confirmed: false, signals: signals || null,
      benchmark: { completed: false, durationMs: 0 }, timestamp: Date.now()
    };
  }

  function apiPayload(profile) {
    var s = profile.signals || {};
    return {
      sessionId: sessionId(),
      clientVersion: '1.0.0',
      signals: {
        cpuThreads: s.cpuThreads, deviceMemoryGB: s.deviceMemoryGB, screen: s.screen, webgl: s.webgl,
        fps: s.fps, pointerCoarse: s.pointerCoarse, viewportWidth: s.viewportWidth, reducedMotion: s.reducedMotion,
        saveData: s.saveData, effectiveType: s.effectiveType, batteryLowNotCharging: s.batteryLowNotCharging
      },
      benchmark: { completed: !!(profile.benchmark && profile.benchmark.completed), durationMs: profile.benchmark ? profile.benchmark.durationMs : 0 },
      local: { score: profile.score, class: profile.class }
    };
  }

  var sid = null;
  function sessionId() {
    if (!sid) sid = Math.random().toString(36).slice(2, 10);
    return sid;
  }

  /* ---------- Analysis ---------- */

  function progress(step, percent) { emit('progress', { step: step, percent: Math.round(percent) }); }

  function runAnalysis(inline) {
    var t = cfg.timing;
    var finished = false, signalsReady = null, benchCtl = null;
    var startedAt = performance.now();
    setPhase('ANALYZING');

    var canvas = inline ? document.createElement('canvas') : S.ui.analysis.show(function () { stop('skip'); });
    var hardTimer = setTimeout(function () { stop('limit'); }, t.analysisHardLimitMs);

    function stop(reason) {
      if (finished) return;
      if (reason === 'skip') setPhase('SKIPPED');
      if (benchCtl) benchCtl.abort();
      conclude(signalsReady, { fps: null, completed: false, durationMs: Math.round(performance.now() - startedAt) }, reason);
    }

    function conclude(signals, bench, reason) {
      if (finished) return;
      finished = true;
      clearTimeout(hardTimer);
      if (!signals) return finalize(fallbackProfile(null), { inline: inline, reason: reason || 'error' });

      signals.fps = bench.completed ? bench.fps : null;
      progress('scoring', 95);
      var scored = S.score.compute(signals, cfg.scoring.weights, bench.completed);
      var result = S.classify.classify(scored, signals, cfg.scoring);
      var profile = result.fallback ? fallbackProfile(signals) : buildProfile(signals, bench, scored, result);
      setPhase(profile.source === 'fallback' ? 'FALLBACK_DEFAULT' : profile.estimated ? 'ESTIMATED' : 'CLASSIFIED');
      progress('done', 100);
      finalize(profile, { inline: inline, reason: reason });
      syncWithApi(profile);
    }

    progress('signals', 5);
    S.detect.collectStatic(t).then(function (signals) {
      signalsReady = signals;
      if (finished) return;
      progress('webgl', 35);
      benchCtl = S.detect.runBenchmark(canvas, t, function (p) { progress('benchmark', 35 + p * 55); });
      return benchCtl.promise.then(function (b) { conclude(signals, b); });
    }).catch(function () {
      setPhase('FALLBACK_DEFAULT');
      conclude(null);
    });
  }

  function syncWithApi(profile) {
    if (profile.source === 'fallback') return;
    S.api.postDeviceProfile(apiPayload(profile)).then(function (server) {
      if (state.profile !== profile) return;
      profile.confirmed = true;
      profile.configVersion = server.configVersion;
      if (server.flags) state.serverFlags[server.mode] = server.flags;
      if (server.class && server.class !== profile.class) {
        profile.class = server.class;
        profile.score = server.score;
        profile.appliedCaps = server.appliedCaps || profile.appliedCaps;
        if (state.source === 'auto') applyMode(server.class.toLowerCase(), 'auto');
      }
      S.storage.setProfile(profile);
      emit('profileupdate', profile);
    }, function () {
      emit('profileupdate', profile);
    });
  }

  /* ---------- Final resolution ---------- */

  function finalize(profile, opts) {
    opts = opts || {};
    state.profile = profile;
    S.storage.setProfile(profile);
    S.storage.markSession();

    var override = S.storage.getOverride();
    var mode = override !== 'auto' ? override : profile.class.toLowerCase();
    var source = override !== 'auto' ? 'manual' : 'auto';
    setPhase(source === 'manual' ? 'OVERRIDDEN' : 'RENDERED');
    applyMode(mode, source, { initial: !state.ready, force: true });
    root.removeAttribute('data-adaptive-state');

    var firstRender = !state.ready;
    var afterOverlay = function () {
      if (!opts.cached) S.ui.banner.show(profile, state.mode, state.source);
      if (firstRender) {
        state.ready = true;
        emit('ready', { mode: state.mode, score: profile.score, source: state.source });
      } else {
        emit('modechange', { mode: state.mode, source: state.source, motion: state.motion, flags: state.flags });
      }
      emit('profileupdate', profile);
      if (profile.source === 'fallback') {
        notice('fallback', S.copy.toast.fallback, { tone: 'warning', persistent: true, actions: [{ label: 'Try again', run: rerun }] });
      }
      if (source === 'manual' && mode === 'high' && profile.class === 'BASIC') slowDeviceWarning();
      if (state.motion === 'reduced' && state.mode === 'high') notice('reduced-motion', S.copy.toast.rmHigh);
      liveWatch.start();
    };

    if (opts.cached || opts.inline) afterOverlay();
    else S.ui.analysis.hide(afterOverlay);
  }

  /* ---------- User actions ---------- */

  function slowDeviceWarning() {
    notice('slow-device-warning', S.copy.toast.slow, {
      tone: 'warning', persistent: true,
      actions: [
        { label: 'Switch to Basic', run: function () { setOverride('basic'); } },
        { label: 'Keep High', run: function () {} }
      ]
    });
  }

  /** Returns 'confirm' when the High-on-BASIC confirmation is required, otherwise 'applied'. */
  function setOverride(choice, opts) {
    opts = opts || {};
    var detected = state.profile ? state.profile.class : 'MEDIUM';
    if (choice === 'high' && detected === 'BASIC' && !opts.confirmed && state.mode !== 'high') return 'confirm';

    var prev = { mode: state.mode, source: state.source, override: S.storage.getOverride() };
    if (!S.storage.setOverride(choice) && !state.storageWarned) {
      state.storageWarned = true;
      notice('storage-unavailable', S.copy.toast.storage);
    }

    var mode = choice === 'auto' ? detected.toLowerCase() : choice;
    var source = choice === 'auto' ? 'auto' : 'manual';
    setPhase(source === 'manual' ? 'OVERRIDDEN' : 'RENDERED');
    applyMode(mode, source);

    if (!opts.silent) {
      notice('mode-changed', choice === 'auto' ? S.copy.toast.auto(mode) : S.copy.toast.changed(mode), {
        actions: [{ label: 'Undo', run: function () {
          S.storage.setOverride(prev.override);
          setPhase(prev.source === 'manual' ? 'OVERRIDDEN' : 'RENDERED');
          applyMode(prev.mode, prev.source);
        } }]
      });
    }
    if (opts.confirmed && choice === 'high') slowDeviceWarning();
    if (state.motion === 'reduced' && mode === 'high') notice('reduced-motion', S.copy.toast.rmHigh);
    return 'applied';
  }

  function rerun() {
    S.storage.clearProfile();
    runAnalysis(true);
  }

  /* ---------- Live downgrade watch ---------- */

  var liveWatch = (function () {
    var raf = null, windowStart = 0, frames = 0, lowCount = 0, startedAt = 0;
    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (document.visibilityState !== 'visible') { windowStart = now; frames = 0; return; }
      if (now - startedAt < cfg.timing.liveDowngradeGraceMs) { windowStart = now; return; }
      frames++;
      if (now - windowStart >= 1000) {
        var fps = (frames * 1000) / (now - windowStart);
        lowCount = fps < cfg.timing.liveDowngradeFps ? lowCount + 1 : 0;
        windowStart = now; frames = 0;
        if (lowCount >= cfg.timing.liveDowngradeWindows) { stop(); offer(); }
      }
    }
    function offer() {
      var lighter = S.classify.lower(state.mode.toUpperCase()).toLowerCase();
      var current = state.mode;
      setPhase('DOWNGRADE_OFFERED');
      notice('downgrade-offer', S.copy.toast.downgrade(lighter), {
        tone: 'warning', persistent: true, timeoutMs: 10000,
        actions: [
          { label: 'Switch to ' + S.copy.title(lighter), run: function () { setOverride(lighter, { confirmed: true }); } },
          { label: 'Keep ' + S.copy.title(current), run: function () { S.storage.dismissDowngrade(); setPhase(state.source === 'manual' ? 'OVERRIDDEN' : 'RENDERED'); }, isDismiss: true }
        ]
      });
    }
    function start() {
      stop();
      if (!state.flags || !state.flags.liveDowngradeWatch || S.storage.isDowngradeDismissed()) return;
      startedAt = performance.now(); windowStart = startedAt; frames = 0; lowCount = 0;
      raf = requestAnimationFrame(loop);
    }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }
    return { start: start, stop: stop, reset: function () { if (state.ready) start(); } };
  })();

  /* ---------- Boot ---------- */

  function init() {
    writeRoot();
    var cached = root.getAttribute('data-adaptive-state') === 'cached' && S.storage.hasSession()
      ? S.storage.getProfile(cfg.timing.profileTtlHours) : null;
    if (cached) {
      setPhase('CLASSIFIED');
      finalize(cached, { cached: true });
    } else {
      runAnalysis(false);
    }
  }

  S.controller = {
    init: init,
    setOverride: setOverride,
    rerun: rerun,
    notice: notice,
    effectiveFlags: effectiveFlags
  };
})(window.Sypher);
