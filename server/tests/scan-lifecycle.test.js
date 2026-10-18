'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = file => fs.readFileSync(path.join(__dirname, '../../public/js', file), 'utf8');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness(store = new Map()) {
  const attrs = new Map([['data-mode', 'basic'], ['data-motion', 'full']]);
  const nodes = new Map(), events = [], timers = new Map();
  let timerId = 0, now = 0;
  const root = {
    getAttribute: key => attrs.get(key), setAttribute: (key, value) => attrs.set(key, value),
    classList: { add() {}, remove() {}, toggle() {} }
  };
  const document = {
    documentElement: root, hidden: false, visibilityState: 'visible',
    getElementById: id => nodes.get(id) || null,
    createElement: () => ({}),
    head: { appendChild(node) { nodes.set(node.id, node); node.parentNode = { removeChild() { nodes.delete(node.id); } }; } },
    dispatchEvent: event => events.push(event), addEventListener() {}
  };
  const localStorage = {
    getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
  };
  const sessionStore = new Map();
  const window = {
    localStorage, sessionStorage: {
      getItem: key => sessionStore.get(key) || null, setItem: (key, value) => sessionStore.set(key, String(value)),
      removeItem: key => sessionStore.delete(key)
    }, matchMedia: () => ({ matches: false, addEventListener() {} })
  };
  const context = vm.createContext({
    window, document, console, performance: { now: () => now },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    CustomEvent: function (type, options) { this.type = type; this.detail = options.detail; }
  });
  for (const file of ['config.js', 'copy.js', 'storage.js']) vm.runInContext(source(file), context);
  const S = window.Sypher;
  const calls = { collect: 0, benchmark: 0, show: 0, posts: 0 };
  let resolveBenchmark;
  const signals = { cpuThreads: 8, deviceMemoryGB: 8, screen: { width: 1440, height: 950, dpr: 1 }, webgl: 'webgl2', fps: null, saveData: false, effectiveType: '4g', battery: null };
  S.detect = {
    collectStatic() { calls.collect++; return Promise.resolve({ ...signals }); },
    runBenchmark() {
      calls.benchmark++;
      return {
        promise: new Promise(resolve => { resolveBenchmark = resolve; }),
        abort() { resolveBenchmark({ fps: null, completed: false, durationMs: 1800 }); }
      };
    }
  };
  S.score = { compute: () => ({ score: 85, breakdown: {}, max: {}, physicalMegapixels: 1 }) };
  S.classify = { classify: () => ({ cls: 'HIGH', appliedCaps: [], benchmarkVerified: true }), lower: () => 'MEDIUM' };
  S.api = {
    getModeConfig: () => Promise.resolve(null),
    postDeviceProfile() { calls.posts++; return Promise.resolve({ class: 'HIGH', configVersion: S.config.configVersion }); }
  };
  S.highEffects = { start: () => true, stop() {}, isActive: () => true };
  S.ui = { analysis: { show() { calls.show++; return {}; }, hide: done => done && done(), setDoneMessage() {} } };
  vm.runInContext(source('controller.js'), context);
  return {
    S, calls, events, root, store,
    finish() { resolveBenchmark({ fps: 60, completed: true, durationMs: 1200 }); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = end;
    },
    loadUI() {
      const makeNode = () => {
        const classes = new Set();
        return { hidden: true, textContent: '', classList: {
          add: (...names) => names.forEach(name => classes.add(name)),
          remove: (...names) => names.forEach(name => classes.delete(name)),
          contains: name => classes.has(name)
        } };
      };
      for (const id of ['analysis', 'analysis-step', 'analysis-title']) nodes.set(id, makeNode());
      vm.runInContext(source('ui-analysis.js'), context);
      return { panel: nodes.get('analysis'), title: nodes.get('analysis-title') };
    }
  };
}

