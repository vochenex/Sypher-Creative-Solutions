'use strict';

/**
 * Stage 3 regression: F4 (classification confidence / missing data) and
 * F13 (configurable weights, scores clamped 0–100, no sparse renormalization).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const score = require('../../public/js/score.js');
const classify = require('../../public/js/classify.js');
const modesConfig = require('../config/modes.json');
const deviceProfile = require('../routes/device-profile');
const { createServer } = require('../server');

const WEIGHTS = modesConfig.scoring.weights;
const SCORING = modesConfig.scoring;

function signals(partial) {
  return Object.assign({
    cpuThreads: null,
    deviceMemoryGB: null,
    screen: null,
    webgl: null,
    fps: null,
    pointerCoarse: false,
    viewportWidth: 1440,
    saveData: false,
    effectiveType: '4g',
    batteryLowNotCharging: false
  }, partial);
}

function run(partial, weights, completed) {
  const s = signals(partial);
  const scored = score.compute(s, weights || WEIGHTS, completed !== false);
  const result = classify.classify(scored, s, SCORING);
  return { s, scored, result };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    server.on('error', reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function postJson(port, reqPath, body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch { /* ignore */ }
        resolve({ status: res.statusCode, body: raw, json });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

describe('F13 scoring weights and 0–100 bounds', () => {
  it('keeps client and server scoring modules identical', () => {
    const client = fs.readFileSync(path.join(__dirname, '../../public/js/score.js'), 'utf8');
    const serverCopy = require.resolve('../../public/js/score.js');
    assert.equal(path.resolve(serverCopy), path.resolve(path.join(__dirname, '../../public/js/score.js')));
    assert.match(client, /coverage/);
    assert.match(client, /normalizeWeights/);
    assert.doesNotMatch(client, /earned \/ availableMax/);
  });

  it('keeps modes.json and bundled config.js scoring in sync', () => {
    const bundled = fs.readFileSync(path.join(__dirname, '../../public/js/config.js'), 'utf8');
    assert.match(bundled, /"configVersion": "2026-10-18\.4"/);
    assert.match(bundled, /"minCoverageHigh": 0\.6/);
    assert.match(bundled, /"requireHardwareHintForHigh": true/);
    assert.match(bundled, /"requireFpsForHigh": true/);
    assert.match(bundled, /"liveDowngradeCooldownMs": 12000/);
    assert.equal(modesConfig.configVersion, '2026-10-18.4');
    assert.deepEqual(modesConfig.scoring.weights, {
      cpu: 30, memory: 20, screen: 0, webgl: 0, fps: 50
    });
  });

  const matrix = [
    {
      name: 'strong device with full evidence',
      partial: { cpuThreads: 12, deviceMemoryGB: 8, webgl: 'webgl2', fps: 60 },
      expectClass: 'HIGH',
      minScore: 75,
      minCoverage: 0.99
    },
    {
      name: 'moderate device',
      partial: { cpuThreads: 4, deviceMemoryGB: 4, webgl: 'webgl1', fps: 45 },
      expectClass: 'MEDIUM',
      minScore: 40,
      maxScore: 74,
      minCoverage: 0.99
    },
    {
      name: 'limited device',
      partial: { cpuThreads: 2, deviceMemoryGB: 2, webgl: 'none', fps: 22 },
      expectClass: 'BASIC',
      maxScore: 39,
      minCoverage: 0.99
    },
    {
      name: 'FPS-only sparse sample must not renormalize to 100 or reach High',
      partial: { fps: 60 },
      expectClass: 'MEDIUM',
      maxScore: 55,
      maxCoverage: 0.51,
      forbidClass: 'HIGH'
    },
    {
      name: 'missing memory still scores without inflating',
      partial: { cpuThreads: 8, webgl: 'webgl2', fps: 60 },
      // quality(8 threads)=0.8 × 30 + 50 fps = 74 → Medium; coverage 0.8
      expectClass: 'MEDIUM',
      maxScore: 74,
      minCoverage: 0.79,
      maxCoverage: 0.81
    },
    {
      name: 'missing CPU still scores without inflating',
      partial: { deviceMemoryGB: 8, webgl: 'webgl2', fps: 60 },
      // quality(8GB)=0.9 × 20 + 50 = 68 → Medium; coverage 0.7
      expectClass: 'MEDIUM',
      maxScore: 74,
      minCoverage: 0.69,
      maxCoverage: 0.71
    },
    {
      name: 'all signals unavailable falls back to BASIC',
      partial: {},
      expectClass: 'BASIC',
      expectScoreNull: true,
      expectCoverage: 0,
      expectConfidence: 'none',
      fallback: true
    }
  ];

  for (const row of matrix) {
    it(row.name, () => {
      const { scored, result } = run(row.partial);
      if (row.expectScoreNull) assert.equal(scored.score, null);
      else {
        assert.equal(typeof scored.score, 'number');
        assert.ok(scored.score >= 0 && scored.score <= 100);
      }
      if (row.minScore != null) assert.ok(scored.score >= row.minScore, `score ${scored.score} < ${row.minScore}`);
      if (row.maxScore != null) assert.ok(scored.score <= row.maxScore, `score ${scored.score} > ${row.maxScore}`);
      if (row.minCoverage != null) assert.ok(scored.coverage >= row.minCoverage);
      if (row.maxCoverage != null) assert.ok(scored.coverage <= row.maxCoverage);
      if (row.expectCoverage != null) assert.equal(scored.coverage, row.expectCoverage);
      assert.equal(result.cls, row.expectClass);
      if (row.forbidClass) assert.notEqual(result.cls, row.forbidClass);
      if (row.expectConfidence) assert.equal(result.confidence, row.expectConfidence);
      if (row.fallback) assert.equal(result.fallback, true);
      if (row.expectCaps) {
        for (const cap of row.expectCaps) assert.ok(result.appliedCaps.includes(cap), `missing cap ${cap}`);
      }
    });
  }

  it('clamps score to 0–100 even with oversized custom weights before normalization', () => {
    const big = { cpu: 1000, memory: 1000, screen: 0, webgl: 0, fps: 2000 };
    const { scored } = run({
      cpuThreads: 16, deviceMemoryGB: 16, webgl: 'webgl2', fps: 120
    }, big);
    assert.ok(scored.score >= 0 && scored.score <= 100);
    const sum = Object.values(scored.max).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 0.01);
  });

  it('falls back to default weights when all configured weights are invalid', () => {
    const norm = score.normalizeWeights({ cpu: -1, memory: NaN, screen: 'x', webgl: null, fps: 0 });
    assert.equal(Math.round(norm.weights.cpu + norm.weights.memory + norm.weights.fps), 100);
    assert.equal(norm.weights.screen, 0);
    assert.equal(norm.weights.webgl, 0);
  });

  it('custom relative weights change contributions but stay on a 0–100 scale', () => {
    const fpsHeavy = { cpu: 10, memory: 10, screen: 0, webgl: 0, fps: 80 };
    const cpuHeavy = { cpu: 80, memory: 10, screen: 0, webgl: 0, fps: 10 };
    const partial = { cpuThreads: 2, deviceMemoryGB: 8, fps: 60 };
    const a = score.compute(signals(partial), fpsHeavy, true);
    const b = score.compute(signals(partial), cpuHeavy, true);
    assert.ok(a.score >= 0 && a.score <= 100);
    assert.ok(b.score >= 0 && b.score <= 100);
    assert.notEqual(a.score, b.score);
    assert.ok(a.breakdown.fps > b.breakdown.fps);
    assert.ok(b.breakdown.cpu > a.breakdown.cpu);
  });

  it('zero-weight signals never contribute points even when present', () => {
    const { scored } = run({
      cpuThreads: 8, deviceMemoryGB: 8, screen: { width: 3840, height: 2160, dpr: 2 },
      webgl: 'webgl2', fps: 60
    });
    assert.equal(scored.max.screen, 0);
    assert.equal(scored.max.webgl, 0);
    assert.equal(scored.breakdown.screen, 0);
    assert.equal(scored.breakdown.webgl, 0);
    assert.ok(scored.coverage >= 0.99);
  });
});

