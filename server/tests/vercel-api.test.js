'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const profile = require('../../api/device-profile');
const modeConfig = require('../../api/mode-config');

async function request(handler, pathname, options = {}, parsedBody) {
  const server = http.createServer((req, res) => {
    if (parsedBody !== undefined) req.body = parsedBody;
    handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${pathname}`, options);
    return { status: res.status, headers: res.headers, text: await res.text() };
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('Vercel production API', () => {
  const payload = { signals: { cpuThreads: 8, deviceMemoryGB: 8, webgl: 'webgl2', fps: 60 }, benchmark: { completed: true } };
  const post = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };

  it('classifies raw and Vercel-parsed request bodies identically', async () => {
    const raw = await request(profile, '/api/device-profile', post);
    const parsed = await request(profile, '/api/device-profile', post, payload);
    assert.equal(raw.status, 200);
    assert.equal(parsed.status, 200);
    assert.deepEqual(JSON.parse(raw.text), JSON.parse(parsed.text));
    assert.equal(JSON.parse(raw.text).confirmed, true);
  });

  it('rejects malformed, oversized, wrong-type, and invalid parsed payloads', async () => {
    const invalidJson = await request(profile, '/api/device-profile', post, '{');
    assert.equal(invalidJson.status, 400);
    const tooLarge = await request(profile, '/api/device-profile', post, { text: 'x'.repeat(5000) });
    assert.equal(tooLarge.status, 413);
    const wrongType = await request(profile, '/api/device-profile', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }, {});
    assert.equal(wrongType.status, 415);
    const invalid = await request(profile, '/api/device-profile', post, {});
    assert.equal(invalid.status, 400);
  });

  it('rejects cross-origin calls and unsupported methods', async () => {
    const crossOrigin = await request(profile, '/api/device-profile', { ...post, headers: { ...post.headers, Origin: 'https://example.org' } });
    assert.equal(crossOrigin.status, 403);
    const wrongMethod = await request(profile, '/api/device-profile');
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'POST');
  });

  it('serves every mode, validates the mode, and supports conditional caching', async () => {
    for (const mode of ['high', 'medium', 'basic']) {
      const result = await request(modeConfig, `/api/mode-config?mode=${mode}`);
      assert.equal(result.status, 200);
      assert.equal(JSON.parse(result.text).mode, mode);
      const cached = await request(modeConfig, `/api/mode-config?mode=${mode}`, { headers: { 'If-None-Match': result.headers.get('etag') } });
      assert.equal(cached.status, 304);
      assert.equal(cached.text, '');
    }
    assert.equal((await request(modeConfig, '/api/mode-config?mode=unknown')).status, 400);
  });
});
