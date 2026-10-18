(function () {
  'use strict';
  var carousel = document.getElementById('promo-carousel');
  if (!carousel) return;
  var viewport = carousel.querySelector('.film-carousel__viewport');
  var cards = Array.from(carousel.querySelectorAll('.film-card'));
  var videos = cards.map(function (card) { return card.querySelector('video'); });
  var status = document.getElementById('promo-status');
  var dots = [], index = 2, drag = null, suppressClickUntil = 0;

  function stop(i) {
    videos[i].pause();
    videos[i].controls = false;
    videos[i].tabIndex = -1;
    cards[i].classList.remove('is-engaged');
  }
  function select(next, announce) {
    next = (next + cards.length) % cards.length;
    cards.forEach(function (card, i) {
      var offset = (i - next + cards.length) % cards.length;
      if (offset > Math.floor(cards.length / 2)) offset -= cards.length;
      var previous = Number(card.style.getPropertyValue('--film-offset'));
      card.classList.toggle('is-jumping', Math.abs(offset - previous) > 2);
      card.style.setProperty('--film-offset', offset);
      card.classList.toggle('is-current', i === next);
      if (i !== next) stop(i);
      videos[i].tabIndex = i === next && videos[i].controls ? 0 : -1;
      dots[i].setAttribute('aria-pressed', String(i === next));
    });
    index = next;
    if (announce) status.textContent = String(index + 1).padStart(2, '0') + ' / 05 — ' + cards[index].dataset.filmName;
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      cards.forEach(function (card) { card.classList.remove('is-jumping'); });
    }); });
  }
  cards.forEach(function (card, i) {
    var dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'film-carousel__dot';
    dot.setAttribute('aria-label', 'Show ' + card.dataset.filmName + ' film');
    dot.setAttribute('aria-controls', card.id);
    dot.addEventListener('click', function () { select(i, true); });
    carousel.querySelector('.film-carousel__dots').appendChild(dot);
    dots.push(dot);
    videos[i].controls = false;
    card.addEventListener('click', function (event) {
      if (performance.now() < suppressClickUntil || event.target.closest('button, a') || (event.target === videos[i] && videos[i].controls)) return;
      select(i, true);
    });
    card.querySelector('.film-card__play').addEventListener('click', function () {
      if (performance.now() < suppressClickUntil) return;
      select(i, true);
      card.classList.add('is-engaged');
      videos[i].controls = true;
      videos[i].tabIndex = 0;
      var playing = videos[i].play();
      if (playing && playing.catch) playing.catch(function () {
        card.classList.remove('is-engaged');
        videos[i].controls = false;
      });
      videos[i].focus({ preventScroll: true });
    });
    videos[i].addEventListener('play', function () {
      videos.forEach(function (_, n) { if (n !== i) stop(n); });
    });
    videos[i].addEventListener('ended', function () { stop(i); });
    function showError() { card.querySelector('.film-card__error').hidden = false; }
    videos[i].addEventListener('error', showError);
    videos[i].querySelector('source').addEventListener('error', showError);
    card.querySelector('.film-card__play').addEventListener('focus', function (event) {
      if (index !== i && event.target.matches(':focus-visible')) select(i, true);
    });
  });
  document.getElementById('promo-prev').addEventListener('click', function () { select(index - 1, true); });
  document.getElementById('promo-next').addEventListener('click', function () { select(index + 1, true); });
  carousel.addEventListener('keydown', function (event) {
    if (event.target.matches('video, a')) return;
    var next;
    if (event.key === 'ArrowRight') next = index + 1;
    else if (event.key === 'ArrowLeft') next = index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = cards.length - 1;
    else return;
    event.preventDefault();
    select(next, true);
    if (event.target.classList.contains('film-card__play')) cards[index].querySelector('.film-card__play').focus({ preventScroll: true });
    else if (event.target.classList.contains('film-carousel__dot')) dots[index].focus({ preventScroll: true });
  });
  viewport.addEventListener('pointerdown', function (event) {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('button, a') || (event.target.matches('video') && event.target.controls)) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  viewport.addEventListener('pointermove', function (event) {
    if (!drag || drag.id !== event.pointerId) return;
    var dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      viewport.setPointerCapture(event.pointerId);
      if (event.cancelable) event.preventDefault();
    }
  });
  viewport.addEventListener('pointerup', function (event) {
    if (!drag || drag.id !== event.pointerId) return;
    var dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      suppressClickUntil = performance.now() + 350;
      select(index + (dx < 0 ? 1 : -1), true);
    }
    drag = null;
  });
  viewport.addEventListener('pointercancel', function () { drag = null; });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) videos.forEach(function (video) { video.pause(); });
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) videos.forEach(function (video) { video.pause(); });
    }).observe(carousel);
  }
  select(index, false);
  carousel.classList.add('is-ready');
  carousel.querySelector('.film-carousel__controls').hidden = false;
})();
