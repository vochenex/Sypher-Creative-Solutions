/* Classifier: score band plus caps (Section 4.6 of the workflow document). Shared by browser and server. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Sypher = root.Sypher || {}; root.Sypher.classify = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ORDER = ['BASIC', 'MEDIUM', 'HIGH'];

  function lower(cls) { return ORDER[Math.max(0, ORDER.indexOf(cls) - 1)]; }

  /**
   * @param {object} scored result of score.compute
   * @param {object} s signals
   * @param {object} cfg scoring config ({ thresholds, touchCap, batteryLowLevel })
   */
  function classify(scored, s, cfg) {
    var t = cfg.thresholds, caps = [], verified = false;
    var fpsMissing = typeof s.fps !== 'number';

    if (scored.score === null) {
      return { cls: 'MEDIUM', appliedCaps: ['insufficientData'], benchmarkVerified: false, fallback: true };
    }

    var cls = scored.score >= t.high ? 'HIGH' : scored.score >= t.medium ? 'MEDIUM' : 'BASIC';

    if (scored.availableCount < 3 && fpsMissing) {
      cls = 'MEDIUM';
      caps.push('insufficientData');
    }

    if (cls === 'HIGH' && fpsMissing && scored.score < t.estimatedHigh) {
      cls = 'MEDIUM';
      caps.push('estimatedHighGuard');
    }

    if (cls === 'HIGH' && s.pointerCoarse === true && s.viewportWidth <= cfg.touchCap.maxViewportPx) {
      if (!fpsMissing && s.fps >= cfg.touchCap.exemptFps && s.webgl === cfg.touchCap.exemptWebgl) {
        verified = true;
      } else {
        cls = 'MEDIUM';
        caps.push('touchCap');
      }
    }

    var constraints = [];
    if (s.saveData === true) constraints.push('saveData');
    if (s.effectiveType === 'slow-2g' || s.effectiveType === '2g') constraints.push('slowNetwork');
    if (s.batteryLowNotCharging === true) constraints.push('lowBattery');
    if (constraints.length) {
      cls = lower(cls);
      caps = caps.concat(constraints);
    }

    return { cls: cls, appliedCaps: caps, benchmarkVerified: verified, fallback: false };
  }

  return { classify: classify, lower: lower, ORDER: ORDER };
});
