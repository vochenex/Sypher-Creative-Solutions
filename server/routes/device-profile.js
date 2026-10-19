'use strict';

const score = require('../../public/js/score.js');
const classify = require('../../public/js/classify.js');
const { HttpError } = require('../lib/http');

const WEBGL = ['webgl2', 'webgl1', 'none', null];
const EFFECTIVE = ['slow-2g', '2g', '3g', '4g', null];

function check(cond, field, message) {
  if (!cond) throw new HttpError(400, 'INVALID_PAYLOAD', `${field} ${message}`, field);
}

function nullableNumber(v, min, max) {
  return v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max);
}

function nullableBool(v) {
  return v === null || v === undefined || typeof v === 'boolean';
}

function validate(body) {
  check(body && typeof body === 'object', 'body', 'must be an object');
  const s = body.signals;
  check(s && typeof s === 'object', 'signals', 'is required');
  check(s.cpuThreads === null || s.cpuThreads === undefined || (Number.isInteger(s.cpuThreads) && s.cpuThreads >= 1 && s.cpuThreads <= 256),
    'signals.cpuThreads', 'must be an integer between 1 and 256 or null');
  check(nullableNumber(s.deviceMemoryGB, 0.1, 64), 'signals.deviceMemoryGB', 'must be a number between 0.1 and 64 or null');
  if (s.screen !== null && s.screen !== undefined) {
    check(typeof s.screen === 'object', 'signals.screen', 'must be an object or null');
    check(Number.isInteger(s.screen.width) && s.screen.width >= 1 && s.screen.width <= 16384, 'signals.screen.width', 'must be an integer between 1 and 16384');
    check(Number.isInteger(s.screen.height) && s.screen.height >= 1 && s.screen.height <= 16384, 'signals.screen.height', 'must be an integer between 1 and 16384');
    check(typeof s.screen.dpr === 'number' && s.screen.dpr >= 0.5 && s.screen.dpr <= 8, 'signals.screen.dpr', 'must be between 0.5 and 8');
  }
  check(WEBGL.includes(s.webgl === undefined ? null : s.webgl), 'signals.webgl', 'must be webgl2, webgl1, none, or null');
  check(nullableNumber(s.fps, 0, 500), 'signals.fps', 'must be between 0 and 500 or null');
  check(EFFECTIVE.includes(s.effectiveType === undefined ? null : s.effectiveType), 'signals.effectiveType', 'is not a known connection type');
  ['pointerCoarse', 'reducedMotion', 'saveData', 'batteryLowNotCharging'].forEach((k) => check(nullableBool(s[k]), `signals.${k}`, 'must be a boolean or null'));
  check(nullableNumber(s.viewportWidth, 1, 16384), 'signals.viewportWidth', 'must be between 1 and 16384');
  check(body.benchmark && typeof body.benchmark.completed === 'boolean', 'benchmark.completed', 'is required (boolean)');
}

function norm(v) { return v === undefined ? null : v; }

module.exports = function deviceProfile(body, modesConfig) {
  validate(body);
  const s = body.signals;
  const signals = {
    cpuThreads: norm(s.cpuThreads),
    deviceMemoryGB: norm(s.deviceMemoryGB),
    screen: norm(s.screen),
    webgl: norm(s.webgl),
    fps: body.benchmark.completed ? norm(s.fps) : null,
    pointerCoarse: norm(s.pointerCoarse),
    viewportWidth: s.viewportWidth || 0,
    saveData: norm(s.saveData),
    effectiveType: norm(s.effectiveType),
    batteryLowNotCharging: s.batteryLowNotCharging === true
  };

  const scored = score.compute(signals, modesConfig.scoring.weights, body.benchmark.completed);
  const result = classify.classify(scored, signals, modesConfig.scoring);
  const mode = result.cls.toLowerCase();

  const missing = [];
  if (signals.cpuThreads === null) missing.push('cpuThreads');
  if (signals.deviceMemoryGB === null) missing.push('deviceMemory');
  if (signals.screen === null) missing.push('screen');
  if (signals.webgl === null) missing.push('webgl');
  if (signals.fps === null) missing.push('fps');
  if (signals.saveData === null) missing.push('saveData');
  if (signals.effectiveType === null) missing.push('effectiveType');

  return {
    score: scored.score,
    coverage: scored.coverage,
    confidence: result.confidence,
    class: result.cls,
    estimated: scored.estimated || result.fallback,
    benchmarkVerified: result.benchmarkVerified,
    breakdown: scored.breakdown,
    quality: scored.quality,
    appliedCaps: result.appliedCaps,
    reasons: result.reasons || [],
    missingSignals: missing,
    mode,
    source: 'auto',
    confirmed: true,
    configVersion: modesConfig.configVersion,
    flags: modesConfig.modes[mode]
  };
};
