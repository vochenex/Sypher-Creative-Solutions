(function () {
  'use strict';

  var viewer = document.getElementById('artwork-viewer');
  if (!viewer || typeof viewer.showModal !== 'function') return;
  var links = Array.from(document.querySelectorAll('a[data-gallery]'));
  var title = viewer.querySelector('[data-viewer-title]');
  var image = viewer.querySelector('[data-viewer-image]');
  var original = viewer.querySelector('[data-viewer-original]');
  var status = viewer.querySelector('[data-viewer-status]');
  var counter = viewer.querySelector('[data-viewer-counter]');
  var previous = viewer.querySelector('[data-viewer-previous]');
  var next = viewer.querySelector('[data-viewer-next]');
  var zoom = viewer.querySelector('[data-viewer-zoom]');
  var current = [], index = 0, opener = null, previousOverflow = '';

  function show(position) {
    index = (position + current.length) % current.length;
    var link = current[index];
    title.textContent = link.dataset.title;
    image.alt = link.dataset.alt || link.querySelector('img').alt;
    status.textContent = 'Loading artwork…';
    image.src = link.href;
    original.href = link.href;
    counter.textContent = (index + 1) + ' / ' + current.length;
    previous.hidden = next.hidden = current.length < 2;
  }

  links.forEach(function (link) {
    link.addEventListener('click', function (event) {
      // Keep normal link behavior for new-tab, download, and modifier-key actions.
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      current = links.filter(function (item) { return item.dataset.gallery === link.dataset.gallery; });
      show(current.indexOf(link));
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      viewer.showModal();
    });
  });
  image.addEventListener('load', function () { status.textContent = ''; });
  image.addEventListener('error', function () { status.textContent = 'Unable to load this preview. Open the original artwork below.'; });
  previous.addEventListener('click', function () { show(index - 1); });
  next.addEventListener('click', function () { show(index + 1); });
  if (zoom) zoom.addEventListener('click', function () {
    var actual = viewer.classList.toggle('is-actual-size');
    zoom.setAttribute('aria-pressed', String(actual));
    zoom.textContent = actual ? 'Fit screenshot' : 'Actual size';
  });
  viewer.querySelector('[data-viewer-close]').addEventListener('click', function () { viewer.close(); });
  viewer.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
  });
  viewer.addEventListener('click', function (event) {
    if (event.target === viewer) viewer.close();
  });
  viewer.addEventListener('close', function () {
    document.body.style.overflow = previousOverflow;
    viewer.classList.remove('is-actual-size');
    if (zoom) { zoom.setAttribute('aria-pressed', 'false'); zoom.textContent = 'Actual size'; }
    if (opener) opener.focus({ preventScroll: true });
  });
})();
