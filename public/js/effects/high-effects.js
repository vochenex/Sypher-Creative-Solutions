/* HIGH-only effects, loaded on demand after GSAP + ScrollTrigger: hero choreography, WebGL light field,
   scroll scenes, magnetic buttons, spotlight borders. Never downloaded in MEDIUM or BASIC.
   Everything is reverted by stop(), and nothing runs under reduced motion. */
(function (S) {
  'use strict';

  var gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  var root = document.documentElement;
  var finePointer = null;
  try {
    if (window.matchMedia) finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  } catch (e) {
    finePointer = null;
  }
  var EASE = 'expo.out';

  function release() {
    if (S.releaseIntro) S.releaseIntro();
    else root.classList.remove('intro-pending');
  }

  /* ---------- WebGL hero: a soft light field drifting across the paper card ---------- */

  var VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  var FRAG = [
    'precision mediump float;',
    'uniform vec2 u_res; uniform float u_time; uniform vec2 u_mouse;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
    'float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / u_res;',
    '  float asp = u_res.x / u_res.y;',
    '  vec2 p = uv * vec2(asp, 1.0) * 1.35;',
    '  float t = u_time * 0.04;',
    '  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));',
    '  vec2 r = vec2(fbm(p + 2.6 * q + vec2(1.7, 9.2) + t * 1.4), fbm(p + 2.6 * q + vec2(8.3, 2.8) - t));',
    '  float f = fbm(p + 2.8 * r + (u_mouse - 0.5) * 0.6);',
    '  vec3 paper = vec3(0.949, 0.953, 0.937);',
    '  vec3 silk  = vec3(0.880, 0.894, 0.862);',
    '  vec3 lime  = vec3(0.749, 0.886, 0.435);',
    '  vec3 col = mix(paper, silk, smoothstep(0.45, 0.95, f) * 0.75);',
    '  float low = smoothstep(0.85, 0.05, uv.y);',
    '  col = mix(col, lime, smoothstep(0.55, 1.05, length(q) + r.y * 0.35) * 0.55 * low);',
    '  vec2 m = vec2(u_mouse.x * asp, u_mouse.y);',
    '  float glow = smoothstep(0.55, 0.0, distance(vec2(uv.x * asp, uv.y), m));',
    '  col = mix(col, lime, glow * 0.22);',
    '  float headline = smoothstep(0.42, 0.0, abs(uv.x - 0.5)) * smoothstep(0.55, 0.9, uv.y);',
    '  col = mix(col, paper, headline * 0.75);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var hero = {
    canvas: document.getElementById('hero-canvas'),
    gl: null, uRes: null, uTime: null, uMouse: null,
    raf: null, visible: true, paused: false, elapsed: 0, last: 0,
    mouse: [0.5, 0.35], target: [0.5, 0.35], observer: null
  };

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function heroInit() {
    if (hero.gl) return true;
    if (!hero.canvas) hero.canvas = document.getElementById('hero-canvas');
    if (!hero.canvas) return false;
    var opts = { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false };
    // Prefer WebGL2 when available (Safari/iOS flagships); fall back to WebGL1 aliases.
    var gl = hero.canvas.getContext('webgl2', opts) ||
      hero.canvas.getContext('webgl', opts) ||
      hero.canvas.getContext('experimental-webgl', opts);
    if (!gl) return false;
    try {
      var prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      gl.useProgram(prog);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      hero.gl = gl;
      hero.uRes = gl.getUniformLocation(prog, 'u_res');
      hero.uTime = gl.getUniformLocation(prog, 'u_time');
      hero.uMouse = gl.getUniformLocation(prog, 'u_mouse');
    } catch {
      return false;
    }
    hero.canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); heroStop(); });
    return true;
  }

  function heroResize() {
    var scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.5;
    var w = Math.max(1, Math.round(hero.canvas.clientWidth * scale));
    var h = Math.max(1, Math.round(hero.canvas.clientHeight * scale));
    if (hero.canvas.width !== w || hero.canvas.height !== h) {
      hero.canvas.width = w; hero.canvas.height = h;
      hero.gl.viewport(0, 0, w, h);
    }
  }

  function heroFrame(now) {
    hero.raf = null;
    if (!hero.gl) return;
    var running = hero.visible && !hero.paused && !document.hidden;
    if (running) hero.elapsed += Math.min(50, now - (hero.last || now));
    hero.last = now;
    hero.mouse[0] += (hero.target[0] - hero.mouse[0]) * 0.04;
    hero.mouse[1] += (hero.target[1] - hero.mouse[1]) * 0.04;
    heroResize();
    var gl = hero.gl;
    gl.uniform2f(hero.uRes, hero.canvas.width, hero.canvas.height);
    gl.uniform1f(hero.uTime, hero.elapsed / 1000 + 20.0);
    gl.uniform2f(hero.uMouse, hero.mouse[0], hero.mouse[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (running) hero.raf = requestAnimationFrame(heroFrame);
  }

  function heroKick() { if (!hero.raf && hero.gl) { hero.last = performance.now(); hero.raf = requestAnimationFrame(heroFrame); } }

  function heroStart() {
    if (!heroInit()) return;
    hero.canvas.classList.add('is-live');
    if (!hero.observer && 'IntersectionObserver' in window) {
      hero.observer = new IntersectionObserver(function (en) { hero.visible = en[0].isIntersecting; if (hero.visible) heroKick(); });
      hero.observer.observe(hero.canvas);
    }
    heroKick();
  }

  function heroStop() {
    hero.canvas.classList.remove('is-live');
    if (hero.raf) cancelAnimationFrame(hero.raf);
    hero.raf = null;
    if (hero.observer) { hero.observer.disconnect(); hero.observer = null; }
    if (hero.gl) {
      var ext = hero.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
      hero.gl = null;
      // A lost context cannot be reused; swap in a fresh canvas for the next start.
      var fresh = hero.canvas.cloneNode(false);
      hero.canvas.parentNode.replaceChild(fresh, hero.canvas);
      hero.canvas = fresh;
    }
  }

  document.addEventListener('visibilitychange', function () { if (!document.hidden) heroKick(); });

  /* ---------- Pointer: hero light, spotlight borders, magnetic buttons ---------- */

  var pointerOn = false;
  var magnets = [];

  function onPointerMove(e) {
    if (!pointerOn || e.pointerType !== 'mouse') return;
    if (hero.gl) {
      var r = hero.canvas.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) hero.target = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
    }
    if (sheetOn) {
      var hs = sheet.getBoundingClientRect();
      if (e.clientX >= hs.left && e.clientX <= hs.right && e.clientY >= hs.top && e.clientY <= hs.bottom) {
        sheetRY(((e.clientX - hs.left) / hs.width - 0.5) * 6);
        sheetRX(-((e.clientY - hs.top) / hs.height - 0.5) * 4.5);
      }
    }
    var spot = e.target.closest && e.target.closest('[data-spot]');
    if (spot) {
      var b = spot.getBoundingClientRect();
      spot.style.setProperty('--mx', (e.clientX - b.left).toFixed(0) + 'px');
      spot.style.setProperty('--my', (e.clientY - b.top).toFixed(0) + 'px');
      spot.classList.add('is-lit');
    }
  }
  function onPointerOut(e) {
    var spot = e.target.closest && e.target.closest('[data-spot]');
    if (spot && !spot.contains(e.relatedTarget)) spot.classList.remove('is-lit');
    if (sheetOn && sheet.contains(e.target) && !(e.relatedTarget && sheet.contains(e.relatedTarget))) {
      gsap.to(sheet, { rotationX: 0, rotationY: 0, duration: 0.8, ease: 'power3.out', overwrite: 'auto' });
    }
  }
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerout', onPointerOut);

  function magnetsStart() {
    magnets = Array.prototype.map.call(document.querySelectorAll('[data-magnetic]'), function (el) {
      var xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
      var yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
      function move(e) {
        if (e.pointerType !== 'mouse') return;
        var r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.28);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.36);
      }
      function leave() { gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)', overwrite: true }); }
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
      return { el: el, move: move, leave: leave };
    });
  }
  /* 3D tilt. The hero sheet can rotate because it is already isolated, so the portrait blend stays inside the card. */
  var sheet = document.querySelector('.hero__sheet');
  var sheetRX = null, sheetRY = null, sheetOn = false;
  var tilts = [];

  function sheetTiltStart() {
    if (sheetOn) return;
    sheetOn = true;
    gsap.set(sheet, { transformPerspective: 1600, transformOrigin: '50% 42%' });
    sheetRX = gsap.quickTo(sheet, 'rotationX', { duration: 0.8, ease: 'power3.out' });
    sheetRY = gsap.quickTo(sheet, 'rotationY', { duration: 0.8, ease: 'power3.out' });
  }
  function sheetTiltStop() {
    sheetOn = false;
    gsap.set(sheet, { clearProps: 'transform' });
  }

  function tiltsStart() {
    if (tilts.length) return;
    tilts = Array.prototype.map.call(document.querySelectorAll('.stat, .project, .mini-card, .reel-banner'), function (el) {
      gsap.set(el, { transformPerspective: 800, transformOrigin: 'center center' });
      var rx = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3.out' });
      var ry = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3.out' });
      function move(e) {
        if (e.pointerType !== 'mouse') return;
        var b = el.getBoundingClientRect();
        ry(((e.clientX - b.left) / b.width - 0.5) * 12);
        rx(-((e.clientY - b.top) / b.height - 0.5) * 9);
      }
      function leave() { gsap.to(el, { rotationX: 0, rotationY: 0, duration: 0.7, ease: 'power3.out', overwrite: 'auto' }); }
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
      return { el: el, move: move, leave: leave };
    });
  }
  function tiltsStop() {
    tilts.forEach(function (t) {
      t.el.removeEventListener('pointermove', t.move);
      t.el.removeEventListener('pointerleave', t.leave);
      gsap.set(t.el, { clearProps: 'transform' });
    });
    tilts = [];
  }

  function magnetsStop() {
    magnets.forEach(function (m) {
      m.el.removeEventListener('pointermove', m.move);
      m.el.removeEventListener('pointerleave', m.leave);
      gsap.set(m.el, { clearProps: 'transform' });
    });
    magnets = [];
  }

  /* ---------- Scroll scenes (one gsap.context so stop() reverts everything) ---------- */

  var ctx = null, introPlayed = false;
  var header = document.getElementById('site-header');

  function intro() {
    var title = document.querySelector('.hero__title.is-split');
    if (introPlayed || !title || window.scrollY > 120) { release(); return; }
    introPlayed = true;
    var words = title.querySelectorAll('.w__i');
    gsap.set(words, { yPercent: 115 });
    gsap.set('.hero__disc', { scale: 0.55, opacity: 0 });
    gsap.set('.hero__portrait img', { yPercent: 16, opacity: 0 });
    gsap.set('[data-intro="aside"]', { opacity: 0, y: 18 });
    gsap.set('[data-intro="ctas"]', { opacity: 0, y: 24 });
    gsap.set('[data-intro="spark"]', { scale: 0, rotation: -120 });
    release();

    gsap.timeline({ defaults: { ease: EASE } })
      .to(words, { yPercent: 0, duration: 1.15, stagger: 0.045 })
      .to('.hero__disc', { scale: 1, opacity: 1, duration: 1.4 }, 0.2)
      .to('.hero__portrait img', { yPercent: 0, opacity: 1, duration: 1.4 }, 0.32)
      .to('[data-intro="spark"]', { scale: 1, rotation: 0, duration: 1.3, ease: 'back.out(2.2)', stagger: 0.12 }, 0.55)
      .to('[data-intro="aside"]', { opacity: 1, y: 0, duration: 1, stagger: 0.1 }, 0.7)
      .to('[data-intro="ctas"]', { opacity: 1, y: 0, duration: 1 }, 0.82);
  }

  function countFinal(el) {
    return parseFloat(el.getAttribute('data-count')).toFixed(parseInt(el.getAttribute('data-decimals') || '0', 10));
  }

  function countUp() {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
      var state = { v: 0 };
      if (el.getBoundingClientRect().top < window.innerHeight * 0.88 && window.scrollY > 120) return;
      el.textContent = (0).toFixed(decimals);
      gsap.to(state, {
        v: target, duration: 1.8, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        onUpdate: function () { el.textContent = state.v.toFixed(decimals); }
      });
    });
  }

  function buildScenes(flags) {
    ctx = gsap.context(function () {
      intro();

      gsap.to('.hero__spark--a', { rotation: 360, duration: 40, ease: 'none', repeat: -1 });

      ScrollTrigger.create({
        start: 0, end: 'max',
        onUpdate: function (self) {
          var tuck = flags.navigation === 'full' && self.direction === 1 && self.scroll() > 160 && !(S.menuOpen && S.menuOpen());
          header.classList.toggle('is-tucked', tuck);
        }
      });

      countUp();

      if (flags.parallax) {
        // Transform the title and image themselves: a transformed ancestor of the portrait would isolate its multiply blend.
        var heroScroll = function () { return { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }; };
        gsap.to('.hero__title', { y: -60, ease: 'none', scrollTrigger: heroScroll() });
        gsap.to(['.hero__portrait img', '.hero__disc'], { y: 70, ease: 'none', scrollTrigger: heroScroll() });
        document.querySelectorAll('[data-parallax]').forEach(function (img) {
          gsap.fromTo(img, { yPercent: -5 }, {
            yPercent: 5, ease: 'none',
            scrollTrigger: { trigger: img.parentNode, start: 'top bottom', end: 'bottom top', scrub: true }
          });
        });
      }

      document.querySelectorAll('.stroke-draw').forEach(function (path) {
        gsap.fromTo(path, { strokeDashoffset: 1 }, {
          strokeDashoffset: 0, duration: 1.15, ease: 'power3.out',
          scrollTrigger: { trigger: path.closest('.reel-banner, .video-block') || path, start: 'top 88%', once: true }
        });
      });

      gsap.fromTo('.video-block', {
        clipPath: 'inset(6% 7% 6% 7% round 56px)', rotationX: 12, transformPerspective: 1200, transformOrigin: 'center bottom'
      }, {
        clipPath: 'inset(0% 0% 0% 0% round 32px)', rotationX: 0, ease: 'none',
        scrollTrigger: { trigger: '.video-block', start: 'top 92%', end: 'center 58%', scrub: 0.6 }
      });
      gsap.fromTo('.services__panel', { rotationX: 7, transformPerspective: 1400, transformOrigin: 'center top' }, {
        rotationX: 0, ease: 'none',
        scrollTrigger: { trigger: '.services__panel', start: 'top 95%', end: 'top 45%', scrub: true }
      });

      gsap.fromTo('#steps', { '--progress': 0 }, {
        '--progress': 1, ease: 'none',
        scrollTrigger: { trigger: '#steps', start: 'top 82%', end: 'bottom 62%', scrub: 0.5 }
      });

      var loop = gsap.to('.marquee__track', { xPercent: -50, ease: 'none', duration: 42, repeat: -1 });
      ScrollTrigger.create({
        trigger: '.marquee', start: 'top bottom', end: 'bottom top',
        onToggle: function (self) { if (self.isActive) loop.play(); else loop.pause(); },
        onUpdate: function (self) {
          var boost = Math.min(5, Math.abs(self.getVelocity()) / 350);
          gsap.timeline({ overwrite: true })
            .to(loop, { timeScale: 1 + boost, duration: 0.25, ease: 'power2.out' })
            .to(loop, { timeScale: 1, duration: 1.4, ease: 'power2.out' });
        }
      });
    });
  }

  /* ---------- Public ---------- */

  var started = false;

  S.highEffects = {
    start: function (flags, meta) {
      flags = flags || {};
      meta = meta || {};
      // Refuse incompatible or stale generations so Basic/Medium/reduced never keep High motion.
      if (root.getAttribute('data-mode') !== 'high') { this.stop(); return false; }
      if (root.getAttribute('data-motion') !== 'full') { this.stop(); release(); return false; }
      if (typeof meta.getEpoch === 'function' && meta.epoch != null && meta.getEpoch() !== meta.epoch) {
        this.stop();
        return false;
      }

      if (flags.webglScene) heroStart(); else heroStop();
      hero.paused = S.heroPaused ? S.heroPaused() : false;

      pointerOn = !!flags.cursorEffects && !!(finePointer && finePointer.matches);
      if (pointerOn) sheetTiltStart(); else sheetTiltStop();
      if (flags.hoverEffects === 'tilt-preview' && finePointer && finePointer.matches) {
        if (!magnets.length) magnetsStart();
        tiltsStart();
      } else { magnetsStop(); tiltsStop(); }

      if (!started) {
        started = true;
        try {
          buildScenes(flags);
          window.addEventListener('load', function () { ScrollTrigger.refresh(); }, { once: true });
        } catch (err) {
          started = false;
          if (ctx) { try { ctx.revert(); } catch (e) { /* ignore */ } ctx = null; }
          release();
          return false;
        }
      }
      return true;
    },
    stop: function () {
      started = false;
      introPlayed = false;
      heroStop();
      pointerOn = false;
      document.querySelectorAll('[data-spot].is-lit').forEach(function (el) { el.classList.remove('is-lit'); });
      magnetsStop();
      tiltsStop();
      sheetTiltStop();
      if (header) header.classList.remove('is-tucked');
      if (ctx) { ctx.revert(); ctx = null; }
      try {
        if (ScrollTrigger && ScrollTrigger.getAll) {
          ScrollTrigger.getAll().forEach(function (t) { t.kill(); });
        }
      } catch (e) { /* ignore */ }
      document.querySelectorAll('[data-count]').forEach(function (el) { el.textContent = countFinal(el); });
    },
    setPaused: function (p) { hero.paused = p; if (!p) heroKick(); },
    isActive: function () { return !!started; }
  };
})(window.Sypher);
