'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
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

function resetStore() {
  fs.mkdirSync(path.dirname(inquiries.DATA_FILE), { recursive: true });
  if (fs.existsSync(inquiries.DATA_FILE)) fs.unlinkSync(inquiries.DATA_FILE);
}

describe('inquiry route validation', () => {
  beforeEach(() => {
    resetStore();
  });

  after(() => {
    resetStore();
  });

  it('accepts a valid inquiry and reports saved (not emailed)', async () => {
    const result = await inquiries.create({
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

  it('rejects missing required fields', async () => {
    await assert.rejects(
      () => inquiries.create({ name: 'A', email: 'bad', message: '' }),
      (err) => err instanceof HttpError && err.status === 400
    );
  });

  it('rejects honeypot submissions without writing the store', async () => {
    await assert.rejects(
      () => inquiries.create({
        name: 'Bot',
        email: 'bot@example.com',
        message: 'spam',
        company_website: 'http://spam.test'
      }),
      (err) => err instanceof HttpError && err.status === 400
    );
    assert.equal(fs.existsSync(inquiries.DATA_FILE), false);
  });

  it('rejects duplicate clientRequestId', async () => {
    const payload = {
      name: 'Ada',
      email: 'ada@example.com',
      message: 'Hello again',
      clientRequestId: 'req_dup_same'
    };
    await inquiries.create(payload);
    await assert.rejects(
      () => inquiries.create(payload),
      (err) => err instanceof HttpError && err.status === 409
    );
  });

  it('serializes concurrent writes without losing records', async () => {
    const jobs = [];
    for (let i = 0; i < 12; i++) {
      jobs.push(inquiries.create({
        name: 'User ' + i,
        email: 'user' + i + '@example.com',
        message: 'Concurrent message ' + i,
        clientRequestId: 'req_concurrent_' + i
      }));
    }
    const results = await Promise.all(jobs);
    assert.equal(results.length, 12);
    const stored = JSON.parse(fs.readFileSync(inquiries.DATA_FILE, 'utf8'));
    assert.equal(stored.length, 12);
    const emails = new Set(stored.map((r) => r.email));
    assert.equal(emails.size, 12);
  });
});

describe('inquiry HTTP API', () => {
  let server;
  let port;

  before(async () => {
    resetStore();
    server = createServer();
    port = await listen(server);
  });

  after(async () => {
    await close(server);
    resetStore();
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

  it('does not expose inquiry records over HTTP', async () => {
    const blocked = [
      '/api/inquiries',
      '/api/inquiries/',
      '/data/inquiries.json',
      '/server/data/inquiries.json',
      '/..%2Fserver%2Fdata%2Finquiries.json'
    ];
    for (const p of blocked) {
      const res = await request(port, { path: p });
      assert.ok([403, 404].includes(res.status), p + ' => ' + res.status);
      assert.doesNotMatch(res.body.toString('utf8'), /@example\.com|Grace Hopper|Ada Lovelace/i);
    }
  });

  it('still serves the homepage after inquiry traffic', async () => {
    const res = await request(port, { path: '/' });
    assert.equal(res.status, 200);
    assert.match(res.body.toString('utf8'), /contact-form/);
    assert.match(res.body.toString('utf8'), /Privacy \/ demo note/);
    assert.doesNotMatch(res.body.toString('utf8'), /Your message is on its way/);
  });
});

describe('inquiry privacy packaging', () => {
  it('ignores the runtime inquiries file in git', () => {
    const ignore = fs.readFileSync(path.join(__dirname, '../../.gitignore'), 'utf8');
    assert.match(ignore, /server\/data\/inquiries\.json/);
    assert.equal(fs.existsSync(path.join(__dirname, '../data/README.md')), true);
  });
});
