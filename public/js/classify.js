/* Classifier: score + coverage + constraints. Shared by browser and server.
   High requires independent evidence (coverage + hardware hint + frame observation).
   Insufficient data never upgrades a weak score to Medium. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Sypher = root.Sypher || {}; root.Sypher.classify = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ORDER = ['BASIC', 'MEDIUM', 'HIGH'];

  function lower(cls) { return ORDER[Math.max(0, ORDER.indexOf(cls) - 1)]; }

  function defaults(cfg) {
    cfg = cfg || {};
    var t = cfg.thresholds || {};
    return {
      high: typeof t.high === 'number' ? t.high : 75,
      medium: typeof t.medium === 'number' ? t.medium : 40,
      minCoverageHigh: typeof cfg.minCoverageHigh === 'number' ? cfg.minCoverageHigh : 0.6,
      minCoverageMedium: typeof cfg.minCoverageMedium === 'number' ? cfg.minCoverageMedium : 0.35,
      requireHardwareHintForHigh: cfg.requireHardwareHintForHigh !== false,
      requireFpsForHigh: cfg.requireFpsForHigh !== false,
      touchCap: cfg.touchCap || null,
      batteryLowLevel: cfg.batteryLowLevel
    };
  }

  /**
   * @param {object} scored result of score.compute
   * @param {object} s signals
   * @param {object} cfg scoring config
   */
  function classify(scored, s, cfg) {
    var c = defaults(cfg);
    var caps = [];
    var verified = false;
    var fpsMissing = typeof s.fps !== 'number';
    var coverage = typeof scored.coverage === 'number' ? scored.coverage : 0;

    if (scored.score === null || scored.availableCount === 0) {
      return {
        cls: 'BASIC',
        appliedCaps: ['insufficientData'],
        benchmarkVerified: false,
        fallback: true,
        confidence: 'none',
        reasons: ['No scored capability signals were available.']
      };
    }

    var cls = scored.score >= c.high ? 'HIGH' : scored.score >= c.medium ? 'MEDIUM' : 'BASIC';
    var reasons = [];

    // Low coverage cannot independently trigger High.
    if (cls === 'HIGH' && coverage < c.minCoverageHigh) {
      cls = coverage >= c.minCoverageMedium && scored.score >= c.medium ? 'MEDIUM' : 'BASIC';
      caps.push('lowCoverage');
      reasons.push('Evidence coverage was below the High threshold.');
    }

    if (cls === 'HIGH' && c.requireHardwareHintForHigh && !scored.hasHardwareHint) {
      cls = 'MEDIUM';
      caps.push('noHardwareHint');
      reasons.push('High requires at least one hardware hint (threads or memory).');
    }

    if (cls === 'HIGH' && c.requireFpsForHigh && fpsMissing) {
      cls = scored.score >= c.medium ? 'MEDIUM' : 'BASIC';
      caps.push('estimatedHighGuard');
      reasons.push('High requires a completed frame observation.');
    }

    // Sparse evidence: never promote a weak/BASIC score upward. Low coverage demotes Medium.
    if (cls === 'MEDIUM' && coverage < c.minCoverageMedium) {
      cls = 'BASIC';
      caps.push('insufficientData');
      reasons.push('Evidence coverage was too low for a Medium recommendation.');
    }

    // Touch/viewport is not a power judgment. It only blocks High when frame evidence is weak.
    if (
      cls === 'HIGH' &&
      c.touchCap &&
      s.pointerCoarse === true &&
      typeof s.viewportWidth === 'number' &&
      s.viewportWidth <= c.touchCap.maxViewportPx
    ) {
      if (!fpsMissing && s.fps >= c.touchCap.exemptFps && s.webgl === c.touchCap.exemptWebgl) {
        verified = true;
      } else if (fpsMissing || s.fps < (c.touchCap.exemptFps || 58)) {
        cls = 'MEDIUM';
        caps.push('touchCap');
        reasons.push('Small touch viewport without strong frame evidence stays on Medium.');
      }
    }

    var constraints = [];
    if (s.saveData === true) constraints.push('saveData');
    if (s.effectiveType === 'slow-2g' || s.effectiveType === '2g') constraints.push('slowNetwork');
    if (s.batteryLowNotCharging === true) constraints.push('lowBattery');
    if (constraints.length) {
      cls = lower(cls);
      caps = caps.concat(constraints);
      reasons.push('Resource-saving constraints lowered the recommendation.');
    }

    var confidence =
      coverage >= c.minCoverageHigh && !fpsMissing ? 'high' :
      coverage >= c.minCoverageMedium ? 'medium' :
      coverage > 0 ? 'low' : 'none';

    return {
      cls: cls,
      appliedCaps: caps,
      benchmarkVerified: verified,
      fallback: false,
      confidence: confidence,
      reasons: reasons
    };
  }

  return { classify: classify, lower: lower, ORDER: ORDER, defaults: defaults };
});
