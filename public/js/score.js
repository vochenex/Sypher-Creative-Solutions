/* Scoring Engine: converts signals to points, rescales around missing signals. Shared by browser and server. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Sypher = root.Sypher || {}; root.Sypher.score = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIGNAL_KEYS = ['cpu', 'memory', 'screen', 'webgl', 'fps'];

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function cpuPoints(t) {
    if (t >= 12) return 25;
    if (t >= 8) return 20;
    if (t >= 6) return 15;
    if (t >= 4) return 9;
    if (t >= 2) return 4;
    return 0;
  }

  function memoryPoints(gb) {
    if (gb >= 8) return 20;
    if (gb >= 4) return 12;
    if (gb >= 2) return 6;
    return 0;
  }

  function physicalPixels(screen) {
    return screen.width * screen.height * screen.dpr * screen.dpr;
  }

  function screenPoints(screen, cpu, memory) {
    var mp = physicalPixels(screen) / 1e6;
    var pts = mp <= 2.1 ? 10 : mp <= 4.2 ? 8 : mp <= 8.3 ? 5 : 2;
    var weak = (isNum(cpu) && cpu <= 4) || (isNum(memory) && memory <= 4);
    if (mp > 2.1 && weak) pts = Math.max(0, pts - 3);
    return pts;
  }

  function webglPoints(w) {
    if (w === 'webgl2') return 15;
    if (w === 'webgl1') return 8;
    return 0;
  }

  function fpsPoints(fps) {
    if (fps >= 55) return 30;
    if (fps >= 45) return 22;
    if (fps >= 30) return 12;
    return 3;
  }

  /**
   * @param {object} s signals ({ cpuThreads, deviceMemoryGB, screen, webgl, fps })
   * @param {object} weights max points per signal
   * @param {boolean} benchmarkCompleted
   */
  function compute(s, weights, benchmarkCompleted) {
    weights = weights || { cpu: 25, memory: 20, screen: 10, webgl: 15, fps: 30 };
    var cpu = isNum(s.cpuThreads) ? s.cpuThreads : null;
    var mem = isNum(s.deviceMemoryGB) ? s.deviceMemoryGB : null;
    var scr = s.screen && isNum(s.screen.width) && isNum(s.screen.height) && isNum(s.screen.dpr) ? s.screen : null;
    var gl = s.webgl === 'webgl2' || s.webgl === 'webgl1' || s.webgl === 'none' ? s.webgl : null;
    var fps = isNum(s.fps) ? s.fps : null;

    var breakdown = {
      cpu: cpu === null ? null : cpuPoints(cpu),
      memory: mem === null ? null : memoryPoints(mem),
      screen: scr === null ? null : screenPoints(scr, cpu, mem),
      webgl: gl === null ? null : webglPoints(gl),
      fps: fps === null ? null : fpsPoints(fps)
    };

    var earned = 0, availableMax = 0, available = 0, missing = [];
    SIGNAL_KEYS.forEach(function (k) {
      if (breakdown[k] === null) { missing.push(k); return; }
      earned += breakdown[k];
      availableMax += weights[k];
      available++;
    });

    var score = availableMax > 0 ? Math.round((earned / availableMax) * 100) : null;
    return {
      score: score,
      breakdown: breakdown,
      max: weights,
      missingScored: missing,
      availableCount: available,
      estimated: !benchmarkCompleted || available < 3,
      physicalMegapixels: scr ? Math.round(physicalPixels(scr) / 1e5) / 10 : null
    };
  }

  return { compute: compute, SIGNAL_KEYS: SIGNAL_KEYS };
});
