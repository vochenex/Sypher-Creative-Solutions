'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gsap } = require('../../public/js/vendor/gsap.min.js');

// Exercise the pointer lifecycle against the shipped GSAP engine. Scroll scenes are
// omitted here; they do not own the reusable quickTo tweens that caused this bug.
function loadEffects() {
  function element() {
    const listeners = {};
    return {
      x: 0, y: 0, rotationX: 0, rotationY: 0,
      transformPerspective: 0, transformOrigin: '', clearProps: '',
      classList: { add() {}, remove() {}, toggle() {} },
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }),
      addEventListener(type, listener) { listeners[type] = listener; },
      removeEventListener(type) { delete listeners[type]; },
      fire(type, point = {}) { if (listeners[type]) listeners[type]({ pointerType: 'mouse', ...point }); }
    };
  }
  const card = element(), magnet = element();
  const root = { getAttribute: key => key === 'data-mode' ? 'high' : 'full' };
  const document = {
    documentElement: root,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: selector => selector === '[data-magnetic]' ? [magnet] : selector.startsWith('.stat,') ? [card] : [],
    addEventListener() {}
  };
  const S = {};
  const engine = {
    registerPlugin() {},
    set: gsap.set, quickTo: gsap.quickTo, to: gsap.to, killTweensOf: gsap.killTweensOf,
    context: () => ({ revert() {} })
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/js/effects/high-effects.js'), 'utf8'), {
    document,
    window: { Sypher: S, gsap: engine, ScrollTrigger: {}, matchMedia: () => ({ matches: true }), addEventListener() {} }
  });
  S.highEffects.start({ cursorEffects: true, hoverEffects: 'tilt-preview' });
  gsap.ticker.sleep();
  return { card, magnet, effects: S.highEffects };
}

function advance(seconds = 1) {
  gsap.globalTimeline.time(gsap.globalTimeline.time() + seconds);
  gsap.ticker.sleep();
}

afterEach(() => { gsap.globalTimeline.clear(); gsap.ticker.sleep(); });

describe('High pointer regression coverage', () => {
  it('tracks movement inside a card and keeps tracking after repeated leave/re-entry', () => {
    const { card, effects } = loadEffects();
    for (let visit = 0; visit < 4; visit++) {
      card.fire('pointermove', { clientX: 90, clientY: 10 });
      advance();
      assert(card.rotationY > 0 && card.rotationX > 0, 'top-right hover rotates toward the pointer');
      card.fire('pointermove', { clientX: 10, clientY: 90 });
      advance(0.15);
      assert(card.rotationY < 4.8, 'movement within the same hover updates the live tween');
      card.fire('pointerleave');
      advance();
      assert.equal(card.rotationX, 0);
      assert.equal(card.rotationY, 0);
    }
    effects.stop();
  });

  it('keeps magnetic buttons responsive after leaving during an active tween', () => {
    const { magnet, effects } = loadEffects();
    for (let visit = 0; visit < 4; visit++) {
      magnet.fire('pointermove', { clientX: 90, clientY: 90 });
      advance(0.1);
      assert(magnet.x > 0 && magnet.y > 0);
      magnet.fire('pointerleave');
      advance();
      assert.equal(magnet.x, 0);
      assert.equal(magnet.y, 0);
    }
    effects.stop();
  });

  it('removes pointer listeners and tweens when High stops, and restores them on restart', () => {
    const { card, magnet, effects } = loadEffects();
    card.fire('pointermove', { clientX: 90, clientY: 10 });
    magnet.fire('pointermove', { clientX: 90, clientY: 90 });
    effects.stop();
    assert.equal(gsap.getTweensOf(card).length, 0);
    assert.equal(gsap.getTweensOf(magnet).length, 0);
    const rotation = card.rotationY;
    card.fire('pointermove', { clientX: 10, clientY: 90 });
    advance();
    assert.equal(card.rotationY, rotation);
    effects.start({ cursorEffects: true, hoverEffects: 'tilt-preview' });
    card.fire('pointermove', { clientX: 10, clientY: 90 });
    advance();
    assert(card.rotationY < 0);
    effects.stop();
  });
});
