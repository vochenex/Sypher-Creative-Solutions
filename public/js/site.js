/* Site Sections: navigation, reveals, portfolio filter, testimonials, hero pause.
   Every behavior is driven by the active mode flags delivered with adaptive:ready / adaptive:modechange. */
(function (S) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var flags = null;

  /* ---------- Mobile menu ---------- */
  var menuBtn = $('menu-btn'), nav = $('primary-nav'), menuLabel = $('menu-btn-label');
  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuLabel.textContent = open ? 'Close menu' : 'Open menu';
    document.body.style.overflow = open ? 'hidden' : '';
  }
  menuBtn.addEventListener('click', function () { setMenu(!nav.classList.contains('is-open')); });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); }
  });

  /* ---------- Header (tuck-on-scroll lives in high-effects.js) ---------- */
  var header = $('site-header');
  header.addEventListener('focusin', function () { header.classList.remove('is-tucked'); });
  S.menuOpen = function () { return nav.classList.contains('is-open'); };

  /* ---------- Headline split: each word sits in a clipping mask for the HIGH reveal ---------- */
  var title = document.querySelector('[data-split]');
  if (title) {
    var words = title.textContent.trim().split(/\s+/);
    title.setAttribute('aria-label', title.textContent.trim());
    title.textContent = '';
    words.forEach(function (w, i) {
      var mask = document.createElement('span');
      mask.className = 'w';
      mask.setAttribute('aria-hidden', 'true');
      var inner = document.createElement('span');
      inner.className = 'w__i';
      inner.textContent = w;
      mask.appendChild(inner);
      title.appendChild(mask);
      if (i < words.length - 1) title.appendChild(document.createTextNode(' '));
    });
    title.classList.add('is-split');
  }

  /* ---------- Intro hold: only HIGH with full motion keeps it; high-effects.js releases it ---------- */
  var introTimer = null;
  function releaseIntro() { clearTimeout(introTimer); root.classList.remove('intro-pending'); }
  S.releaseIntro = releaseIntro;

  /* ---------- Services accordion (all panels stay open without JavaScript) ---------- */
  var svcItems = Array.prototype.slice.call(document.querySelectorAll('.svc'));
  function setSvc(item, open) {
    item.classList.toggle('is-open', open);
    item.querySelector('.svc__toggle').setAttribute('aria-expanded', String(open));
  }
  svcItems.forEach(function (item) {
    item.querySelector('.svc__toggle').addEventListener('click', function () {
      var willOpen = !item.classList.contains('is-open');
      svcItems.forEach(function (other) { setSvc(other, other === item && willOpen); });
    });
  });

  /* ---------- Reveals ---------- */
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  var observer = null;
  var revealed = new WeakSet();
  reveals.forEach(function (el) {
    var siblings = Array.prototype.slice.call(el.parentNode.children).filter(function (n) { return n.classList.contains('reveal'); });
    el.style.setProperty('--stagger', Math.min(siblings.indexOf(el), 6));
  });

  function finishReveal(el) {
    revealed.add(el);
    el.classList.remove('is-pending');
    el.classList.add('is-revealed');
    setTimeout(function () {
      el.classList.remove('is-revealed');
      el.classList.add('is-done');
    }, 1200);
  }

  function setupReveals() {
    if (observer) { observer.disconnect(); observer = null; }
    var animate = flags.scrollAnimations !== 'none' && flags.dynamicSections !== 'static' && 'IntersectionObserver' in window;
    if (!animate) {
      // Basic must not mark unseen sections as already animated. Otherwise a later
      // High/Medium selection silently loses all of its scroll entrances.
      reveals.forEach(function (el) { el.classList.remove('is-pending', 'is-revealed'); });
      return;
    }
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { observer.unobserve(en.target); finishReveal(en.target); }
      });
    // Even a fast jump that lands on only the edge of a tall card must reveal it.
    }, { rootMargin: '0px', threshold: 0 });
    var vh = window.innerHeight;
    reveals.forEach(function (el) {
      if (revealed.has(el)) return;
      if (el.getBoundingClientRect().top < vh * 0.92 && el.getBoundingClientRect().height > 0) { el.classList.remove('is-pending'); el.classList.add('is-done'); return; }
      el.classList.remove('is-done');
      el.classList.add('is-pending');
      observer.observe(el);
    });
  }

  /* ---------- Portfolio filter (links work without JavaScript) ---------- */
  var filters = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
  var projects = Array.prototype.slice.call(document.querySelectorAll('.project'));
  var filterStatus = $('filter-status');
  var names = { all: '', branding: 'branding ', web: 'web ', multimedia: 'multimedia ' };

  function applyFilter(cat, announce) {
    var count = 0;
    filters.forEach(function (f) {
      var on = f.getAttribute('data-filter') === cat;
      f.classList.toggle('is-active', on);
      f.setAttribute('aria-pressed', String(on));
    });
    projects.forEach(function (p) {
      var show = cat === 'all' || p.getAttribute('data-category') === cat;
      p.classList.toggle('is-hidden', !show);
      if (show) { count++; p.classList.remove('is-pending'); p.classList.add('is-done'); }
    });
    if (announce) filterStatus.textContent = 'Showing ' + count + ' ' + (names[cat] || '') + 'project' + (count === 1 ? '' : 's');
  }
  filters.forEach(function (f) {
    f.addEventListener('click', function (e) {
      e.preventDefault();
      var cat = f.getAttribute('data-filter');
      applyFilter(cat, true);
      history.replaceState(null, '', '?category=' + cat + '#work');
    });
  });
  document.querySelectorAll('[data-filter-link]').forEach(function (a) {
    a.addEventListener('click', function () { applyFilter(a.getAttribute('data-filter-link'), true); });
  });
  var initialCat = new URLSearchParams(location.search).get('category');
  if (initialCat && Object.prototype.hasOwnProperty.call(names, initialCat)) applyFilter(initialCat, false);

  /* ---------- Testimonials ---------- */
  var tm = $('tm'), track = $('tm-track'), controls = $('tm-controls'), dotsWrap = $('tm-dots'), pauseBtn = $('tm-pause');
  var items = Array.prototype.slice.call(track.children);
  var index = 0, autoTimer = null, userPaused = false, hoverPaused = false;

  items.forEach(function (_, i) {
    var d = document.createElement('button');
    d.type = 'button';
    d.className = 'tm__dot';
    d.setAttribute('aria-label', 'Show testimonial ' + (i + 1));
    d.addEventListener('click', function () { go(i, true); });
    dotsWrap.appendChild(d);
  });
  var dots = Array.prototype.slice.call(dotsWrap.children);

  function go(i, fromUser) {
    index = (i + items.length) % items.length;
    var variant = tm.getAttribute('data-variant');
    if (variant === 'static-list') return;
    track.style.transform = 'translateX(' + (-index * 100) + '%)';
    items.forEach(function (it, n) {
      it.classList.toggle('is-current', n === index);
      if (n === index) it.removeAttribute('inert'); else it.setAttribute('inert', '');
    });
    dots.forEach(function (d, n) { d.setAttribute('aria-current', String(n === index)); });
    track.parentNode.setAttribute('aria-live', fromUser ? 'polite' : 'off');
    if (fromUser) restartAuto();
  }

  function stopAuto() { clearInterval(autoTimer); autoTimer = null; }
  function restartAuto() {
    stopAuto();
    if (!flags || !flags.testimonialsAutoAdvance || userPaused || hoverPaused || document.hidden) return;
    autoTimer = setInterval(function () { go(index + 1, false); }, 7000);
  }

  $('tm-prev').addEventListener('click', function () { go(index - 1, true); });
  $('tm-next').addEventListener('click', function () { go(index + 1, true); });
  pauseBtn.addEventListener('click', function () {
    userPaused = !userPaused;
    pauseBtn.setAttribute('aria-label', userPaused ? 'Play testimonials' : 'Pause testimonials');
    pauseBtn.innerHTML = userPaused ? '&#9654;' : '&#10074;&#10074;';
    restartAuto();
  });
  tm.addEventListener('mouseenter', function () { hoverPaused = true; stopAuto(); });
  tm.addEventListener('mouseleave', function () { hoverPaused = false; restartAuto(); });
  tm.addEventListener('focusin', function () { hoverPaused = true; stopAuto(); });
  tm.addEventListener('focusout', function (e) { if (!tm.contains(e.relatedTarget)) { hoverPaused = false; restartAuto(); } });
  document.addEventListener('visibilitychange', restartAuto);

  function setupTestimonials() {
    var variant = flags.testimonials;
    tm.setAttribute('data-variant', variant);
    if (variant === 'static-list') {
      stopAuto();
      controls.hidden = true;
      track.style.transform = '';
      items.forEach(function (it) { it.removeAttribute('inert'); it.classList.remove('is-current'); });
      tm.removeAttribute('aria-roledescription');
      return;
    }
    tm.setAttribute('aria-roledescription', 'carousel');
    controls.hidden = false;
    pauseBtn.hidden = !flags.testimonialsAutoAdvance;
    go(index, false);
    restartAuto();
  }

  /* ---------- Hero pause control ---------- */
  var heroPause = $('hero-pause'), heroPaused = false;
  if (heroPause) heroPause.addEventListener('click', function () {
    heroPaused = !heroPaused;
    heroPause.setAttribute('aria-pressed', String(heroPaused));
    heroPause.querySelector('.media-pause__text').textContent = heroPaused ? 'Play background animation' : 'Pause background animation';
    root.classList.toggle('is-paused', heroPaused);
    if (S.highEffects) S.highEffects.setPaused(heroPaused);
  });
  S.heroPaused = function () { return heroPaused; };

  function setupHero() {
    if (!heroPause) return;
    var moving = root.getAttribute('data-motion') === 'full' && (flags.animatedBackground === 'webgl' || flags.animatedBackground === 'css-gradient');
    heroPause.hidden = !moving;
  }

  // The email draft form is handled independently by contact-email.js.

  $('year').textContent = String(new Date().getFullYear());

  /* ---------- React to the engine ---------- */
  function onMode(e) {
    flags = (e.detail && e.detail.flags) || S.state.flags;
    if (!flags) return;
    setupReveals();
    setupTestimonials();
    setupHero();
    if (flags.navigation !== 'full') header.classList.remove('is-tucked');
    var highIntro = root.getAttribute('data-mode') === 'high' && root.getAttribute('data-motion') === 'full';
    if (!highIntro) releaseIntro();
    else if (!introTimer && root.classList.contains('intro-pending')) introTimer = setTimeout(releaseIntro, 2500);
  }
  document.addEventListener('adaptive:ready', onMode);
  document.addEventListener('adaptive:modechange', onMode);
})(window.Sypher);
