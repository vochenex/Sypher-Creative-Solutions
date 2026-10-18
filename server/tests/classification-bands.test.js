'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const classifier = require('../../public/js/classify');
const score = require('../../public/js/score');
const deviceProfile = require('../routes/device-profile');
const config = require('../config/modes.json');

const signals = {
  cpuThreads: 8, deviceMemoryGB: 8, screen: { width: 1920, height: 1080, dpr: 1 },
  webgl: 'webgl2', fps: 60, pointerCoarse: false, viewportWidth: 1440,
  saveData: false, effectiveType: '4g', batteryLowNotCharging: false
};

describe('80 / 60 performance score bands', () => {
  it('keeps the browser and server thresholds identical', () => {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/js/config.js'), 'utf8'), sandbox);
    const browser = sandbox.window.Sypher.config.scoring.thresholds;
    assert.equal(JSON.stringify(browser), JSON.stringify(config.scoring.thresholds));
    assert.equal(browser.high, 80);
    assert.equal(browser.medium, 60);
  });

  it('classifies every whole-number score from 0 through 100 into the requested band', () => {
    for (let value = 0; value <= 100; value++) {
      const expected = value >= 80 ? 'HIGH' : value >= 60 ? 'MEDIUM' : 'BASIC';
      const result = classifier.classify({ score: value, availableCount: 5 }, signals, config.scoring);
      assert.equal(result.cls, expected, 'score ' + value);
    }
  });

  it('uses the same boundaries when the FPS benchmark is unavailable', () => {
    for (const [value, expected] of [[59, 'BASIC'], [60, 'MEDIUM'], [79, 'MEDIUM'], [80, 'HIGH'], [100, 'HIGH']]) {
      const result = classifier.classify({ score: value, availableCount: 4 }, { ...signals, fps: null }, config.scoring);
      assert.equal(result.cls, expected);
    }
  });

  it('returns the same server classification for representative device measurements', () => {
    for (const sample of [
      { ...signals, cpuThreads: 4, deviceMemoryGB: 4, fps: 41 },
      { ...signals, cpuThreads: 6, deviceMemoryGB: 4, fps: 48 },
      signals
    ]) {
      const measured = score.compute(sample, config.scoring.weights, true);
      const expected = measured.score >= 80 ? 'HIGH' : measured.score >= 60 ? 'MEDIUM' : 'BASIC';
      const response = deviceProfile({ signals: sample, benchmark: { completed: true } }, config);
      assert.equal(response.class, expected);
      assert.equal(response.score, measured.score);
    }
  });
});
