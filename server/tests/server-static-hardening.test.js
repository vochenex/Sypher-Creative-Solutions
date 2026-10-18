'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const { createServer } = require('../server');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
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

function request(port, { method = 'GET', path: reqPath = '/', timeoutMs = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, method, path: reqPath },
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
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('request timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('static symlink containment', () => {
  let publicDir;
  let outsideDir;
  let server;
  let port;
  let canSymlink = true;

  before(async () => {
    publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sypher-pub-'));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sypher-out-'));
    fs.writeFileSync(path.join(publicDir, 'index.html'), '<html>ok</html>');
    fs.writeFileSync(path.join(publicDir, 'safe.txt'), 'inside-public');
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'TOP-SECRET-OUTSIDE');

    try {
      fs.symlinkSync(path.join(outsideDir, 'secret.txt'), path.join(publicDir, 'escape.txt'));
      fs.symlinkSync(outsideDir, path.join(publicDir, 'escape-dir'));
    } catch (err) {
      // Some CI images disallow symlinks without elevation (notably Windows).
      canSymlink = false;
      console.log('[skip-note] symlink creation unavailable:', err.message);
    }

    server = createServer({ publicDir });
    port = await listen(server);
  });

  after(async () => {
    await close(server);
    fs.rmSync(publicDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it('serves regular files from the injected public directory', async () => {
    const res = await request(port, { path: '/safe.txt' });
    assert.equal(res.status, 200);
    assert.equal(res.body.toString('utf8'), 'inside-public');
  });

  it('refuses a file symlink that points outside public', async () => {
    if (!canSymlink) return;
    const res = await request(port, { path: '/escape.txt' });
    assert.equal(res.status, 403);
    assert.doesNotMatch(res.body.toString('utf8'), /TOP-SECRET-OUTSIDE/);
  });

  it('refuses paths through a directory symlink that escapes public', async () => {
    if (!canSymlink) return;
    const res = await request(port, { path: '/escape-dir/secret.txt' });
    assert.equal(res.status, 403);
    assert.doesNotMatch(res.body.toString('utf8'), /TOP-SECRET-OUTSIDE/);
  });

  it('remains available after symlink denial', async () => {
    if (canSymlink) {
      await request(port, { path: '/escape.txt' });
    }
    const res = await request(port, { path: '/' });
    assert.equal(res.status, 200);
    assert.match(res.body.toString('utf8'), /ok/);
  });
});

describe('static stream error handling', () => {
  let publicDir;

  before(() => {
    publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sypher-stream-'));
    fs.writeFileSync(path.join(publicDir, 'index.html'), '<html>stream</html>');
    fs.writeFileSync(path.join(publicDir, 'piece.txt'), 'payload');
  });

  after(() => {
    fs.rmSync(publicDir, { recursive: true, force: true });
  });

  it('returns 500 when the stream errors before open and stays up', async () => {
    const server = createServer({
      publicDir,
      createReadStream() {
        const stream = new Readable({ read() {} });
        process.nextTick(() => {
          stream.destroy(Object.assign(new Error('simulated pre-open failure'), { code: 'EIO' }));
        });
        return stream;
      }
    });
    const port = await listen(server);
    try {
      const failed = await request(port, { path: '/piece.txt' });
      assert.equal(failed.status, 500);
      assert.match(failed.body.toString('utf8'), /Error reading file/);

      const ok = await request(port, { method: 'HEAD', path: '/piece.txt' });
      assert.equal(ok.status, 200);
    } finally {
      await close(server);
    }
  });

  it('keeps serving after a mid-stream read failure', async () => {
    const server = createServer({
      publicDir,
      createReadStream(file) {
        if (!file.endsWith('piece.txt')) {
          return fs.createReadStream(file);
        }
        const stream = new Readable({
          read() {
            // no-op; we push after open
          }
        });
        process.nextTick(() => {
          stream.emit('open');
          process.nextTick(() => {
            // Fewer bytes than Content-Length, then fail — exercises post-header teardown.
            stream.push('x');
            stream.destroy(Object.assign(new Error('simulated mid-stream failure'), { code: 'EIO' }));
          });
        });
        return stream;
      }
    });
    const port = await listen(server);
    try {
      // Do not await a full body: incomplete Content-Length responses can leave
      // clients blocked. Fire the request, give the server time to hit pipeline
      // error handling, then verify the process still serves other files.
      const pending = request(port, { path: '/piece.txt', timeoutMs: 250 });
      pending.catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      const ok = await request(port, { path: '/index.html' });
      assert.equal(ok.status, 200);
      assert.match(ok.body.toString('utf8'), /stream/);
    } finally {
      await close(server);
    }
  });

  it('handles synchronous createReadStream failures', async () => {
    const server = createServer({
      publicDir,
      createReadStream(file) {
        if (file.endsWith('piece.txt')) {
          throw Object.assign(new Error('open denied'), { code: 'EACCES' });
        }
        return fs.createReadStream(file);
      }
    });
    const port = await listen(server);
    try {
      const failed = await request(port, { path: '/piece.txt' });
      assert.equal(failed.status, 500);
      const ok = await request(port, { path: '/' });
      assert.equal(ok.status, 200);
    } finally {
      await close(server);
    }
  });
});