describe('one-scan performance setup', () => {
  it('runs once even when init and re-run are called repeatedly during detection', async () => {
    const { S, calls, finish } = harness();
    S.controller.init(); S.controller.init(); S.controller.rerun();
    await flush();
    assert.equal(calls.collect, 1); assert.equal(calls.benchmark, 1);
    finish(); await flush();
    assert.equal(S.state.ready, true); assert.equal(calls.posts, 1);
    S.controller.init(); await flush();
    assert.equal(calls.collect, 1);
  });

  it('restores an older saved mode in a new session without displaying or scanning again', async () => {
    const store = new Map([['sypher.profile', JSON.stringify({ score: 85, class: 'HIGH', timestamp: Date.now() - 90 * 864e5 })]]);
    const { S, calls } = harness(store);
    assert.equal(S.storage.hasSession(), false);
    S.controller.init(); await flush();
    assert.equal(S.state.ready, true); assert.equal(S.state.mode, 'high');
    assert.deepEqual(calls, { collect: 0, benchmark: 0, show: 0, posts: 0 });
  });

  it('allows an explicit fresh scan after setup has finished', async () => {
    const h = harness();
    h.S.controller.init(); await flush(); h.finish(); await flush();
    h.S.controller.rerun(); await flush();
    assert.equal(h.calls.collect, 2); assert.equal(h.calls.benchmark, 2);
    h.finish(); await flush();
    assert.equal(h.calls.posts, 2);
  });

  it('updates older saved classifications from their scores without another scan', async () => {
    for (const [value, previous, expected] of [[59, 'MEDIUM', 'BASIC'], [60, 'MEDIUM', 'MEDIUM'], [79, 'HIGH', 'MEDIUM'], [80, 'HIGH', 'HIGH']]) {
      const store = new Map([['sypher.profile', JSON.stringify({
        score: value, class: previous, timestamp: Date.now() - 90 * 864e5,
        breakdown: { cpu: 10, memory: 10, screen: 10, webgl: 10, fps: 10 },
        signals: { fps: 60, pointerCoarse: false, saveData: false },
        scoreBands: '70:40:80'
      })]]);
      const h = harness(store);
      h.S.classify = require('../../public/js/classify');
      h.S.controller.init(); await flush();
      assert.equal(h.S.state.profile.class, expected, 'saved score ' + value);
      assert.equal(h.S.state.profile.scoreBands, '80:60:80');
      assert.deepEqual(h.calls, { collect: 0, benchmark: 0, show: 0, posts: 0 });
    }
  });

  it('completes and saves a fallback after the hard limit without starting a second scan', async () => {
    const h = harness();
    h.S.detect.collectStatic = () => new Promise(() => {});
    h.S.controller.init();
    h.advance(1800); await flush();
    assert.equal(h.S.state.ready, true); assert.equal(h.S.state.profile.source, 'fallback');
    const next = harness(h.store);
    next.S.controller.init(); await flush();
    assert.equal(next.calls.show, 0); assert.equal(next.calls.collect, 0);
  });
});

describe('centered scan loader timing', () => {
  it('shows on a normal visit and exits smoothly after its minimum, confirmation and fade', () => {
    const h = harness(); const { panel, title } = h.loadUI();
    let finished = 0;
    h.S.ui.analysis.show();
    assert.equal(panel.hidden, false);
    h.S.ui.analysis.setDoneMessage('Your High experience is ready');
    h.S.ui.analysis.hide(() => finished++);
    h.advance(899); assert.equal(panel.classList.contains('is-done'), false);
    h.advance(1); assert.equal(title.textContent, 'Your High experience is ready');
    h.advance(320); assert.equal(panel.classList.contains('is-leaving'), true);
    h.advance(220); assert.equal(panel.hidden, true); assert.equal(finished, 1);
  });

  it('skips all loader delays on cached visits', () => {
    const h = harness(); const { panel } = h.loadUI();
    let finished = false;
    h.S.ui.analysis.hide(() => { finished = true; });
    assert.equal(finished, true); assert.equal(panel.hidden, true);
  });

  it('keeps the final callback when the fail-safe starts closing before detection completes', () => {
    const h = harness(); const { panel } = h.loadUI();
    h.S.ui.analysis.show(); h.advance(2200);
    let finished = false;
    h.S.ui.analysis.hide(() => { finished = true; });
    h.advance(540);
    assert.equal(panel.hidden, true); assert.equal(finished, true);
  });
});
