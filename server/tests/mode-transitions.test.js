'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadController() {
  const attributes = new Map([['data-mode', 'basic'], ['data-motion', 'full']]);
  const nodes = new Map();
  const events = [];
  const pending = [];
  let motionListener;
  const root = {
    getAttribute: name => attributes.get(name),
    setAttribute: (name, value) => attributes.set(name, value),
    classList: { toggle() {}, remove() {} }
  };
  function transition(commit) {
    const deferred = () => {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      return { promise, resolve, reject };
    };
    const ready = deferred(), update = deferred(), finished = deferred();
    pending.push({
      run() { commit(); ready.resolve(); update.resolve(); finished.resolve(); },
      skip() {
        ready.reject(new Error('Transition was skipped'));
        update.reject(new Error('Transition was skipped'));
        finished.reject(new Error('Transition was skipped'));
      }
    });
    return { ready: ready.promise, updateCallbackDone: update.promise, finished: finished.promise };
  }
  const S = {
    storage: {
      isMotionAllowed: () => false, isDowngradeDismissed: () => true,
      getOverride: () => 'auto', setOverride: () => true
    },
    api: { getModeConfig: () => Promise.resolve(null) },
    highEffects: {
      active: false,
      start() { this.active = true; return true; },
      stop() { this.active = false; },
      isActive() { return this.active; }
    }
  };
  const window = {
    Sypher: S,
    matchMedia: () => motionQuery
  };
  const motionQuery = { matches: false, addEventListener(_, listener) { motionListener = listener; } };
  const document = {
    documentElement: root,
    getElementById: id => nodes.get(id),
    createElement: () => ({}),
    head: { appendChild(node) {
      node.parentNode = { removeChild() { nodes.delete(node.id); } };
      nodes.set(node.id, node);
    } },
    dispatchEvent(event) { events.push({ type: event.type, detail: event.detail, domMode: root.getAttribute('data-mode') }); },
    startViewTransition: transition
  };
  const sandbox = {
    window, document, console, setTimeout, clearTimeout,
    CustomEvent: function (type, options) { this.type = type; this.detail = options.detail; }
  };
  for (const file of ['config.js', 'controller.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/js', file), 'utf8'), sandbox, { filename: file });
  }
  S.state.ready = true;
  return { S, root, events, pending, nodes, changeMotion: reduced => { motionQuery.matches = reduced; motionListener({ matches: reduced }); } };
}

describe('mode transition regression coverage', () => {
  it('publishes the new mode only after its view-transition DOM commit', async () => {
    const { S, root, events, pending } = loadController();
    S.controller.setOverride('high', { silent: true });
    assert.equal(root.getAttribute('data-mode'), 'basic');
    assert.equal(events.filter(e => e.type === 'adaptive:modechange').length, 0);
    pending[0].run();
    await Promise.resolve();
    const event = events.find(e => e.type === 'adaptive:modechange');
    assert.equal(event.detail.mode, 'high');
    assert.equal(event.domMode, 'high');
    assert.equal(S.highEffects.active, true);
  });

  it('does not let an old High transition revive effects after Basic or Medium is selected', async () => {
    const { S, root, pending, events, nodes } = loadController();
    S.controller.setOverride('high', { silent: true });
    S.controller.setOverride('basic', { silent: true });
    S.controller.setOverride('medium', { silent: true });
    pending[0].run();
    await Promise.resolve();
    assert.equal(root.getAttribute('data-mode'), 'medium');
    assert.equal(S.state.mode, 'medium');
    assert.equal(S.highEffects.active, false);
    assert.equal(nodes.has('css-mode-high'), false);
    assert.equal(nodes.has('css-mode-medium'), true);
    assert(events.filter(e => e.type === 'adaptive:modechange').every(e => e.detail.mode === e.domMode));
  });

  it('stops High effects when reduced motion changes during a pending transition', async () => {
    const { S, root, pending, changeMotion } = loadController();
    S.controller.setOverride('high', { silent: true });
    changeMotion(true);
    pending[0].run();
    await Promise.resolve();
    assert.equal(root.getAttribute('data-motion'), 'reduced');
    assert.equal(S.state.flags.cursorEffects, false);
    assert.equal(S.highEffects.active, false);
  });

  it('handles all skipped-transition promises and still commits the latest choice', async () => {
    const { S, root, pending } = loadController();
    S.controller.setOverride('high', { silent: true });
    pending[0].skip();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(root.getAttribute('data-mode'), 'high');
    assert.equal(S.highEffects.active, true);
  });
});
