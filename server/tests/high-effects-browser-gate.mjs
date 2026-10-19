#!/usr/bin/env node
/**
 * Stage 3 pre-merge gate: launch Chromium with prefers-reduced-motion: no-preference,
 * force High effects, exercise mode transitions, and record highEffects.inspect() snapshots.
 *
 * Usage: node server/tests/high-effects-browser-gate.mjs [baseUrl]
 * Writes JSON report to /opt/cursor/artifacts/stage3-high-effects-gate.json
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const ARTIFACT = '/opt/cursor/artifacts/stage3-high-effects-gate.json';
const PROFILE = `/tmp/sypher-chrome-gate-${process.pid}`;
const DEBUG_PORT = 9222 + (process.pid % 100);

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }
  async connect() {
    const WS = globalThis.WebSocket;
    if (!WS) throw new Error('No WebSocket client available');
    this.ws = new WS(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'evaluate failed');
    }
    return result.result?.value;
  }
  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

async function waitForChrome(port, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await getJson(`http://127.0.0.1:${port}/json/version`);
    } catch {
      await sleep(250);
    }
  }
  throw new Error('Chrome DevTools not ready');
}

async function main() {
  await mkdir('/opt/cursor/artifacts', { recursive: true });
  await mkdir(PROFILE, { recursive: true });

  const chromeBin = process.env.CHROME_BIN || 'google-chrome';
  const chrome = spawn(chromeBin, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--window-size=1400,900',
    // Emulate no reduced motion via command-line preference where supported.
    '--enable-features=ForcedColors:0',
    `${BASE}/?debug=1`
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const logPath = '/opt/cursor/artifacts/stage3-chrome-gate.log';
  const log = createWriteStream(logPath);
  chrome.stdout.pipe(log);
  chrome.stderr.pipe(log);

  const report = {
    base: BASE,
    startedAt: new Date().toISOString(),
    motionEmulation: 'prefers-reduced-motion: no-preference (Emulation.setEmulatedMedia)',
    transitions: [],
    exceptions: [],
    summary: {}
  };

  let cdp;
  try {
    await waitForChrome(DEBUG_PORT);
    const pages = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) || pages[0];
    if (!page?.webSocketDebuggerUrl) throw new Error('No page target');

    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
    });

    // Hard reload so matchMedia picks up emulation before boot.
    await cdp.send('Page.reload', { ignoreCache: true });
    await sleep(2500);

    // Wait until Sypher is ready.
    for (let i = 0; i < 40; i++) {
      const ready = await cdp.evaluate(`!!(window.Sypher && window.Sypher.state && window.Sypher.state.ready)`);
      if (ready) break;
      await sleep(250);
    }

    const motion = await cdp.evaluate(`({
      match: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      dataMotion: document.documentElement.getAttribute('data-motion'),
      mode: document.documentElement.getAttribute('data-mode'),
      sypherMotion: window.Sypher && window.Sypher.state && window.Sypher.state.motion
    })`);
    report.motionCheck = motion;
    if (motion.match || motion.dataMotion === 'reduced' || motion.sypherMotion === 'reduced') {
      report.summary.motionGate = 'FAIL: reduced motion still active';
    } else {
      report.summary.motionGate = 'PASS: no-preference / full motion';
    }

    async function snap(label) {
      const value = await cdp.evaluate(`(function () {
        var S = window.Sypher || {};
        var err = null;
        var inspect = null;
        try {
          if (S.highEffects && S.highEffects.inspect) inspect = S.highEffects.inspect();
          else if (S.highEffects) inspect = { moduleLoaded: true, active: !!(S.highEffects.isActive && S.highEffects.isActive()), note: 'inspect unavailable' };
          else inspect = { moduleLoaded: false, active: false };
        } catch (e) { err = String(e && e.message || e); }
        return {
          label: ${JSON.stringify(label)},
          mode: document.documentElement.getAttribute('data-mode'),
          source: document.documentElement.getAttribute('data-source'),
          motion: document.documentElement.getAttribute('data-motion'),
          stateMode: S.state && S.state.mode,
          highEffectsLoaded: !!S.highEffects,
          gsapLoaded: typeof window.gsap !== 'undefined',
          scrollTriggerLoaded: typeof window.ScrollTrigger !== 'undefined',
          inspect: inspect,
          error: err,
          uncaught: window.__sypherUncaught || []
        };
      })()`);
      report.transitions.push(value);
      return value;
    }

    await cdp.evaluate(`window.__sypherUncaught = [];
      window.addEventListener('error', function (e) {
        window.__sypherUncaught.push(String(e.message || e.error || 'error'));
      });
      window.addEventListener('unhandledrejection', function (e) {
        window.__sypherUncaught.push('rejection:' + String(e.reason && e.reason.message || e.reason));
      });`);

    // Ensure Auto analysis settled, then run transitions.
    await sleep(1500);
    await snap('boot');

    async function setMode(choice) {
      await cdp.evaluate(`window.Sypher.controller.setOverride(${JSON.stringify(choice)}, { confirmed: true, silent: true })`);
      await sleep(1200);
    }

    const sequence = [
      ['basic', '1 Basic'],
      ['high', '2 Basic→High (expect active effects)'],
      ['basic', '3 High→Basic (expect cleanup)'],
      ['high', '4 High again'],
      ['medium', '5 High→Medium'],
      ['basic', '6 Medium→Basic via High path prep'],
      ['high', '7 High'],
      ['basic', '8 High→Basic'],
      ['high', '9 High→Basic→High restart'],
      ['medium', '10 High→Medium'],
      ['basic', '11 High→Medium→Basic'],
      ['high', '12 High'],
      ['auto', '13 High→Auto'],
    ];

    for (const [choice, label] of sequence) {
      await setMode(choice);
      await snap(label);
    }

    // Rapid switching
    for (let i = 0; i < 6; i++) {
      await cdp.evaluate(`window.Sypher.controller.setOverride(${JSON.stringify(i % 2 ? 'basic' : 'high')}, { confirmed: true, silent: true })`);
      await sleep(120);
    }
    await sleep(1500);
    await snap('14 rapid switching settled on last');

    // Cancel while loading: go basic immediately after requesting high from cold stop.
    await setMode('basic');
    await cdp.evaluate(`(function () {
      // Bust in-flight epoch by flipping high then basic in same turn.
      window.Sypher.controller.setOverride('high', { confirmed: true, silent: true });
      window.Sypher.controller.setOverride('basic', { confirmed: true, silent: true });
    })()`);
    await sleep(1500);
    await snap('15 High→Basic during/after race');

    // Restart after canceled init
    await setMode('high');
    await snap('16 High after canceled init');

    // Reduced motion while High
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });
    await sleep(800);
    // Trigger matchMedia listeners by re-checking — Emulation should fire change in Chromium.
    await cdp.evaluate(`window.dispatchEvent(new Event('resize'))`);
    await sleep(1000);
    const afterRm = await snap('17 High→reduced-motion');

    // Restore full motion and confirm High can restart
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
    });
    await sleep(500);
    await setMode('high');
    await snap('18 High after reduced-motion cleared');

    // Sparse evidence sim page (clear manual override so Auto/fallback is observed)
    await cdp.evaluate(`(function () {
      try {
        localStorage.removeItem('sypher.override');
        sessionStorage.clear();
      } catch (e) {}
      if (window.Sypher && window.Sypher.controller) {
        window.Sypher.controller.setOverride('auto', { silent: true });
      }
    })()`);
    await cdp.send('Page.navigate', { url: `${BASE}/?debug=1&sim=noCpu,noMemory,noBenchmark` });
    await sleep(1500);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
    });
    await cdp.send('Page.reload', { ignoreCache: true });
    await sleep(3000);
    const sparse = await cdp.evaluate(`(function () {
      var p = window.Sypher && window.Sypher.state && window.Sypher.state.profile;
      return {
        mode: document.documentElement.getAttribute('data-mode'),
        score: p && p.score,
        coverage: p && p.coverage,
        confidence: p && p.confidence,
        class: p && p.class,
        source: p && p.source
      };
    })()`);
    report.sparseSim = sparse;

    // Scoring integrity via shared modules in page
    const scoring = await cdp.evaluate(`(function () {
      var S = window.Sypher;
      var w = S.config.scoring.weights;
      var cases = [];
      function row(name, signals, completed) {
        var scored = S.score.compute(signals, w, !!completed);
        var result = S.classify.classify(scored, signals, S.config.scoring);
        cases.push({ name: name, score: scored.score, coverage: scored.coverage, cls: result.cls, confidence: result.confidence });
      }
      row('strong', { cpuThreads: 12, deviceMemoryGB: 8, webgl: 'webgl2', fps: 60 }, true);
      row('noMem', { cpuThreads: 12, deviceMemoryGB: null, webgl: 'webgl2', fps: 60 }, true);
      row('fpsOnly', { fps: 60, cpuThreads: null, deviceMemoryGB: null }, true);
      row('empty', {}, false);
      row('noFps', { cpuThreads: 12, deviceMemoryGB: 8, webgl: 'webgl2', fps: null }, false);
      return { configVersion: S.config.configVersion, weights: w, cases: cases };
    })()`);
    report.clientScoring = scoring;

    // Analyze transitions for active→clean patterns
    const highActive = report.transitions.filter((t) => /High/.test(t.label) && t.mode === 'high' && t.motion === 'full');
    const basicClean = report.transitions.filter((t) => t.mode === 'basic');
    report.summary.highEffectsObserved = highActive.some((t) => t.inspect && t.inspect.active && (t.inspect.scrollTriggers > 0 || t.inspect.webglContext || t.inspect.gsapTweens > 0));
    report.summary.basicHadNoActiveEffects = basicClean.every((t) => !t.inspect || t.inspect.active === false);
    // Treat missing inspect fields (module not yet loaded) as clean — only fail on positive leftovers.
    report.summary.basicHadNoScrollTriggers = basicClean.every((t) => !t.inspect || !t.inspect.scrollTriggers);
    report.summary.basicHadNoWebgl = basicClean.every((t) => !t.inspect || !t.inspect.webglContext);
    report.summary.basicHadNoHeroRaf = basicClean.every((t) => !t.inspect || !t.inspect.heroRaf);
    report.summary.basicHadNoLiveHero = basicClean.every((t) => !t.inspect || !t.inspect.heroLiveClass);
    report.summary.maxBasicTweens = Math.max(0, ...basicClean.map((t) => (t.inspect && t.inspect.gsapTweens) || 0));
    report.summary.highProof = highActive.map((t) => ({
      label: t.label,
      scrollTriggers: t.inspect && t.inspect.scrollTriggers,
      gsapTweens: t.inspect && t.inspect.gsapTweens,
      webgl: t.inspect && t.inspect.webglContext,
      raf: t.inspect && t.inspect.heroRaf
    }));
    report.summary.uncaughtExceptions = report.transitions.flatMap((t) => t.uncaught || []);
    report.summary.reducedMotionStoppedHigh = afterRm.inspect && afterRm.inspect.active === false;
    report.summary.sparseNotPerfect = !!(sparse && sparse.score !== 100 && (sparse.score == null || sparse.score < 100));

    const failures = [];
    if (!String(report.summary.motionGate).startsWith('PASS')) failures.push('motion');
    if (!report.summary.highEffectsObserved) failures.push('high-not-active');
    if (!report.summary.basicHadNoActiveEffects) failures.push('basic-still-active');
    if (!report.summary.basicHadNoScrollTriggers) failures.push('basic-scrolltriggers');
    if (!report.summary.basicHadNoWebgl) failures.push('basic-webgl');
    if (!report.summary.basicHadNoHeroRaf) failures.push('basic-raf');
    if (report.summary.uncaughtExceptions.length) failures.push('uncaught');
    report.summary.failures = failures;
    report.summary.verdict = failures.length ? 'CHANGES REQUIRED' : 'READY TO MERGE (browser gate)';
    report.finishedAt = new Date().toISOString();

    await writeFile(ARTIFACT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.summary, null, 2));
    console.log('Wrote', ARTIFACT);
    if (failures.length) process.exitCode = 2;
  } catch (err) {
    report.error = String(err && err.stack || err);
    await writeFile(ARTIFACT, JSON.stringify(report, null, 2));
    console.error(report.error);
    process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGKILL');
  }
}

main();
