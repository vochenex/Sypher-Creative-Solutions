(function () {
  'use strict';

  var stage = document.getElementById('practice-stage');
  if (!stage) return;

  // Supplied artwork and screenshots for all three service disciplines.
  var work = {
  "branding": [
    {
      "src": "assets/branding/logos/NEXORA.png",
      "title": "Logofolio / 9 logo concepts",
      "alt": "Nexora geometric logo from the nine-logo collection",
      "href": "branding.html"
    },
    {
      "src": "assets/branding/moko-identity.png",
      "title": "Visual Identity / 3 studies",
      "alt": "Moko cat visual identity board",
      "href": "visual-identity.html"
    },
    {
      "src": "assets/branding/social/avengers-social-media.jpg",
      "title": "Social Media Design / AV",
      "alt": "AV Avengers social feed design",
      "href": "social-media.html#social-av"
    },
    {
      "src": "assets/branding/mockups/av/01-avengers-logo-closeup.jpg",
      "title": "Product Mockups / AV",
      "alt": "AV Avengers embroidery logo mockup",
      "href": "product-mockups.html#mockups-av"
    },
    {
      "src": "assets/branding/social/fleura-social-media.jpg",
      "title": "Social Media Design / Fleura",
      "alt": "Fleura floral social feed design",
      "href": "social-media.html#social-fleura"
    },
    {
      "src": "assets/branding/mockups/velora/01-velora-perfume.jpg",
      "title": "Product Mockups / Velora",
      "alt": "Velora perfume and packaging mockup",
      "href": "product-mockups.html#mockups-velora"
    }
  ],
  "web": [
  {
    "src": "assets/web-development/brewora.jpg",
    "title": "Brewora / Web Design",
    "alt": "Brewora desktop landing page with a coffee shake hero, cream background, brown typography, and menu and story calls to action",
    "href": "web-development.html#web-brewora"
  },
  {
    "src": "assets/web-development/ctech.jpg",
    "title": "CTech / Web Design",
    "alt": "CTech desktop storefront with a navy and blue PC-components hero, search and cart controls, and a shop-by-category section",
    "href": "web-development.html#web-ctech"
  },
  {
    "src": "assets/web-development/modusole.jpg",
    "title": "ModuSole / Web Design",
    "alt": "ModuSole desktop footwear homepage with an oversized Step Into Your Style heading, a shoe background, and a Modern Essentials product panel",
    "href": "web-development.html#web-modusole"
  },
  {
    "src": "assets/web-development/putahe.jpg",
    "title": "Putahe / Web Design",
    "alt": "Putahe Product List Management desktop interface with food imagery, product summary cards, search controls, and a Chicken Adobo product entry",
    "href": "web-development.html#web-putahe"
  }
],
  "multimedia": [
  {
    "src": "assets/multimedia/stride-billboard.jpg",
    "title": "Stride / Billboard",
    "alt": "Stride billboard mockup with red and white Train Harder Move Stronger lettering, a strength-training image, and the Stride logo",
    "href": "multimedia.html#stride-billboard"
  },
  {
    "src": "assets/multimedia/stride-brochure.jpg",
    "title": "Stride / Brochure",
    "alt": "Stride folded brochure presentation showing black and red panels with gym imagery, facility information, membership sections, and contact details",
    "href": "multimedia.html#stride-brochure"
  },
  {
    "src": "assets/multimedia/stride-flyer.jpg",
    "title": "Stride / Flyer",
    "alt": "Three Stride flyer layouts with athlete imagery, black red and white typography, fitness icons, and the Stride logo",
    "href": "multimedia.html#stride-flyer"
  },
  {
    "src": "assets/multimedia/stride-poster.jpg",
    "title": "Stride / Poster",
    "alt": "Stride poster presentation with three framed athlete designs above a framed March Events layout on a brick wall",
    "href": "multimedia.html#stride-poster"
  }
]
};
  var labels = { branding: 'Branding', web: 'Web development', multimedia: 'Multimedia' };
  var cards = Array.from(stage.querySelectorAll('.practice-card'));
  var mobile = window.matchMedia('(max-width: 599px)');
  var active = null;
  var positions = [
    [15, 12, -5], [50, 11, 3], [85, 12, -4],
    [15, 88, 4], [50, 89, -3], [85, 88, 5]
  ];

  cards.forEach(function (card, index) {
    var key = card.dataset.practice;
    var panel = document.getElementById('previews-' + key);
    panel.style.setProperty('--origin-x', ((index + 0.5) / 3 * 100) + '%');
    var previewPositions = work[key].length === 4
      ? [positions[0], positions[2], positions[3], positions[5]]
      : positions;
    previewPositions.forEach(function (position, slot) {
      var item = work[key][slot];
      var figure = document.createElement('figure');
      figure.className = 'practice-preview';
      figure.setAttribute('role', 'listitem');
      figure.style.setProperty('--x', position[0] + '%');
      figure.style.setProperty('--y', position[1] + '%');
      figure.style.setProperty('--angle', position[2] + 'deg');
      figure.style.setProperty('--delay', slot * 28 + 'ms');
      var frame = figure;
      frame.classList.add('practice-preview__frame');
      if (item) {
        var img = document.createElement('img');
        img.src = item.src;
        img.alt = item.alt;
        img.loading = 'lazy';
        img.decoding = 'async';
        var link = document.createElement('a');
        link.className = 'practice-preview__link';
        link.href = item.href;
        link.appendChild(img);
        var linkLabel = document.createElement('span');
        linkLabel.textContent = item.title + ' ↗';
        link.appendChild(linkLabel);
        frame.appendChild(link);
      } else {
        var number = document.createElement('span');
        number.className = 'practice-preview__number';
        number.textContent = labels[key].toUpperCase() + ' / 0' + (slot + 1);
        var mark = document.createElement('span');
        mark.className = 'practice-preview__mark';
        mark.textContent = '+';
        mark.setAttribute('aria-hidden', 'true');
        frame.append(number, mark);
      }
      var caption = document.createElement('figcaption');
      caption.textContent = item ? item.title : 'Reserved for a future project';
      if (!item) frame.appendChild(caption);
      panel.appendChild(figure);
    });

    var button = card.querySelector('button');
    button.disabled = false;
    button.addEventListener('click', function () {
      if (active === key) close();
      else show(key);
    });
  });

  function show(key) {
    active = key;
    cards.forEach(function (card) {
      var on = card.dataset.practice === key;
      card.classList.toggle('is-active', on);
      card.querySelector('button').setAttribute('aria-expanded', String(on));
      card.querySelector('.practice-card__foot > span').textContent = on ? '−' : '+';
      var panel = document.getElementById('previews-' + card.dataset.practice);
      panel.classList.toggle('is-active', on);
      panel.setAttribute('aria-hidden', String(!on));
      panel.querySelectorAll('a').forEach(function (link) { link.tabIndex = on ? 0 : -1; });
    });
  }

  function close() {
    if (active) {
      var panel = document.getElementById('previews-' + active);
      if (panel.contains(document.activeElement)) {
        stage.querySelector('[data-practice="' + active + '"] button').focus({ preventScroll: true });
      }
    }
    show(null);
  }
  stage.addEventListener('focusout', function (event) { if (!stage.contains(event.relatedTarget)) close(); });
  document.addEventListener('pointerdown', function (event) { if (!stage.contains(event.target)) close(); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && active) close(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) close(); });

  function layout() {
    close();
    cards.forEach(function (card) {
      var panel = document.getElementById('previews-' + card.dataset.practice);
      // On phones, put the open previews directly after the selected card.
      if (mobile.matches) card.after(panel);
      else stage.appendChild(panel);
    });
    document.getElementById('practice-hint').textContent = 'Select a service to explore the work. Select it again to close.';
  }
  mobile.addEventListener('change', layout);
  document.addEventListener('adaptive:modechange', close);
  layout();
  stage.classList.add('is-ready');
})();
