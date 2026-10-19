'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
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
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    }).on('error', reject);
  });
}

describe('Stage 2 frontend contracts', () => {
  let server;
  let port;

  before(async () => {
    server = createServer();
    port = await listen(server);
  });

  after(async () => {
    await close(server);
  });

  it('ships a centered analysis status with a loading indicator', async () => {
    const res = await get(port, '/');
    assert.equal(res.status, 200);
    assert.match(res.body, /id="analysis"/);
    assert.match(res.body, /role="status"/);
    assert.match(res.body, /Finding your best experience/);
    assert.match(res.body, /analysis__loader/);
    assert.doesNotMatch(res.body, /analysis-skip|analysis-bar|progressbar/);
    assert.match(res.body, /data-adaptive-state', 'ready'/);
  });

  it('keeps main landmarks available in markup without inert defaults', async () => {
    const res = await get(port, '/');
    assert.match(res.body, /id="main"/);
    assert.match(res.body, /id="primary-nav"/);
    assert.doesNotMatch(res.body, /<main[^>]*\sinert/);
    assert.doesNotMatch(res.body, /<header[^>]*\sinert/);
  });

  it('wires the contact form to the studio email with honest draft copy', async () => {
    const res = await get(port, '/');
    assert.match(res.body, /action="mailto:syphersolutions@gmail\.com\?subject=/);
    assert.match(res.body, /Review the draft and press Send there/);
    assert.match(res.body, /js\/contact-email\.js/);
    assert.doesNotMatch(res.body, /action="\/api\/inquiries"/);
    assert.doesNotMatch(res.body, /Your message is on its way/);
  });

  it('includes noscript navigation fallback styles', async () => {
    const res = await get(port, '/');
    assert.match(res.body, /<noscript>/);
    assert.match(res.body, /\.nav\{position:static/);
  });

  it('serves updated resilience scripts', async () => {
    const api = await get(port, '/js/api-client.js');
    assert.equal(api.status, 200);
    assert.match(api.body, /NO_FETCH/);
    assert.match(api.body, /postInquiry/);
    assert.match(api.body, /raceTimeout/);

    const storage = await get(port, '/js/storage.js');
    assert.match(storage.body, /validateProfile/);
    assert.match(storage.body, /configVersion/);

    const analysis = await get(port, '/js/ui-analysis.js');
    assert.match(analysis.body, /never blocks the page/i);
    assert.doesNotMatch(analysis.body, /setInert/);
  });
});
