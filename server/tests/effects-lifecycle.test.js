'use strict';

/**
 * Stage 3 regression: F5 asynchronous High-effect loading races and cleanup.
 * Controllers and high-effects modules are inspected for generation tokens and
 * refuse-to-start guards; a small epoch harness models the race window.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createServer } = require('../server');

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

function get(port, reqPath) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: reqPath }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    }).on('error', reject);
  });
}

/** Models controller applyAssets epoch + deferred High start. */
function createEpochHarness() {
  let effectsEpoch = 0;
  let mode = 'basic';
  let motion = 'full';
  let active = false;
  const starts = [];
  const stops = [];

  function wantsHigh() {
    return mode === 'high' && motion === 'full';
  }

  function applyAssets() {
    const epoch = ++effectsEpoch;
    if (wantsHigh()) {
      return Promise.resolve().then(() => {
        if (epoch !== effectsEpoch) return;
        if (!wantsHigh()) {
          active = false;
          stops.push({ reason: 'stale-want', epoch });
          return;
        }
        active = true;
        starts.push({ epoch });
      });
    }
    if (active) {
      active = false;
      stops.push({ reason: 'leave-high', epoch });
    }
    return Promise.resolve();
  }

  return {
    setMode(m) { mode = m; return applyAssets(); },
    setMotion(m) { motion = m; return applyAssets(); },
    isActive() { return active; },
    starts: () => starts.slice(),
    stops: () => stops.slice(),
    epoch: () => effectsEpoch
  };
}

describe('F5 High-effect loading races and cleanup', () => {
  let server;
  let port;
  let controllerSrc;
  let effectsSrc;

  before(async () => {
    server = createServer();
    port = await listen(server);
    controllerSrc = fs.readFileSync(path.join(__dirname, '../../public/js/controller.js'), 'utf8');
    effectsSrc = fs.readFileSync(path.join(__dirname, '../../public/js/effects/high-effects.js'), 'utf8');
  });

  after(async () => {
    await close(server);
  });

  it('ships generation-token guards in the controller', () => {
    assert.match(controllerSrc, /var effectsEpoch = 0/);
    assert.match(controllerSrc, /var epoch = \+\+effectsEpoch/);
    assert.match(controllerSrc, /if \(epoch !== effectsEpoch\) return/);
    assert.match(controllerSrc, /wantsHighEffects/);
    assert.match(controllerSrc, /getEpoch:\s*function\s*\(\)\s*\{\s*return effectsEpoch/);
    assert.match(controllerSrc, /liveDowngradeCooldownMs/);
  });

  it('high-effects refuse stale epochs and non-high / reduced-motion states', () => {
    assert.match(effectsSrc, /data-mode['"]\) !== ['"]high['"]/);
    assert.match(effectsSrc, /data-motion['"]\) !== ['"]full['"]/);
    assert.match(effectsSrc, /getEpoch\(\) !== meta\.epoch/);
    assert.match(effectsSrc, /ScrollTrigger\.getAll/);
    assert.match(effectsSrc, /\.kill\(/);
    assert.match(effectsSrc, /isActive:\s*function/);
    assert.match(effectsSrc, /inspect:\s*function/);
    assert.match(effectsSrc, /ctx\.revert/);
  });

  it('serves High-only vendor scripts and refuses them as Medium/Basic contract', async () => {
    const ctrl = await get(port, '/js/controller.js');
    assert.equal(ctrl.status, 200);
    assert.match(ctrl.body, /GSAP is HIGH-only/);
    assert.match(ctrl.body, /js\/vendor\/gsap\.min\.js/);
    assert.match(ctrl.body, /js\/effects\/high-effects\.js/);

    const fx = await get(port, '/js/effects/high-effects.js');
    assert.equal(fx.status, 200);
    assert.match(fx.body, /Refuse incompatible states/);
  });

  it('ignores a late High load after switching to Basic', async () => {
    const h = createEpochHarness();
    const p1 = h.setMode('high');
    await h.setMode('basic');
    await p1;
    assert.equal(h.isActive(), false);
    assert.equal(h.starts().length, 0);
    assert.ok(h.stops().some((s) => s.reason === 'leave-high' || s.reason === 'stale-want') || h.epoch() >= 2);
  });

  it('ignores a late High load after switching to Medium during init', async () => {
    const h = createEpochHarness();
    const p1 = h.setMode('high');
    await h.setMode('medium');
    await p1;
    assert.equal(h.isActive(), false);
    assert.equal(h.starts().length, 0);
  });

  it('handles rapid High → Basic → High without leaving a stale generation active', async () => {
    const h = createEpochHarness();
    const a = h.setMode('high');
    const b = h.setMode('basic');
    const c = h.setMode('high');
    await Promise.all([a, b, c]);
    assert.equal(h.isActive(), true);
    assert.equal(h.starts().length, 1);
    assert.equal(h.starts()[0].epoch, h.epoch());
  });

  it('stops effects when reduced motion engages while High is loading', async () => {
    const h = createEpochHarness();
    const p1 = h.setMode('high');
    await h.setMotion('reduced');
    await p1;
    assert.equal(h.isActive(), false);
  });

  it('re-entering High after a failed generation can start a fresh epoch', async () => {
    const h = createEpochHarness();
    await h.setMode('high');
    assert.equal(h.isActive(), true);
    const firstEpoch = h.epoch();
    await h.setMode('basic');
    assert.equal(h.isActive(), false);
    await h.setMode('high');
    assert.equal(h.isActive(), true);
    assert.ok(h.epoch() > firstEpoch);
    assert.equal(h.starts().at(-1).epoch, h.epoch());
  });
});
