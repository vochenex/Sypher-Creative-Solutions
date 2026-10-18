'use strict';

/**
 * Exercises the browser storage profile validator via a minimal DOM-less harness.
 * Loads storage.js with a fake window/localStorage.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStorage(store = new Map()) {
  const sessionStore = new Map();
  const localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); }
  };
  const sandbox = {
    window: { localStorage, sessionStorage: {
      getItem: k => sessionStore.get(k) || null,
      setItem: (k, v) => sessionStore.set(k, String(v)),
      removeItem: k => sessionStore.delete(k)
    } },
    console
  };
  sandbox.window.Sypher = { config: { configVersion: '2026-10-13.1' } };
  sandbox.Sypher = sandbox.window.Sypher;
  const code = fs.readFileSync(path.join(__dirname, '../../public/js/storage.js'), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'storage.js' });
  return { storage: sandbox.window.Sypher.storage, store };
}

describe('cached profile validation (F6)', () => {
  let storage;

  beforeEach(() => {
    storage = loadStorage().storage;
  });

  it('accepts a well-formed profile', () => {
    const profile = {
      score: 85,
      class: 'HIGH',
      timestamp: Date.now(),
      breakdown: { cpu: 20 },
      signals: { cpuThreads: 8 },
      configVersion: '2026-10-13.1'
    };
    assert.equal(storage.setProfile(profile), true);
    const got = storage.getProfile(24);
    assert.equal(got.class, 'HIGH');
    assert.equal(got.score, 85);
  });

  it('rejects timestamp-only corruption', () => {
    assert.equal(storage._validateProfile({ timestamp: Date.now() }), null);
  });

  it('rejects unknown class values that would become data-mode=undefined', () => {
    assert.equal(storage._validateProfile({
      timestamp: Date.now(),
      class: 'ULTRA',
      score: 99
    }), null);
  });

  it('rejects obsolete config versions', () => {
    assert.equal(storage.setProfile({
      score: 50,
      class: 'MEDIUM',
      timestamp: Date.now(),
      configVersion: '1999-01-01.0'
    }), false);

    const { storage: s2, store } = loadStorage();
    store.set('sypher.profile', JSON.stringify({
      score: 50,
      class: 'MEDIUM',
      timestamp: Date.now(),
      configVersion: '1999-01-01.0'
    }));
    assert.equal(s2.getProfile(24), null);
  });

  it('rejects future-dated and expired profiles', () => {
    assert.equal(storage._validateProfile({
      score: 40,
      class: 'BASIC',
      timestamp: Date.now() + 120000
    }), null);

    const { storage: s2, store } = loadStorage();
    store.set('sypher.profile', JSON.stringify({
      score: 40,
      class: 'BASIC',
      timestamp: Date.now() - 48 * 3600 * 1000,
      configVersion: '2026-10-13.1'
    }));
    assert.equal(s2.getProfile(24), null);
  });

  it('falls back to auto when override is corrupt', () => {
    const { storage: s2, store } = loadStorage();
    store.set('sypher.override', 'ultra');
    assert.equal(s2.getOverride(), 'auto');
  });

  it('keeps the saved result and override across new browser sessions without expiring', () => {
    const { storage: first, store } = loadStorage();
    first.setProfile({ score: 85, class: 'HIGH', timestamp: Date.now() - 90 * 864e5 });
    first.setOverride('medium');
    first.markSession();
    const next = loadStorage(store).storage;
    assert.equal(next.hasSession(), false);
    assert.equal(next.getProfile(0).class, 'HIGH');
    assert.equal(next.getProfile().class, 'HIGH');
    assert.equal(next.getOverride(), 'medium');
  });
});
