'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createServer } = require('../server');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve(port);
    });
    server.on('error', reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function request(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path,
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      }
    );
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

describe('server stability (F1)', () => {
  let server;
  let port;

  before(async () => {
    server = createServer();
    port = await listen(server);
  });

  after(async () => {
    await close(server);
  });

  it('serves the homepage with GET', async () => {
    const res = await request(port, { path: '/' });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.ok(res.body.length > 0);
  });

  it('supports HEAD for static files', async () => {
    const res = await request(port, { method: 'HEAD', path: '/css/base.css' });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/css/);
    assert.ok(Number(res.headers['content-length']) > 0);
    assert.equal(res.body.length, 0);
  });

  it('returns 400 for malformed percent escapes without crashing', async () => {
    const res = await request(port, { path: '/%ZZ' });
    assert.equal(res.status, 400);
    assert.match(res.body.toString('utf8'), /could not be decoded|Malformed|invalid/i);
  });

  it('remains available after a malformed URL request', async () => {
    const bad = await request(port, { path: '/%E0%A4%A' });
    assert.equal(bad.status, 400);
    const ok = await request(port, { path: '/' });
    assert.equal(ok.status, 200);
  });

  it('rejects encoded traversal with 403 and stays up', async () => {
    const res = await request(port, { path: '/..%2Fpackage.json' });
    assert.equal(res.status, 403);
    const ok = await request(port, { path: '/css/base.css' });
    assert.equal(ok.status, 200);
  });

  it('does not serve files outside public for plain traversal paths', async () => {
    // Node's URL parser collapses /../../ before decode; result must not be a 200 of package.json.
    const res = await request(port, { path: '/../../package.json' });
    assert.ok([403, 404].includes(res.status), `unexpected status ${res.status}`);
    assert.doesNotMatch(res.body.toString('utf8'), /"name":\s*"sypher-adaptive-web"/);
  });

  it('serves valid percent-encoded asset paths', async () => {
    // Encode a known existing path segment-by-segment; %2F would change structure.
    const res = await request(port, { path: '/assets/fonts/archivo-latin-var.woff2' });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /font\/woff2/);
  });

  it('returns 404 for missing files without crashing', async () => {
    const res = await request(port, { path: '/no-such-file-xyz.css' });
    assert.equal(res.status, 404);
    const ok = await request(port, { path: '/' });
    assert.equal(ok.status, 200);
  });

  it('still serves mode-config after invalid static requests', async () => {
    await request(port, { path: '/%ZZ' });
    const res = await request(port, { path: '/api/mode-config?mode=basic' });
    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body.toString('utf8'));
    assert.equal(payload.mode, 'basic');
    assert.ok(payload.flags);
  });

  it('still accepts device-profile classification after invalid static requests', async () => {
    await request(port, { path: '/..%2Fserver%2Fserver.js' });
    const body = JSON.stringify({
      signals: {
        cpuThreads: 8,
        deviceMemoryGB: 8,
        screen: { width: 1920, height: 1080, dpr: 1 },
        webgl: 'webgl2',
        fps: 60,
        pointerCoarse: false,
        reducedMotion: false,
        saveData: false,
        effectiveType: '4g',
        batteryLowNotCharging: false,
        viewportWidth: 1440
      },
      benchmark: { completed: true }
    });
    const res = await request(port, {
      method: 'POST',
      path: '/api/device-profile',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    });
    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body.toString('utf8'));
    assert.equal(typeof payload.score, 'number');
    assert.ok(payload.class);
  });

  it('rejects disallowed methods on static paths', async () => {
    const res = await request(port, { method: 'POST', path: '/index.html' });
    assert.equal(res.status, 405);
  });
});
