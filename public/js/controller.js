/* Mode Controller and Accessibility Guard. Resolves the final mode, sets root hooks, loads assets, fires adaptive:* events. */
(function (S) {
  'use strict';

  var cfg = S.config;
  var root = document.documentElement;
  var MODE_VALUES = ['high', 'medium', 'basic'];
  var ASSET_VERSION = '20261019-high-autostart-1';
  var reducedQuery = null;
  try {
    if (window.matchMedia) reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  } catch (e) {
    reducedQuery = null;
  }

  function safeMode(mode, fallback) {
    var m = String(mode || '').toLowerCase();
    return MODE_VALUES.indexOf(m) >= 0 ? m : (fallback || 'basic');
  }

  var bootMode = safeMode(root.getAttribute('data-mode'), 'basic');
  var bootSource = root.getAttribute('data-source') === 'manual' ? 'manual' : 'auto';
  root.setAttribute('data-mode', bootMode);
  root.setAttribute('data-source', bootSource);

  var state = S.state = {
    phase: 'INITIALIZING',
    profile: null,
    mode: bootMode,
    source: bootSource,
    motion: root.getAttribute('data-motion') === 'reduced' ? 'reduced' : 'full',
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
      el.id = id; el.rel = 'stylesheet'; el.href = href + '?v=' + ASSET_VERSION;
      document.head.appendChild(el);
    } else if (!wanted && el) {
      el.parentNode.removeChild(el);
    }
  }

  var highEffectsLoading = null;
  var effectsEpoch = 0;
  var modeRevision = 0;

  function wantsHighEffects(flags) {
    if (state.mode !== 'high' || state.motion !== 'full') return false;
    flags = flags || state.flags || {};
    return !!(flags.webglScene || flags.cursorEffects || flags.parallax || flags.hoverEffects === 'tilt-preview');
  }

  function setHighFxClass(on) {
    root.classList.toggle('high-fx', !!on);
  }

  function loadHighEffects() {
    if (S.highEffects) return Promise.resolve(S.highEffects);
    if (highEffectsLoading) return highEffectsLoading;
    function load(src) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src + '?v=' + ASSET_VERSION;
        s.onload = resolve;
        s.onerror = function () { reject(new Error(src + ' failed to load')); };
        document.head.appendChild(s);
      });
    }
    // GSAP is HIGH-only; MEDIUM and BASIC never download it.
    highEffectsLoading = load('js/vendor/gsap.min.js')
      .then(function () { return load('js/vendor/ScrollTrigger.min.js'); })
      .then(function () { return load('js/effects/high-effects.js'); })
      .then(function () { return S.highEffects; }, function (err) { highEffectsLoading = null; throw err; });
    return highEffectsLoading;
  }

  function applyAssets(flags) {
    ensureStylesheet('css-mode-medium', 'css/mode-medium.css', state.mode !== 'basic');
    ensureStylesheet('css-mode-high', 'css/mode-high.css', state.mode === 'high');

    var epoch = ++effectsEpoch;
    if (wantsHighEffects(flags)) {
      loadHighEffects().then(function (fx) {
        if (epoch !== effectsEpoch) return;
        if (!wantsHighEffects(state.flags)) {
          if (fx && fx.stop) fx.stop();
          setHighFxClass(false);
          return;
        }
        var ok = fx && fx.start
          ? fx.start(state.flags, { epoch: epoch, getEpoch: function () { return effectsEpoch; } })
          : false;
        setHighFxClass(ok !== false && !!(fx && fx.isActive ? fx.isActive() : ok));
      }, function () {
        if (epoch !== effectsEpoch) return;
        setHighFxClass(false);
      });
    } else {
      if (S.highEffects) S.highEffects.stop();
      setHighFxClass(false);
    }
  }

  function writeRoot() {
    root.setAttribute('data-mode', state.mode);
    root.setAttribute('data-source', state.source);
    root.setAttribute('data-motion', state.motion);
  }

  function applyMode(mode, source, opts) {
    opts = opts || {};
    mode = safeMode(mode, state.mode || 'basic');
    source = source === 'manual' ? 'manual' : 'auto';
    var changed = mode !== state.mode || source !== state.source || opts.force || opts.restartMotion;
    state.mode = mode;
    state.source = source;
    // Choosing (or restoring) High opts into its animations without a second action.
    // Auto and the lighter modes continue to follow the system/session preference.
    state.motion = mode === 'high' && source === 'manual' ? 'full' : resolveMotion();
    state.flags = effectiveFlags(mode);
    var revision = ++modeRevision;

    var commit = function () {
      // A newer choice may arrive before a view-transition callback executes.
      if (revision !== modeRevision) return;
      writeRoot();
      applyAssets(state.flags);
      if (changed && state.ready) {
        emit('modechange', { mode: state.mode, source: state.source, motion: state.motion, flags: state.flags, restartMotion: !!opts.restartMotion });
      }
      liveWatch.reset();
    };
    var canTransition = !opts.initial && document.startViewTransition && state.flags.pageTransitions === 'view-transition';
    if (canTransition) {
      try {
        var transition = document.startViewTransition(commit);
        if (transition && transition.updateCallbackDone) transition.updateCallbackDone.catch(commit);
        // Superseded transitions can be skipped; they must not reject globally.
        if (transition && transition.ready) transition.ready.catch(function () {});
        if (transition && transition.finished) transition.finished.catch(function () {});
      } catch (e) { commit(); }
    } else commit();

    S.api.getModeConfig(mode).then(function (data) {
      if (!data || !data.flags) return;
      var before = JSON.stringify(state.serverFlags[mode] || {});
      state.serverFlags[mode] = data.flags;
      if (state.mode === mode && before !== JSON.stringify(data.flags)) {
        state.flags = effectiveFlags(mode);
        // Pending view transitions publish their flags together with the DOM commit.
        if (root.getAttribute('data-mode') === mode) {
          applyAssets(state.flags);
          emit('modechange', { mode: state.mode, source: state.source, motion: state.motion, flags: state.flags });
        }
      }
    }, function () {});
  }

  /* ---------- Accessibility Guard ---------- */

  function systemWantsReduced() {
    return !!(reducedQuery && reducedQuery.matches);
  }

  /** data-motion source of truth: session allow > OS preference. */
  function resolveMotion() {
    if (S.storage && S.storage.isMotionAllowed && S.storage.isMotionAllowed()) return 'full';
    return systemWantsReduced() ? 'reduced' : 'full';
  }

  function offerMotionAllow() {
    if (!S.debug || !S.debug.enabled) return;
    notice('reduced-motion', S.copy.toast.rmHigh, {
      tone: 'info',
      persistent: true,
      actions: [
        {
          label: 'Show animations this visit',
          run: function () {
            if (S.storage && S.storage.allowMotion) S.storage.allowMotion();
            applyResolvedMotion({ announceAllow: true });
          }
        }
      ]
    });
  }

  function applyResolvedMotion(opts) {
    opts = opts || {};
    ++modeRevision;
    var next = resolveMotion();
    var changed = next !== state.motion;
    state.motion = next;
    state.flags = effectiveFlags(state.mode);
    writeRoot();
    applyAssets(state.flags);
    // Restart the live-FPS grace window after motion is armed so DevTools / cold start
    // does not immediately offer a Medium downgrade over the opt-in confirmation.
    if (changed && state.motion === 'full' && liveWatch && liveWatch.reset) liveWatch.reset();
    if (state.ready && (changed || opts.force)) {
      emit('modechange', { mode: state.mode, source: state.source, motion: state.motion, flags: state.flags });
    }
    if (opts.announceAllow && state.motion === 'full') {
      notice('motion-allowed', S.copy.toast.rmAllow);
    } else if (state.ready && state.motion === 'reduced' && state.mode === 'high' && !opts.silent) {
      offerMotionAllow();
    }
  }

  function setMotion(systemReduced) {
    // Media-query change: if the OS turned reduce-motion off, drop a stale session allow.
    if (systemReduced === false && S.storage && S.storage.clearMotionAllow) {
      S.storage.clearMotionAllow();
    }
    applyResolvedMotion();
  }

  if (reducedQuery) {
    var onMotion = function (e) { setMotion(e.matches); };
    if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onMotion);
    else if (reducedQuery.addListener) reducedQuery.addListener(onMotion);
  }
  state.motion = resolveMotion();

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

  var initialized = false, analysisRunning = false;

  function progress(step, percent) { emit('progress', { step: step, percent: Math.round(percent) }); }

  function runAnalysis(opts) {
    if (analysisRunning) return;
    analysisRunning = true;
    liveWatch.stop();
    opts = opts || {};
    var inlineStatus = opts.inline !== false;
    var t = cfg.timing;
    var finished = false, signalsReady = null, benchCtl = null;
    var startedAt = performance.now();
    setPhase('ANALYZING');

    // Always nonblocking: polite status + off-screen canvas. Content stays usable.
    var canvas = S.ui.analysis && S.ui.analysis.show
      ? S.ui.analysis.show()
      : document.createElement('canvas');
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
      if (!signals) return finalize(fallbackProfile(null), { inline: inlineStatus, reason: reason || 'error' });

      signals.fps = bench.completed ? bench.fps : null;
      progress('scoring', 95);
      var scored = S.score.compute(signals, cfg.scoring.weights, bench.completed);
      var result = S.classify.classify(scored, signals, cfg.scoring);
      var profile = result.fallback ? fallbackProfile(signals) : buildProfile(signals, bench, scored, result);
      setPhase(profile.source === 'fallback' ? 'FALLBACK_DEFAULT' : profile.estimated ? 'ESTIMATED' : 'CLASSIFIED');
      progress('done', 100);
      finalize(profile, { inline: inlineStatus, reason: reason });
      syncWithApi(profile);
    }

    progress('signals', 5);
    var collect = S.detect && S.detect.collectStatic
      ? S.detect.collectStatic(t)
      : Promise.reject(new Error('detect unavailable'));
    collect.then(function (signals) {
      signalsReady = signals;
      if (finished) return;
      progress('webgl', 35);
      if (!S.detect || !S.detect.runBenchmark) {
        conclude(signals, { fps: null, completed: false, durationMs: Math.round(performance.now() - startedAt) }, 'nobench');
        return;
      }
      benchCtl = S.detect.runBenchmark(canvas, t, function (p) { progress('benchmark', 35 + p * 55); });
      return benchCtl.promise.then(function (b) { conclude(signals, b); });
    }).catch(function () {
      if (finished) return;
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

  function scoreBands() {
    var t = cfg.scoring.thresholds;
    return [t.high, t.medium, t.estimatedHigh].join(':');
  }

  function refreshCachedClass(profile) {
    if (profile.scoreBands === scoreBands() || profile.source === 'fallback') return;
    // Reuse saved measurements when score bands change; this does not run detection again.
    var breakdown = profile.breakdown;
    var available = breakdown ? ['cpu', 'memory', 'screen', 'webgl', 'fps'].filter(function (key) {
      return typeof breakdown[key] === 'number';
    }).length : 3;
    var result = S.classify.classify({ score: profile.score, availableCount: available }, profile.signals || {}, cfg.scoring);
    profile.class = result.cls;
    profile.appliedCaps = result.appliedCaps;
    profile.benchmarkVerified = result.benchmarkVerified;
  }

  function finalize(profile, opts) {
    opts = opts || {};
    profile.scoreBands = scoreBands();
    state.profile = profile;
    S.storage.setProfile(profile);
    S.storage.markSession();

    var override = S.storage.getOverride();
    var detected = safeMode(profile && profile.class, 'medium');
    var mode = override !== 'auto' ? safeMode(override, detected) : detected;
    var source = override !== 'auto' ? 'manual' : 'auto';
    setPhase(source === 'manual' ? 'OVERRIDDEN' : 'RENDERED');
    applyMode(mode, source, { initial: !state.ready, force: true });
    root.setAttribute('data-adaptive-state', 'ready');

    var firstRender = !state.ready;
    var finish = function () {
      analysisRunning = false;
      if (!opts.cached && S.ui.banner) S.ui.banner.show(profile, state.mode, state.source);
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
      if (state.motion === 'reduced' && state.mode === 'high') offerMotionAllow();
      liveWatch.start();
    };

    if (!opts.cached && S.ui.analysis && S.ui.analysis.setDoneMessage) {
      S.ui.analysis.setDoneMessage('Your ' + S.copy.title(mode) + ' experience is ready');
    }
    if (S.ui.analysis && S.ui.analysis.hide) S.ui.analysis.hide(finish);
    else finish();
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

    var mode = choice === 'auto' ? safeMode(detected, 'medium') : safeMode(choice, state.mode);
    var source = choice === 'auto' ? 'auto' : 'manual';
    setPhase(source === 'manual' ? 'OVERRIDDEN' : 'RENDERED');
    applyMode(mode, source, { restartMotion: choice === 'high' });

    if (!opts.silent) {
      notice('mode-changed', choice === 'auto' ? S.copy.toast.auto(mode) : S.copy.toast.changed(mode), {
        actions: [{ label: 'Undo', run: function () {
          S.storage.setOverride(prev.override);
          setPhase(prev.source === 'manual' ? 'OVERRIDDEN' : 'RENDERED');
          applyMode(prev.mode, prev.source);
        } }]
      });
    }
    if (opts.confirmed && choice === 'high' && detected === 'BASIC') slowDeviceWarning();
    if (state.motion === 'reduced' && mode === 'high') offerMotionAllow();
    return 'applied';
  }

  function rerun() {
    if (analysisRunning) return;
    S.storage.clearProfile();
    runAnalysis({ inline: true });
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
    if (initialized) return;
    initialized = true;
    writeRoot();
    applyMode(state.mode, state.source, { initial: true, force: true });
    var simulating = S.debug && S.debug.sim && S.debug.sim.length;
    var cached = !simulating ? S.storage.getProfile(cfg.timing.profileTtlHours) : null;
    if (cached && cached.class) {
      refreshCachedClass(cached);
      setPhase('CLASSIFIED');
      finalize(cached, { cached: true });
    } else {
      runAnalysis({ inline: true });
    }
  }

  S.controller = {
    init: init,
    allowMotion: function () {
      if (S.storage && S.storage.allowMotion) S.storage.allowMotion();
      applyResolvedMotion({ announceAllow: true });
    },
    setOverride: setOverride,
    rerun: rerun,
    notice: notice,
    effectiveFlags: effectiveFlags
  };
})(window.Sypher);
