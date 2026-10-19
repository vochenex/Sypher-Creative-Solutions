(function () {
  'use strict';

  var hero = document.getElementById('hero');
  var carousel = document.getElementById('hero-carousel');
  if (!hero || !carousel) return;
  var track = document.getElementById('hero-carousel-track');
  var originals = Array.prototype.slice.call(track.children);
  var current = document.getElementById('hero-carousel-current');
  var pause = document.getElementById('hero-carousel-pause');
  var manual = document.getElementById('hero-carousel-manual');
  var dots = document.getElementById('hero-carousel-dots');
  var hint = document.getElementById('hero-carousel-hint');
  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var canvas = document.getElementById('hero-field');
  var ctx = null;
  try { ctx = canvas.getContext('2d'); } catch (e) { /* CSS gradients remain available. */ }
  var cards = originals.slice();
  var offset = 0, last = 0, elapsed = 0, frame = null;
  var paused = false, visible = true, pointerActive = false;
  var width = 0, height = 0, dpr = 1, lastPaint = 0;
  var S = window.Sypher;
  var quality = 'basic', fieldEnabled = false, pointerEnabled = false, fullMotion = !reduced.matches;
  var hoveredCard = null, introMode = '', introAnimations = [];
  var autoplay = false, manualEnabled = false, slide = null, drag = null, suppressClick = false;
  var dotButtons = [];
  var target = { x: -1000, y: -1000 }, follower = { x: -1000, y: -1000 };
  var pointer = { x: 0, y: 0 };

  // Preserve the line break while restoring the new headline's word choreography.
  var headline = document.getElementById('hero-title');
  var headlineLabel = Array.prototype.map.call(headline.childNodes, function (node) {
    return node.nodeName === 'BR' ? ' ' : node.textContent;
  }).join('').trim();
  headline.setAttribute('aria-label', headlineLabel);
  Array.prototype.slice.call(headline.childNodes).forEach(function (node) {
    if (node.nodeType !== 3) { node.setAttribute('aria-hidden', 'true'); return; }
    var fragment = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach(function (word) {
      if (!word.trim()) { fragment.appendChild(document.createTextNode(word)); return; }
      var span = document.createElement('span');
      span.className = 'hero-showcase__word';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = word;
      fragment.appendChild(span);
    });
    node.replaceWith(fragment);
  });

  function animateIntro() {
    var next = fullMotion && !paused ? quality : 'none';
    if (next === introMode) return;
    introAnimations.forEach(function (animation) { animation.cancel(); });
    introAnimations = [];
    introMode = next;
    hero.dataset.heroIntro = next;
    if (!headline.animate || next === 'basic' || next === 'none' || !visible || hero.getBoundingClientRect().bottom < 0) return;
    if (next === 'high') {
      headline.querySelectorAll('.hero-showcase__word').forEach(function (word, i) {
        introAnimations.push(word.animate([
          { opacity: 0, transform: 'translateY(24px) rotate(1.5deg)' },
          { opacity: 1, transform: 'translateY(0) rotate(0)' }
        ], { duration: 850, delay: i * 55, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
      });
    } else {
      introAnimations.push(headline.animate([
        { opacity: .2, translate: '0 12px' }, { opacity: 1, translate: '0 0' }
      ], { duration: 550, easing: 'ease-out' }));
    }
  }

  // A second set provides an offscreen buffer on both sides of the endless loop.
  originals.forEach(function (card) {
    var clone = card.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.querySelector('a').tabIndex = -1;
    clone.querySelector('a').addEventListener('click', function (event) {
      event.preventDefault();
      card.querySelector('a').click();
    });
    track.appendChild(clone);
    cards.push(clone);
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'hero-carousel__dot';
    button.setAttribute('aria-label', 'Show ' + card.dataset.project + ' project');
    button.addEventListener('click', function () {
      var index = originals.indexOf(card);
      var difference = ((index - offset) % originals.length + originals.length) % originals.length;
      if (difference > originals.length / 2) difference -= originals.length;
      slideTo(offset + difference);
    });
    dots.appendChild(button);
    dotButtons.push(button);
  });
  hero.classList.add('is-animated');

  function positionCards() {
    cards.forEach(function (card, i) {
      var slot = ((i - offset + 2) % cards.length + cards.length) % cards.length - 2;
      card.style.setProperty('--slot', slot.toFixed(4));
      card.style.setProperty('--rise', (11.4 * Math.pow(Math.max(0, slot), 2)).toFixed(2) + 'px');
    });
    var selected = ((Math.round(offset) % originals.length) + originals.length) % originals.length;
    current.textContent = String(selected + 1).padStart(2, '0');
    dotButtons.forEach(function (button, i) { button.setAttribute('aria-pressed', String(i === selected)); });
  }

  function normalize(value) { return (value % cards.length + cards.length) % cards.length; }
  function kick() {
    if (!frame && visible && !document.hidden) { last = 0; frame = requestAnimationFrame(tick); }
  }
  function slideTo(value) {
    if (!manualEnabled) return;
    if (fullMotion) {
      slide = { from: offset, to: value, start: performance.now() };
      kick();
    } else { offset = normalize(value); positionCards(); }
  }
  function cardStep() {
    var positions = cards.map(function (card) { return card.getBoundingClientRect().left; }).sort(function (a, b) { return a - b; });
    return positions[1] - positions[0] || width * .76;
  }

  function resize() {
    width = hero.clientWidth;
    height = hero.clientHeight;
    dpr = fieldEnabled ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
    canvas.width = fieldEnabled ? Math.round(width * dpr) : 1;
    canvas.height = fieldEnabled ? Math.round(height * dpr) : 1;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawField(time) {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    var t = time * .00012;
    var mx = pointerActive ? follower.x : width * (.62 + Math.sin(t) * .15);
    var my = pointerActive ? follower.y : height * (.3 + Math.cos(t * .7) * .12);
    // Fine topographic lines bend away from the pointer like a soft lens.
    ctx.lineWidth = .75;
    for (var row = 0; row < 17; row++) {
      ctx.beginPath();
      for (var x = -30; x <= width + 30; x += 24) {
        var y = height * .10 + row * 34 + Math.sin(x * .004 + t + row * .13) * 26;
        var dx = x - mx, dy = y - my;
        var distance = Math.sqrt(dx * dx + dy * dy);
        var push = Math.exp(-distance * distance / 42000) * (pointerActive ? 55 : 20);
        var py = y + dy / Math.max(distance, 1) * push;
        if (x === -30) ctx.moveTo(x, py); else ctx.lineTo(x, py);
      }
      ctx.strokeStyle = 'rgba(95, 120, 86, ' + (.045 + row * .002) + ')';
      ctx.stroke();
    }
    // A restrained dot field makes cursor ripples visible between the curves.
    for (var gx = 24; gx < width; gx += 44) {
      for (var gy = 100; gy < Math.min(height, 630); gy += 44) {
        var vx = gx - mx, vy = gy - my;
        var dist = Math.sqrt(vx * vx + vy * vy);
        var force = Math.exp(-dist * dist / 26000) * 22;
        var pulse = .5 + Math.sin(dist * .025 - time * .0012) * .5;
        ctx.beginPath();
        ctx.arc(gx + vx / Math.max(dist, 1) * force, gy + vy / Math.max(dist, 1) * force, .65 + force * .025, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(82, 111, 69, ' + (.10 + pulse * .13) + ')';
        ctx.fill();
      }
    }
  }

  function tick(now) {
    frame = null;
    if (!visible || document.hidden) { last = 0; return; }
    var delta = now - (last || now);
    var dt = Math.min(delta, 250);
    last = now;
    elapsed += dt;
    // Only High advances itself. Manual gestures temporarily take control, then resume.
    if (slide && !drag) {
      var progress = Math.min(1, (now - slide.start) / 500);
      offset = slide.from + (slide.to - slide.from) * (1 - Math.pow(1 - progress, 3));
      if (progress === 1) { offset = normalize(slide.to); slide = null; }
      positionCards();
    } else if (autoplay && !drag) {
      offset = normalize(offset + delta / 18000);
      positionCards();
    }
    var ease = 1 - Math.exp(-dt / 75);
    follower.x += (target.x - follower.x) * ease;
    follower.y += (target.y - follower.y) * ease;
    if (pointerActive && pointerEnabled) {
      hero.style.setProperty('--pointer-x', (follower.x / width * 100).toFixed(2) + '%');
      hero.style.setProperty('--pointer-y', (follower.y / height * 100).toFixed(2) + '%');
      updateCardTilt();
    }
    // Canvas runs at 30 fps; card and cursor transforms stay at display refresh rate.
    if (fieldEnabled && now - lastPaint > 32) { drawField(elapsed); lastPaint = now; }
    if (autoplay || fieldEnabled || pointerEnabled || slide) frame = requestAnimationFrame(tick);
  }

  function sync(event) {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    last = 0;
    fullMotion = S && S.state ? S.state.motion === 'full' : !reduced.matches;
    var flags = S && S.state && S.state.flags;
    var mode = root.getAttribute('data-mode');
    var nextQuality = mode === 'high' || mode === 'medium' ? mode : 'basic';
    if (nextQuality === 'high' && (quality !== 'high' || (event && event.detail && event.detail.restartMotion))) paused = false;
    if (nextQuality !== quality || document.hidden) { drag = null; slide = null; hero.classList.remove('is-dragging'); }
    quality = nextQuality;
    manualEnabled = quality !== 'basic';
    autoplay = quality === 'high' && fullMotion && !paused;
    fieldEnabled = quality === 'high' && fullMotion && !paused && !!ctx;
    pointerEnabled = quality === 'high' && fullMotion && fine.matches && !!(flags && flags.cursorEffects);
    hero.dataset.effects = quality;
    hero.dataset.fieldActive = String(fieldEnabled);
    hero.dataset.autoplay = String(autoplay);
    manual.hidden = !manualEnabled;
    carousel.tabIndex = manualEnabled ? 0 : -1;
    hint.textContent = fine.matches && hero.clientWidth > 600 ? 'Drag to explore' : 'Swipe to explore';
    carousel.setAttribute('aria-label', manualEnabled ? 'Selected Sypher projects. Drag, swipe, or use arrow keys to explore.' : 'Selected Sypher projects');
    if (!manualEnabled) carousel.removeAttribute('aria-roledescription');
    else carousel.setAttribute('aria-roledescription', 'carousel');
    // Static Basic shows the six original projects as a compact grid.
    cards.slice(originals.length).forEach(function (card) { card.hidden = !manualEnabled; });
    resize();
    hero.classList.toggle('is-motion-paused', !autoplay);
    pause.hidden = quality !== 'high' || !fullMotion;
    pause.setAttribute('aria-pressed', String(paused));
    pause.setAttribute('aria-label', paused ? 'Resume hero animation' : 'Pause hero animation');
    pause.querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
    pause.querySelector('span').textContent = paused ? 'Resume motion' : 'Pause motion';
    if (!pointerEnabled) {
      pointerActive = false;
      if (hoveredCard) { hoveredCard.style.removeProperty('--card-tilt-x'); hoveredCard.style.removeProperty('--card-tilt-y'); hoveredCard = null; }
    }
    if (S && S.highEffects) S.highEffects.setPaused(paused);
    animateIntro();
    positionCards();
    if (autoplay || fieldEnabled || pointerEnabled || slide) kick();
    else if (fieldEnabled) drawField(elapsed);
  }

  carousel.addEventListener('dragstart', function (event) { event.preventDefault(); });
  carousel.addEventListener('pointerdown', function (event) {
    if (!manualEnabled || !event.isPrimary || event.button !== 0 || !event.target.closest('.hero-card__link')) return;
    slide = null;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, offset: offset, step: cardStep(), moved: false };
  });
  carousel.addEventListener('pointermove', function (event) {
    if (!drag || event.pointerId !== drag.id) return;
    var dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (Math.abs(dx) < 8) return;
      drag.moved = true;
      carousel.setPointerCapture(event.pointerId);
      hero.classList.add('is-dragging');
    }
    offset = drag.offset - dx / drag.step;
    positionCards();
  });
  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    var moved = drag.moved;
    var start = drag.offset;
    drag = null;
    hero.classList.remove('is-dragging');
    if (carousel.hasPointerCapture(event.pointerId)) carousel.releasePointerCapture(event.pointerId);
    if (moved) {
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 0);
      var distance = offset - start;
      var destination = event.type === 'pointercancel' ? Math.round(offset) : Math.abs(distance) > .15 ? Math.round(start) + Math.sign(distance) * Math.max(1, Math.round(Math.abs(distance))) : Math.round(start);
      slideTo(destination);
    }
    kick();
  }
  window.addEventListener('pointerup', finishDrag);
  window.addEventListener('pointercancel', finishDrag);
  carousel.addEventListener('lostpointercapture', finishDrag);
  carousel.addEventListener('click', function (event) {
    if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);

  hero.addEventListener('pointermove', function (event) {
    if (event.pointerType !== 'mouse' || !pointerEnabled) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    var rect = hero.getBoundingClientRect();
    target.x = event.clientX - rect.left;
    target.y = event.clientY - rect.top;
    if (!pointerActive) { follower.x = target.x; follower.y = target.y; }
    pointerActive = true;
    updateCardTilt();
  }, { passive: true });
  function updateCardTilt() {
    // Hit-test the current ribbon position, including when it moves beneath a still pointer.
    var hit = document.elementFromPoint(pointer.x, pointer.y);
    var card = hit && hit.closest('.hero-card__link');
    if (card && !hero.contains(card)) card = null;
    if (hoveredCard && hoveredCard !== card) { hoveredCard.style.removeProperty('--card-tilt-x'); hoveredCard.style.removeProperty('--card-tilt-y'); }
    hoveredCard = card;
    if (card) {
      // Measure the ribbon wrapper, which does not inherit its child's changing tilt.
      var bounds = card.parentNode.getBoundingClientRect();
      var x = Math.max(0, Math.min(1, (pointer.x - bounds.left) / bounds.width));
      var y = Math.max(0, Math.min(1, (pointer.y - bounds.top) / bounds.height));
      card.style.setProperty('--card-tilt-x', ((.5 - y) * 6).toFixed(2) + 'deg');
      card.style.setProperty('--card-tilt-y', ((x - .5) * 8).toFixed(2) + 'deg');
    }
  }
  hero.addEventListener('pointerleave', function () {
    pointerActive = false;
    if (hoveredCard) { hoveredCard.style.removeProperty('--card-tilt-x'); hoveredCard.style.removeProperty('--card-tilt-y'); hoveredCard = null; }
  });
  carousel.addEventListener('focusin', function (event) {
    // Bring keyboard-focused project links into view without stopping autoplay.
    if (!manualEnabled || !event.target.matches(':focus-visible')) return;
    var card = event.target.closest('.hero-card');
    if (card) { slide = null; offset = normalize(cards.indexOf(card) - (width <= 600 ? 0 : 1)); positionCards(); }
  });
  carousel.addEventListener('keydown', function (event) {
    if (!manualEnabled || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    slideTo(Math.round(slide ? slide.to : offset) + (event.key === 'ArrowRight' ? 1 : -1));
  });
  pause.addEventListener('click', function () {
    paused = !paused;
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('adaptive:ready', sync);
  document.addEventListener('adaptive:modechange', sync);
  if (S) S.heroPaused = function () { return paused; };
  reduced.addEventListener('change', sync);
  fine.addEventListener('change', sync);
  window.addEventListener('resize', sync, { passive: true });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      root.classList.toggle('hero-in-view', visible);
      sync();
    }, { threshold: .05 }).observe(hero);
  } else root.classList.add('hero-in-view');
  resize();
  positionCards();
  sync();
})();