describe('F4 classification accuracy, confidence, and missing-data handling', () => {
  it('does not promote FPS-only evidence into High via renormalization', () => {
    // Old bug: renormalize FPS-only to ~100 → HIGH. New: quality×weight ≈ 50, coverage 0.5.
    const { scored, result } = run({ fps: 60 });
    assert.ok(scored.score !== null && scored.score <= 55);
    assert.ok(scored.coverage <= 0.51);
    assert.notEqual(result.cls, 'HIGH');
    assert.equal(result.cls, 'MEDIUM');
  });

  it('falls back to Basic when no scored signals exist (never Medium)', () => {
    const { result } = run({});
    assert.equal(result.cls, 'BASIC');
    assert.equal(result.fallback, true);
    assert.equal(result.confidence, 'none');
    assert.ok(result.appliedCaps.includes('insufficientData'));
  });

  it('withholds High without a hardware hint even when FPS is perfect', () => {
    const { scored, result } = run({
      screen: { width: 1920, height: 1080, dpr: 1 },
      webgl: 'webgl2',
      fps: 60
    }, { cpu: 0, memory: 0, screen: 20, webgl: 20, fps: 60 });
    // Coverage can be high, but High still requires CPU/memory evidence.
    assert.ok(scored.coverage >= 0.6);
    assert.equal(scored.hasHardwareHint, false);
    assert.notEqual(result.cls, 'HIGH');
    assert.ok(result.appliedCaps.includes('noHardwareHint') || result.cls === 'MEDIUM' || result.cls === 'BASIC');
  });

  it('withholds High when frame observation is missing', () => {
    const { result } = run({
      cpuThreads: 12, deviceMemoryGB: 8, webgl: 'webgl2', fps: null
    }, WEIGHTS, false);
    assert.notEqual(result.cls, 'HIGH');
    assert.ok(result.appliedCaps.includes('estimatedHighGuard') || result.cls === 'MEDIUM' || result.cls === 'BASIC');
  });

  it('assigns confidence from coverage and FPS completeness', () => {
    const high = run({ cpuThreads: 12, deviceMemoryGB: 8, fps: 60 });
    assert.equal(high.result.confidence, 'high');
    assert.ok(high.scored.coverage >= 0.6);

    // FPS-only: coverage 0.5 → medium confidence (below High coverage floor).
    const med = run({ fps: 60 });
    assert.equal(med.result.confidence, 'medium');
    assert.ok(med.scored.coverage >= 0.35 && med.scored.coverage < 0.6);

    // Partial CPU without FPS: coverage 0.25 → low confidence.
    const low = run({ cpuThreads: 8 }, WEIGHTS, false);
    assert.equal(low.result.confidence, 'low');
    assert.ok(low.scored.coverage > 0 && low.scored.coverage < 0.35);

    const none = run({});
    assert.equal(none.result.confidence, 'none');
  });

  it('applies resource constraints by lowering one level', () => {
    const base = run({ cpuThreads: 12, deviceMemoryGB: 8, fps: 60 });
    assert.equal(base.result.cls, 'HIGH');
    const capped = run({
      cpuThreads: 12, deviceMemoryGB: 8, fps: 60, saveData: true
    });
    assert.equal(capped.result.cls, 'MEDIUM');
    assert.ok(capped.result.appliedCaps.includes('saveData'));
  });

  it('API device-profile returns coverage and confidence and never invents High from FPS alone', async () => {
    const server = createServer();
    const port = await listen(server);
    try {
      const sparse = await postJson(port, '/api/device-profile', {
        signals: { fps: 60, cpuThreads: null, deviceMemoryGB: null, screen: null, webgl: null },
        benchmark: { completed: true, durationMs: 1000 }
      });
      assert.equal(sparse.status, 200);
      assert.ok(sparse.json.score == null || sparse.json.score <= 55);
      assert.ok(sparse.json.coverage <= 0.51);
      assert.notEqual(sparse.json.class, 'HIGH');
      assert.ok(sparse.json.class === 'BASIC' || sparse.json.class === 'MEDIUM');
      assert.ok(['low', 'none', 'medium', 'high'].includes(sparse.json.confidence));

      const empty = await postJson(port, '/api/device-profile', {
        signals: {},
        benchmark: { completed: false, durationMs: 0 }
      });
      assert.equal(empty.status, 200);
      assert.equal(empty.json.class, 'BASIC');
      assert.equal(empty.json.score, null);
      assert.equal(empty.json.coverage, 0);
      assert.equal(empty.json.confidence, 'none');

      const strong = await postJson(port, '/api/device-profile', {
        signals: {
          cpuThreads: 12,
          deviceMemoryGB: 8,
          screen: { width: 1920, height: 1080, dpr: 1 },
          webgl: 'webgl2',
          fps: 60,
          pointerCoarse: false,
          viewportWidth: 1440,
          saveData: false,
          effectiveType: '4g',
          batteryLowNotCharging: false
        },
        benchmark: { completed: true, durationMs: 1200 }
      });
      assert.equal(strong.status, 200);
      assert.equal(strong.json.class, 'HIGH');
      assert.ok(strong.json.score >= 75 && strong.json.score <= 100);
      assert.ok(strong.json.coverage >= 0.99);
      assert.equal(strong.json.confidence, 'high');
      assert.equal(strong.json.configVersion, '2026-10-18.4');
    } finally {
      await close(server);
    }
  });

  it('shared route helper matches classify output for the same payload', () => {
    const body = {
      signals: { cpuThreads: 4, deviceMemoryGB: 4, webgl: 'webgl1', fps: 40 },
      benchmark: { completed: true, durationMs: 1100 }
    };
    const api = deviceProfile(body, modesConfig);
    const local = run(body.signals);
    assert.equal(api.class, local.result.cls);
    assert.equal(api.score, local.scored.score);
    assert.equal(api.coverage, local.scored.coverage);
    assert.equal(api.confidence, local.result.confidence);
  });

  it('missing only deviceMemory does not exclude a strong High candidate', () => {
    const { scored, result } = run({
      cpuThreads: 12, deviceMemoryGB: null, webgl: 'webgl2', fps: 60
    });
    assert.equal(scored.hasHardwareHint, true);
    assert.ok(scored.score >= 75, `score ${scored.score}`);
    assert.ok(scored.coverage >= 0.6);
    assert.equal(result.cls, 'HIGH');
  });

  it('missing only hardwareConcurrency keeps honest Medium when memory+FPS cannot clear High', () => {
    // No threads: memory×20 + fps×50 tops out near 68 with default weights — not invented High.
    const { scored, result } = run({
      cpuThreads: null, deviceMemoryGB: 8, webgl: 'webgl2', fps: 60
    });
    assert.equal(scored.hasHardwareHint, true);
    assert.ok(scored.coverage >= 0.6);
    assert.equal(result.cls, 'MEDIUM');
    assert.ok(scored.score < 75);
  });

  it('touch + large viewport does not auto-classify as weak', () => {
    const { result } = run({
      cpuThreads: 12, deviceMemoryGB: 8, webgl: 'webgl2', fps: 60,
      pointerCoarse: true, viewportWidth: 1440
    });
    assert.equal(result.cls, 'HIGH');
    assert.ok(!result.appliedCaps.includes('touchCap'));
  });

  it('unavailable FPS falls back to estimated Medium for strong hardware (no invented High)', () => {
    const { scored, result } = run({
      cpuThreads: 12, deviceMemoryGB: 8, webgl: 'webgl2', fps: null
    }, WEIGHTS, false);
    assert.ok(scored.score !== null && scored.score <= 55);
    assert.ok(scored.coverage <= 0.51);
    assert.notEqual(result.cls, 'HIGH');
    assert.equal(result.cls, 'MEDIUM');
    assert.equal(result.confidence, 'medium');
  });
});
