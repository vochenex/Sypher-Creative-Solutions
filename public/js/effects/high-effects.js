/* HIGH-only effects, loaded on demand: WebGL flow-field hero, cursor light, card tilt, parallax.
   Never downloaded in MEDIUM or BASIC. Everything pauses when off-screen or the tab is hidden. */
(function (S) {
  'use strict';

  var root = document.documentElement;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* ---------- WebGL hero ---------- */

  var VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  var FRAG = [
    'precision mediump float;',
    'uniform vec2 u_res; uniform float u_time; uniform vec2 u_mouse;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
    'float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / u_res;',
    '  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) * 1.6;',
    '  float t = u_time * 0.045;',
    '  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));',
    '  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 1.5), fbm(p + 3.0 * q + vec2(8.3, 2.8) - t));',
    '  float f = fbm(p + 3.0 * r + (u_mouse - 0.5) * 0.8);',
    '  vec3 base = vec3(0.055, 0.067, 0.086);',
    '  vec3 sage = vec3(0.32, 0.45, 0.44);',
    '  vec3 lav  = vec3(0.40, 0.37, 0.53);',
    '  vec3 sand = vec3(0.50, 0.42, 0.30);',
    '  vec3 col = mix(base, sage, smoothstep(0.35, 0.95, f) * 0.6);',
    '  col = mix(col, lav, smoothstep(0.25, 0.9, length(q)) * 0.38);',
    '  col = mix(col, sand, smoothstep(0.62, 1.0, r.x) * 0.18);',
    '  float glow = smoothstep(0.9, 0.0, distance(uv, vec2(0.5 + (u_mouse.x - 0.5) * 0.3, 0.55 + (u_mouse.y - 0.5) * 0.2)));',
    '  col += sage * glow * 0.06;',
    '  col = mix(col, base, smoothstep(0.65, 0.0, uv.x) * 0.55);',
    '  col = mix(col, base, smoothstep(0.45, 0.0, uv.y) * 0.75);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var hero = {
    canvas: document.getElementById('hero-canvas'),
    gl: null, prog: null, uRes: null, uTime: null, uMouse: null,
    raf: null, visible: true, paused: false, t0: performance.now(), elapsed: 0, last: 0,
    mouse: [0.5, 0.5], target: [0.5, 0.5], observer: null
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
    var gl = hero.canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
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
      hero.gl = gl; hero.prog = prog;
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
    gl.uniform1f(hero.uTime, hero.elapsed / 1000 + 12.0);
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

  /* ---------- Cursor light ---------- */

  var glow = null, glowRaf = null, gx = -999, gy = -999;
  function onPointer(e) {
    gx = e.clientX; gy = e.clientY;
    var r = hero.canvas.getBoundingClientRect();
    if (gy >= r.top && gy <= r.bottom) hero.target = [(gx - r.left) / r.width, 1 - (gy - r.top) / r.height];
    if (glow && !glowRaf) glowRaf = requestAnimationFrame(function () {
      glowRaf = null;
      glow.style.setProperty('--cx', gx + 'px');
      glow.style.setProperty('--cy', gy + 'px');
      glow.classList.add('is-on');
    });
  }
  function onLeave() { if (glow) glow.classList.remove('is-on'); }

  function cursorStart() {
    if (!glow) {
      glow = document.createElement('div');
      glow.className = 'cursor-glow';
      glow.setAttribute('aria-hidden', 'true');
      document.body.appendChild(glow);
    }
  }
  function cursorStop() {
    if (glow) { glow.parentNode.removeChild(glow); glow = null; }
  }

  /* ---------- Card tilt ---------- */

  var tiltOn = false;
  function tiltMove(e) {
    if (!tiltOn) return;
    var card = e.target.closest('[data-tilt]');
    if (!card) return;
    var r = card.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    card.style.setProperty('--ry', ((x - 0.5) * 10).toFixed(2) + 'deg');
    card.style.setProperty('--rx', ((0.5 - y) * 8).toFixed(2) + 'deg');
    var target = card.classList.contains('project') ? card.querySelector('.project__link') : card;
    target.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
    target.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
    card.classList.add('is-tilting');
  }
  function tiltOut(e) {
    var card = e.target.closest('[data-tilt]');
    if (!card || card.contains(e.relatedTarget)) return;
    card.classList.remove('is-tilting');
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  }
  function tiltStop() {
    tiltOn = false;
    document.querySelectorAll('[data-tilt]').forEach(function (c) {
      c.classList.remove('is-tilting');
      c.style.removeProperty('--rx');
      c.style.removeProperty('--ry');
    });
  }
  document.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    onPointer(e);
    tiltMove(e);
  }, { passive: true });
  document.addEventListener('pointerout', tiltOut);
  document.documentElement.addEventListener('mouseleave', onLeave);

  /* ---------- Parallax ---------- */

  var parallaxOn = false, pRaf = null;
  var heroMedia = document.querySelector('.hero__media'), heroContent = document.querySelector('.hero__content');
  function parallaxFrame() {
    pRaf = null;
    if (!parallaxOn) return;
    var y = Math.min(window.scrollY, window.innerHeight);
    heroMedia.style.transform = 'translate3d(0,' + (y * 0.15).toFixed(1) + 'px,0)';
    heroContent.style.transform = 'translate3d(0,' + (y * 0.08).toFixed(1) + 'px,0)';
    heroContent.style.opacity = String(Math.max(0.2, 1 - y / (window.innerHeight * 0.9)));
  }
  window.addEventListener('scroll', function () { if (parallaxOn && !pRaf) pRaf = requestAnimationFrame(parallaxFrame); }, { passive: true });
  function parallaxStop() {
    parallaxOn = false;
    heroMedia.style.transform = '';
    heroContent.style.transform = '';
    heroContent.style.opacity = '';
  }

  /* ---------- Public ---------- */

  S.highEffects = {
    start: function (flags) {
      var motion = root.getAttribute('data-motion') === 'full';
      if (flags.webglScene && motion) heroStart(); else heroStop();
      if (flags.cursorEffects && motion && finePointer.matches) cursorStart(); else cursorStop();
      tiltOn = flags.hoverEffects === 'tilt-preview' && motion && finePointer.matches;
      if (!tiltOn) tiltStop();
      parallaxOn = !!flags.parallax && motion;
      if (parallaxOn) parallaxFrame(); else parallaxStop();
      hero.paused = S.heroPaused ? S.heroPaused() : false;
    },
    stop: function () {
      heroStop();
      cursorStop();
      tiltStop();
      parallaxStop();
    },
    setPaused: function (p) { hero.paused = p; if (!p) heroKick(); }
  };
})(window.Sypher);
