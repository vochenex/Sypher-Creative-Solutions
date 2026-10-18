/* Scoring Engine: normalized 0–1 qualities × configured weights → score 0–100 + coverage.
   Shared by browser and server. Missing signals contribute 0 and reduce coverage; they do not
   renormalize a sparse sample into a perfect score. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Sypher = root.Sypher || {}; root.Sypher.score = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIGNAL_KEYS = ['cpu', 'memory', 'screen', 'webgl', 'fps'];
  var DEFAULT_WEIGHTS = { cpu: 25, memory: 25, screen: 0, webgl: 0, fps: 50 };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /** Clamp and sanitize weight map. Invalid/negative entries become 0; empty map uses defaults. */
  function normalizeWeights(weights) {
    var src = weights && typeof weights === 'object' ? weights : DEFAULT_WEIGHTS;
    var out = {};
    var sum = 0;
    SIGNAL_KEYS.forEach(function (k) {
      var w = src[k];
      var n = typeof w === 'number' && isFinite(w) && w > 0 ? w : 0;
      out[k] = n;
      sum += n;
    });
    if (sum <= 0) {
      out = Object.assign({}, DEFAULT_WEIGHTS);
      sum = SIGNAL_KEYS.reduce(function (a, k) { return a + out[k]; }, 0);
    }
    // Scale so configured weights sum to 100 while preserving relative importance.
    var scale = 100 / sum;
    var scaled = {};
    SIGNAL_KEYS.forEach(function (k) { scaled[k] = out[k] * scale; });
    return { weights: scaled, rawSum: sum };
  }

  /** Logical-thread quality 0–1 (coarse scheduling hint, never exact power). */
  function cpuQuality(t) {
    if (t <= 2) return 0.2;
    if (t <= 4) return 0.45;
    if (t <= 6) return 0.65;
    if (t < 8) return 0.72;
    if (t < 12) return 0.8;
    return 0.88;
  }

  /** Approximate deviceMemory quality 0–1. */
  function memoryQuality(gb) {
    if (gb <= 1) return 0.1;
    if (gb <= 2) return 0.35;
    if (gb < 4) return 0.5;
    if (gb < 8) return 0.65;
    return 0.9;
  }

  /**
   * Screen is a layout/resource hint, not a power meter. Kept near-neutral so it cannot
   * alone drive High when its weight is non-zero in a custom config.
   */
  function screenQuality(screen) {
    var mp = (screen.width * screen.height * screen.dpr * screen.dpr) / 1e6;
    if (mp <= 2.5) return 0.7;
    if (mp <= 5) return 0.55;
    if (mp <= 9) return 0.4;
    return 0.25;
  }

  /** WebGL support gates effects; quality is support depth, not GPU power. */
  function webglQuality(w) {
    if (w === 'webgl2') return 0.85;
    if (w === 'webgl1') return 0.45;
    return 0.05;
  }

  /** Passive/observed frame cadence quality 0–1. */
  function fpsQuality(fps) {
    if (fps >= 55) return 1;
    if (fps >= 45) return 0.75;
    if (fps >= 30) return 0.45;
    if (fps >= 20) return 0.2;
    return 0.05;
  }

  function physicalPixels(screen) {
    return screen.width * screen.height * screen.dpr * screen.dpr;
  }

  /**
   * @param {object} s signals ({ cpuThreads, deviceMemoryGB, screen, webgl, fps })
   * @param {object} weights configured max contribution per signal (any positive relative scale)
   * @param {boolean} benchmarkCompleted whether an FPS observation finished
   */
  function compute(s, weights, benchmarkCompleted) {
    var norm = normalizeWeights(weights);
    var w = norm.weights;

    var cpu = isNum(s.cpuThreads) ? s.cpuThreads : null;
    var mem = isNum(s.deviceMemoryGB) ? s.deviceMemoryGB : null;
    var scr = s.screen && isNum(s.screen.width) && isNum(s.screen.height) && isNum(s.screen.dpr) ? s.screen : null;
    var gl = s.webgl === 'webgl2' || s.webgl === 'webgl1' || s.webgl === 'none' ? s.webgl : null;
    var fps = isNum(s.fps) ? s.fps : null;

    var quality = {
      cpu: cpu === null ? null : cpuQuality(cpu),
      memory: mem === null ? null : memoryQuality(mem),
      screen: scr === null ? null : screenQuality(scr),
      webgl: gl === null ? null : webglQuality(gl),
      fps: fps === null ? null : fpsQuality(fps)
    };

    // Point contributions = quality × weight. Missing signals add 0 and are omitted from coverage.
    var breakdown = {};
    var earned = 0;
    var availableWeight = 0;
    var available = 0;
    var missing = [];

    SIGNAL_KEYS.forEach(function (k) {
      if (quality[k] === null || w[k] <= 0) {
        // Zero-weight signals are informational only when present.
        if (quality[k] === null) missing.push(k);
        breakdown[k] = quality[k] === null ? null : Math.round(quality[k] * w[k] * 10) / 10;
        return;
      }
      var pts = quality[k] * w[k];
      breakdown[k] = Math.round(pts * 10) / 10;
      earned += pts;
      availableWeight += w[k];
      available++;
    });

    var score = available === 0 ? null : Math.max(0, Math.min(100, Math.round(earned)));
    var coverage = available === 0 ? 0 : availableWeight / 100;
    var hasHardwareHint = cpu !== null || mem !== null;

    return {
      score: score,
      coverage: Math.round(coverage * 1000) / 1000,
      quality: quality,
      breakdown: breakdown,
      max: w,
      missingScored: missing,
      availableCount: available,
      availableWeight: availableWeight,
      hasHardwareHint: hasHardwareHint,
      estimated: !benchmarkCompleted || coverage < 0.6,
      physicalMegapixels: scr ? Math.round(physicalPixels(scr) / 1e5) / 10 : null
    };
  }

  return {
    compute: compute,
    SIGNAL_KEYS: SIGNAL_KEYS,
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    normalizeWeights: normalizeWeights,
    cpuQuality: cpuQuality,
    memoryQuality: memoryQuality,
    fpsQuality: fpsQuality
  };
});
