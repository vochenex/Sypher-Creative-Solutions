(function (S) {
  'use strict';

  var root = document.documentElement;
  var ring = document.getElementById('site-cursor');
  var dot = document.getElementById('site-cursor-dot');
  if (!ring || !dot || !window.matchMedia) return;
  var label = ring.querySelector('span');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var enabled = false, active = false, frame = null, last = 0;
  var target = { x: 0, y: 0 }, follower = { x: 0, y: 0 };

  function actionLabel(el) {
    var action = el.closest('[data-cursor], a[href], button, summary, [role="button"], input[type="submit"]');
    if (!action || action.matches(':disabled, [aria-disabled="true"], [inert] *')) return '';
    if (action.hasAttribute('data-cursor')) return action.getAttribute('data-cursor');
    if (action.matches('.svc__toggle')) return action.getAttribute('aria-expanded') === 'true' ? 'CLOSE' : 'EXPAND';
    if (action.matches('[data-filter]')) return 'FILTER';
    if (action.id === 'tm-pause') return action.getAttribute('aria-label') === 'Play testimonials' ? 'RESUME' : 'PAUSE';
    if (action.id === 'hero-carousel-pause') return action.getAttribute('aria-pressed') === 'true' ? 'RESUME' : 'PAUSE';
    if (action.matches('[id$="-prev"]')) return 'PREV';
    if (action.matches('[id$="-next"]')) return 'NEXT';
    if (action.matches('[id$="-close"], .toast__close')) return 'CLOSE';
    if (action.matches('.chip')) return 'SETTINGS';
    if (action.matches('[type="submit"]')) return 'SEND';
    if (action.matches('summary')) return action.parentNode.open ? 'CLOSE' : 'READ';
    var href = action.getAttribute('href') || '';
    if (href.indexOf('mailto:') === 0) return 'EMAIL';
    if (href.indexOf('tel:') === 0) return 'CALL';
    if (href === '#contact') return 'LET’S TALK';
    if (href === '#work') return 'EXPLORE';
    if (href === '#services') return 'SERVICES';
    if (href === '#testimonials') return 'CLIENTS';
    if (href === '#main' || href === '#hero') return 'HOME';
    return action.matches('a') ? 'OPEN' : 'SELECT';
  }

  function updateTarget() {
    var el = document.elementFromPoint(target.x, target.y);
    var nativePointer = !!(el && el.closest('input:not([type="submit"]), textarea, select, option, [contenteditable]:not([contenteditable="false"]), video[controls], iframe'));
    var text = el && !nativePointer ? actionLabel(el) : '';
    if (label.textContent !== text) label.textContent = text;
    root.classList.toggle('is-action-hovered', !!text);
    root.classList.toggle('is-native-pointer', nativePointer);
  }

  function tick(now) {
    frame = null;
    if (!enabled || !active || document.hidden) return;
    var dt = last ? Math.min(now - last, 64) : 16;
    last = now;
    var ease = 1 - Math.exp(-dt / 60);
    follower.x += (target.x - follower.x) * ease;
    follower.y += (target.y - follower.y) * ease;
    ring.style.transform = 'translate3d(' + follower.x + 'px,' + follower.y + 'px,0)';
    dot.style.transform = 'translate3d(' + target.x + 'px,' + target.y + 'px,0)';
    // Resolve every frame so scrolling, moving cards and expanded controls cannot leave a stale label.
    updateTarget();
    frame = requestAnimationFrame(tick);
  }

  function hide() {
    active = false;
    last = 0;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    label.textContent = '';
    root.classList.remove('is-pointer-active', 'is-action-hovered', 'is-pointer-pressed', 'is-native-pointer');
  }

  function sync() {
    var flags = S && S.state && S.state.flags;
    enabled = root.getAttribute('data-mode') === 'high' && root.getAttribute('data-motion') === 'full' && fine.matches && !!(flags && flags.cursorEffects);
    root.classList.toggle('has-custom-cursor', enabled);
    if (!enabled || document.hidden) hide();
  }

  document.addEventListener('pointermove', function (event) {
    if (!enabled || event.pointerType !== 'mouse') { if (active) hide(); return; }
    target.x = event.clientX;
    target.y = event.clientY;
    if (!active) {
      follower.x = target.x;
      follower.y = target.y;
      ring.style.transform = 'translate3d(' + target.x + 'px,' + target.y + 'px,0)';
      dot.style.transform = ring.style.transform;
    }
    active = true;
    root.classList.add('is-pointer-active');
    updateTarget();
    if (frame === null) frame = requestAnimationFrame(tick);
  }, { passive: true });
  document.addEventListener('pointerout', function (event) { if (!event.relatedTarget) hide(); });
  document.addEventListener('pointerdown', function (event) {
    if (enabled && active && event.pointerType === 'mouse') root.classList.add('is-pointer-pressed');
  });
  window.addEventListener('pointerup', function () { root.classList.remove('is-pointer-pressed'); });
  window.addEventListener('pointercancel', hide);
  window.addEventListener('blur', hide);
  document.addEventListener('keydown', function (event) { if (event.key === 'Tab') hide(); });
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('adaptive:ready', sync);
  document.addEventListener('adaptive:modechange', sync);
  fine.addEventListener('change', sync);
  reduced.addEventListener('change', sync);
  sync();
})(window.Sypher);
