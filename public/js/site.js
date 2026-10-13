/* Site Sections: navigation, reveals, portfolio filter, testimonials, video, hero pause, contact form.
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

  /* ---------- Header tuck (HIGH only) ---------- */
  var header = $('site-header'), lastY = window.scrollY, ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY;
      var tuckAllowed = flags && flags.navigation === 'full' && root.getAttribute('data-motion') === 'full';
      header.classList.toggle('is-tucked', tuckAllowed && y > 120 && y > lastY && !nav.classList.contains('is-open'));
      lastY = y;
      ticking = false;
    });
  }, { passive: true });
  header.addEventListener('focusin', function () { header.classList.remove('is-tucked'); });

  /* ---------- Headline split ---------- */
  var title = document.querySelector('[data-split]');
  if (title) {
    var words = title.textContent.trim().split(/\s+/);
    title.setAttribute('aria-label', title.textContent.trim());
    title.textContent = '';
    words.forEach(function (w, i) {
      var span = document.createElement('span');
      span.className = 'w';
      span.setAttribute('aria-hidden', 'true');
      span.style.setProperty('--i', i);
      span.textContent = w;
      title.appendChild(span);
      if (i < words.length - 1) title.appendChild(document.createTextNode(' '));
    });
    title.classList.add('is-split');
  }

  /* ---------- Reveals ---------- */
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  var observer = null;
  reveals.forEach(function (el) {
    var siblings = Array.prototype.slice.call(el.parentNode.children).filter(function (n) { return n.classList.contains('reveal'); });
    el.style.setProperty('--stagger', Math.min(siblings.indexOf(el), 6));
  });

  function finishReveal(el) {
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
      reveals.forEach(function (el) { el.classList.remove('is-pending', 'is-revealed'); el.classList.add('is-done'); });
      return;
    }
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { observer.unobserve(en.target); finishReveal(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    var vh = window.innerHeight;
    reveals.forEach(function (el) {
      if (el.classList.contains('is-done')) return;
      if (el.getBoundingClientRect().top < vh * 0.92) { el.classList.add('is-done'); return; }
      el.classList.add('is-pending');
      observer.observe(el);
    });
  }

  /* ---------- Portfolio filter (links work without JavaScript) ---------- */
  var filters = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
  var projects = Array.prototype.slice.call(document.querySelectorAll('.project'));
  var filterStatus = $('filter-status');
  var names = { all: '', branding: 'branding ', web: 'web ', multimedia: 'multimedia ', marketing: 'marketing ' };

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

  /* ---------- Video block ---------- */
  var videoBlock = $('video-block'), playBtn = $('video-play'), player = $('video-player');
  var videoObserver = null;
  playBtn.addEventListener('click', function () {
    player.hidden = false;
    playBtn.hidden = true;
    videoBlock.querySelector('.video-block__poster').hidden = true;
    var video = player.querySelector('video');
    var missing = player.querySelector('.video-block__missing');
    var lastSource = video.querySelectorAll('source');
    lastSource[lastSource.length - 1].addEventListener('error', function () { missing.hidden = false; video.hidden = true; });
    video.load();
    var pr = video.play();
    if (pr && pr.catch) pr.catch(function () {});
    video.focus();
  });

  function setupVideo() {
    if (videoObserver) { videoObserver.disconnect(); videoObserver = null; }
    videoBlock.classList.remove('is-inview');
    playBtn.querySelector('.video-block__play-text').textContent = flags.videoBanners === 'poster-link' ? 'Watch video (2:14)' : 'Play showreel (2:14)';
    if (flags.videoBanners === 'inview-muted' && 'IntersectionObserver' in window) {
      videoObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { videoBlock.classList.toggle('is-inview', en.intersectionRatio >= 0.5); });
      }, { threshold: [0, 0.5] });
      videoObserver.observe(videoBlock);
    }
  }

  /* ---------- Hero pause control ---------- */
  var heroPause = $('hero-pause'), heroPaused = false;
  heroPause.addEventListener('click', function () {
    heroPaused = !heroPaused;
    heroPause.setAttribute('aria-pressed', String(heroPaused));
    heroPause.querySelector('.media-pause__text').textContent = heroPaused ? 'Play background animation' : 'Pause background animation';
    root.classList.toggle('is-paused', heroPaused);
    if (S.highEffects) S.highEffects.setPaused(heroPaused);
  });
  S.heroPaused = function () { return heroPaused; };

  function setupHero() {
    var moving = root.getAttribute('data-motion') === 'full' && (flags.animatedBackground === 'webgl' || flags.animatedBackground === 'css-gradient');
    heroPause.hidden = !moving;
  }

  /* ---------- Contact form (works without effects) ---------- */
  var form = $('contact-form'), formStatus = $('form-status');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = true;
    [['f-name', 'Please enter your name.'], ['f-email', 'Please enter a valid email address.'], ['f-msg', 'Please tell us a little about your project.']].forEach(function (pair) {
      var input = $(pair[0]), err = $(pair[0] + '-err');
      var valid = input.value.trim() !== '' && (input.type !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim()));
      err.textContent = valid ? '' : pair[1];
      input.setAttribute('aria-invalid', String(!valid));
      if (!valid && ok) { input.focus(); ok = false; }
    });
    if (!ok) return;
    form.reset();
    formStatus.textContent = 'Thanks! Your message is on its way. We reply within 1 business day.';
  });

  $('year').textContent = String(new Date().getFullYear());

  /* ---------- React to the engine ---------- */
  function onMode(e) {
    flags = (e.detail && e.detail.flags) || S.state.flags;
    if (!flags) return;
    setupReveals();
    setupTestimonials();
    setupVideo();
    setupHero();
    if (flags.navigation !== 'full') header.classList.remove('is-tucked');
  }
  document.addEventListener('adaptive:ready', onMode);
  document.addEventListener('adaptive:modechange', onMode);
})(window.Sypher);
