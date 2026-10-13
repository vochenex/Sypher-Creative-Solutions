/* Signal Collector and FPS Benchmark. Reads coarse capability signals only; never identifies hardware models. */
(function (S) {
  'use strict';

  var params = new URLSearchParams(location.search);
  var debug = params.get('debug') === '1';
  var sim = debug && params.get('sim') ? params.get('sim').split(',').map(function (x) { return x.trim(); }) : [];

  S.debug = { enabled: debug, sim: sim, has: function (flag) { return sim.indexOf(flag) >= 0; } };

  function mq(query) {
    try { return window.matchMedia ? window.matchMedia(query).matches : null; } catch { return null; }
  }

  function safe(fn) {
    try { return fn(); } catch { return null; }
  }

  function readBattery(timeoutMs) {
    if (S.debug.has('lowBattery')) return Promise.resolve({ level: 0.15, charging: false, simulated: true });
    if (!navigator.getBattery) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, timeoutMs);
      navigator.getBattery().then(function (b) {
        if (done) return;
        done = true; clearTimeout(timer);
        resolve({ level: b.level, charging: b.charging });
      }, function () {
        if (done) return;
        done = true; clearTimeout(timer);
        resolve(null);
      });
    });
  }

  function webglCheck() {
    if (S.debug.has('noWebgl')) return null;
    try {
      var c = document.createElement('canvas');
      c.width = 1; c.height = 1;
      var gl = c.getContext('webgl2');
      if (gl) { release(gl); return 'webgl2'; }
      gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (gl) { release(gl); return 'webgl1'; }
      return 'none';
    } catch {
      return null;
    }
    function release(gl) {
      var ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
  }

  /** Collects every static signal. Missing values are null. */
  function collectStatic(timing) {
    if (S.debug.has('detectError')) return Promise.reject(new Error('Simulated detection failure'));

    var cpu = safe(function () {
      var v = navigator.hardwareConcurrency;
      return Number.isInteger(v) && v >= 1 && v <= 256 ? v : null;
    });
    var mem = safe(function () {
      var v = navigator.deviceMemory;
      return typeof v === 'number' && v > 0 && v <= 64 ? v : null;
    });
    var screenInfo = safe(function () {
      var w = window.screen && window.screen.width, h = window.screen && window.screen.height;
      var dpr = window.devicePixelRatio || 1;
      if (!(w > 0 && h > 0)) { w = window.innerWidth; h = window.innerHeight; }
      if (!(w > 0 && h > 0 && w <= 16384 && h <= 16384 && dpr >= 0.5 && dpr <= 8)) return null;
      return { width: w, height: h, dpr: Math.round(dpr * 100) / 100 };
    });
    var conn = safe(function () { return navigator.connection || null; });

    var signals = {
      cpuThreads: S.debug.has('noCpu') ? null : cpu,
      deviceMemoryGB: S.debug.has('noMemory') ? null : mem,
      screen: S.debug.has('noScreen') ? null : screenInfo,
      webgl: webglCheck(),
      fps: null,
      pointerCoarse: S.debug.has('touch') ? true : mq('(pointer: coarse)'),
      hover: mq('(hover: hover)'),
      viewportWidth: window.innerWidth,
      reducedMotion: mq('(prefers-reduced-motion: reduce)') === true,
      saveData: S.debug.has('saveData') ? true : conn && typeof conn.saveData === 'boolean' ? conn.saveData : null,
      effectiveType: S.debug.has('slowNetwork') ? '2g' : conn && conn.effectiveType ? conn.effectiveType : null,
      batteryLowNotCharging: false,
      battery: null
    };

    return readBattery(timing.batteryTimeoutMs).then(function (b) {
      signals.battery = b;
      signals.batteryLowNotCharging = !!(b && b.level <= S.config.scoring.batteryLowLevel && b.charging === false);
      return signals;
    });
  }

  /**
   * Fixed synthetic workload drawn on the given canvas; samples requestAnimationFrame.
   * Resolves { fps, completed, durationMs, frames }.
   */
  function runBenchmark(canvas, timing, onProgress) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssW = 320, cssH = 180;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);

    var palette = ['rgba(127,168,164,0.55)', 'rgba(167,155,196,0.5)', 'rgba(200,169,126,0.45)', 'rgba(110,128,160,0.5)'];
    var dots = [];
    for (var i = 0; i < 150; i++) {
      dots.push({ a: (i / 150) * Math.PI * 2, r: 20 + (i % 15) * 4.5, s: 0.6 + (i % 7) * 0.12, size: 2 + (i % 4), c: palette[i % 4] });
    }

    var aborted = false, resolveFn;
    var start = performance.now(), first = null, last = null, frames = 0;

    function finish(completed) {
      var now = performance.now();
      var fps = null;
      if (completed && frames > 1 && last > first) fps = Math.round(((frames - 1) / (last - first)) * 1000 * 10) / 10;
      if (S.debug.has('lowFps') && fps !== null) fps = 25;
      document.removeEventListener('visibilitychange', onVis);
      resolveFn({ fps: fps, completed: completed && fps !== null, durationMs: Math.round(now - start), frames: frames });
    }

    function onVis() {
      if (document.visibilityState === 'hidden' && !aborted) { aborted = true; finish(false); }
    }

    function frame(now) {
      if (aborted) return;
      var t = (now - start) / 1000;
      ctx.clearRect(0, 0, cssW, cssH);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        var ang = d.a + t * d.s;
        var x = cssW / 2 + Math.cos(ang) * d.r * 1.6;
        var y = cssH / 2 + Math.sin(ang * 1.3) * d.r * 0.9;
        ctx.beginPath();
        ctx.fillStyle = d.c;
        ctx.arc(x, y, d.size, 0, Math.PI * 2);
        ctx.fill();
      }

      var elapsed = now - start;
      if (elapsed >= timing.benchmarkWarmupMs) {
        if (first === null) first = now;
        last = now;
        frames++;
      }
      if (onProgress) onProgress(Math.min(1, elapsed / timing.benchmarkMaxMs));

      var windowMs = first === null ? 0 : now - first;
      var valid = windowMs >= timing.benchmarkMinWindowMs || frames >= timing.benchmarkMinFrames;
      if (elapsed >= timing.benchmarkMaxMs) {
        aborted = true;
        finish(valid);
        return;
      }
      requestAnimationFrame(frame);
    }

    var promise = new Promise(function (resolve) { resolveFn = resolve; });

    if (S.debug.has('noBenchmark') || S.debug.has('hiddenTab') || document.visibilityState === 'hidden') {
      aborted = true;
      setTimeout(function () { finish(false); }, S.debug.has('noBenchmark') ? timing.analysisHardLimitMs + 100 : 0);
    } else {
      document.addEventListener('visibilitychange', onVis);
      requestAnimationFrame(frame);
    }

    return {
      promise: promise,
      abort: function () { if (!aborted) { aborted = true; finish(false); } }
    };
  }

  S.detect = { collectStatic: collectStatic, runBenchmark: runBenchmark, mq: mq };
})(window.Sypher);
