'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const inquiries = require('../routes/inquiries');
const { createServer } = require('../server');
const { HttpError } = require('../lib/http');

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

function request(port, { method = 'GET', path: reqPath = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path: reqPath, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

describe('inquiry route validation', () => {
  let original;
  let tempFile;

  before(() => {
    original = fs.readFileSync(inquiries.DATA_FILE, 'utf8');
  });

  beforeEach(() => {
    tempFile = path.join(os.tmpdir(), 'sypher-inq-' + Date.now() + '.json');
    fs.writeFileSync(inquiries.DATA_FILE, '[]');
  });

  after(() => {
    fs.writeFileSync(inquiries.DATA_FILE, original);
    if (tempFile && fs.existsSync(tempFile)) fs.rmSync(tempFile, { force: true });
  });

  it('accepts a valid inquiry and reports saved (not emailed)', () => {
    const result = inquiries.create({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      message: 'We need a new brand system.',
      service: 'Branding',
      budget: '$15k to $50k',
      clientRequestId: 'req_test_valid_1'
    });
    assert.equal(result.delivery, 'saved');
    assert.match(result.message, /not sent/i);
    assert.ok(result.id.startsWith('inq_'));
    const stored = JSON.parse(fs.readFileSync(inquiries.DATA_FILE, 'utf8'));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].email, 'ada@example.com');
  });

  it('rejects missing required fields', () => {
    assert.throws(
      () => inquiries.create({ name: 'A', email: 'bad', message: '' }),
      (err) => err instanceof HttpError && err.status === 400
    );
  });

  it('rejects honeypot submissions', () => {
    assert.throws(
      () => inquiries.create({
        name: 'Bot',
        email: 'bot@example.com',
        message: 'spam',
        company_website: 'http://spam.test'
      }),
      (err) => err instanceof HttpError && err.status === 400
    );
  });

  it('rejects duplicate clientRequestId', () => {
    const payload = {
      name: 'Ada',
      email: 'ada@example.com',
      message: 'Hello again',
      clientRequestId: 'req_dup_same'
    };
    inquiries.create(payload);
    assert.throws(
      () => inquiries.create(payload),
      (err) => err instanceof HttpError && err.status === 409
    );
  });
});

describe('inquiry HTTP API', () => {
  let server;
  let port;
  let original;

  before(async () => {
    original = fs.readFileSync(inquiries.DATA_FILE, 'utf8');
    fs.writeFileSync(inquiries.DATA_FILE, '[]');
    server = createServer();
    port = await listen(server);
  });

  after(async () => {
    await close(server);
    fs.writeFileSync(inquiries.DATA_FILE, original);
  });

  it('POST /api/inquiries JSON returns 201 with saved delivery', async () => {
    const body = JSON.stringify({
      name: 'Grace Hopper',
      email: 'grace@example.com',
      message: 'Compiler branding refresh',
      clientRequestId: 'req_http_json_1'
    });
    const res = await request(port, {
      method: 'POST',
      path: '/api/inquiries',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    });
    assert.equal(res.status, 201);
    const payload = JSON.parse(res.body.toString('utf8'));
    assert.equal(payload.delivery, 'saved');
    assert.doesNotMatch(payload.message, /on its way|delivered|email sent/i);
  });

  it('POST /api/inquiries form redirects with inquiry=saved', async () => {
    const body = 'name=Alan+Turing&email=alan%40example.com&message=Enigma+site&clientRequestId=req_http_form_1';
    const res = await request(port, {
      method: 'POST',
      path: '/api/inquiries',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    });
    assert.equal(res.status, 303);
    assert.match(res.headers.location || '', /inquiry=saved/);
  });

  it('rejects invalid JSON inquiries with 400', async () => {
    const body = JSON.stringify({ name: '', email: 'x', message: '' });
    const res = await request(port, {
      method: 'POST',
      path: '/api/inquiries',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    });
    assert.equal(res.status, 400);
  });

  it('does not expose a public inquiry listing route', async () => {
    const res = await request(port, { path: '/api/inquiries' });
    assert.equal(res.status, 404);
  });

  it('still serves the homepage after inquiry traffic', async () => {
    const res = await request(port, { path: '/' });
    assert.equal(res.status, 200);
    assert.match(res.body.toString('utf8'), /contact-form/);
    assert.match(res.body.toString('utf8'), /Demo note/);
    assert.doesNotMatch(res.body.toString('utf8'), /Your message is on its way/);
  });
});
