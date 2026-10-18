'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { createServer } = require('../server');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    server.on('error', reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function get(port, reqPath) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: reqPath }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

describe('startup and packaging resilience', () => {
  let server;
  let port;

  before(async () => {
    server = createServer();
    port = await listen(server);
  });

  after(async () => {
    await close(server);
  });

  it('documents Node >=18.18.0 for node:test describe/it', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    assert.match(pkg.engines.node, /18\.18/);
  });

  it('keeps bootstrap from selecting undefined modes on corrupt cache text', async () => {
    const html = (await get(port, '/')).body;
    // Inline bootstrap includes an allow-list before writing data-mode.
    assert.match(html, /mode === 'high' \|\| mode === 'medium' \|\| mode === 'basic'/);
    assert.match(html, /setAttribute\('data-mode', 'basic'\)/);
  });

  it('ships analysis status with fail-safe max lifetime', async () => {
    const js = (await get(port, '/js/ui-analysis.js')).body;
    assert.match(js, /maxLifeTimer/);
    assert.match(js, /Continuing with a safe baseline/);
    assert.doesNotMatch(js, /setInert/);
  });

  it('api client degrades without fetch', () => {
    const code = fs.readFileSync(path.join(__dirname, '../../public/js/api-client.js'), 'utf8');
    const sandbox = {
      window: {},
      location: { protocol: 'http:' },
      fetch: undefined,
      setTimeout,
      clearTimeout,
      console
    };
    sandbox.window.Sypher = {
      config: { timing: { apiTimeoutMs: 50 } },
      debug: { has() { return false; } }
    };
    sandbox.Sypher = sandbox.window.Sypher;
    vm.runInNewContext(code, sandbox, { filename: 'api-client.js' });
    return sandbox.window.Sypher.api.postInquiry({}).then(
      () => assert.fail('expected rejection'),
      (err) => assert.equal(err.message, 'NO_FETCH')
    );
  });
});
