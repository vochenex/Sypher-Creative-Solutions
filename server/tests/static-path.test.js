'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolvePublicPath } = require('../lib/static-path');
const { HttpError } = require('../lib/http');

describe('resolvePublicPath', () => {
  let root;
  let nestedFile;
  let spacedFile;

  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sypher-public-'));
    fs.mkdirSync(path.join(root, 'css'));
    fs.mkdirSync(path.join(root, 'assets', 'images'), { recursive: true });
    nestedFile = path.join(root, 'css', 'base.css');
    fs.writeFileSync(nestedFile, 'body{}');
    spacedFile = path.join(root, 'assets', 'images', 'hero portrait.jpg');
    fs.writeFileSync(spacedFile, 'fake-jpeg');
    fs.writeFileSync(path.join(root, 'index.html'), '<html></html>');
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves a normal static path', () => {
    assert.equal(resolvePublicPath(root, '/css/base.css'), nestedFile);
  });

  it('maps directory requests to index.html', () => {
    assert.equal(resolvePublicPath(root, '/'), path.join(root, 'index.html'));
  });

  it('accepts valid percent-encoded filenames', () => {
    assert.equal(
      resolvePublicPath(root, '/assets/images/hero%20portrait.jpg'),
      spacedFile
    );
  });

  it('rejects malformed percent escapes', () => {
    assert.throws(
      () => resolvePublicPath(root, '/%ZZ'),
      (err) => err instanceof HttpError && err.status === 400 && err.code === 'MALFORMED_URL'
    );
  });

  it('rejects incomplete percent escapes', () => {
    assert.throws(
      () => resolvePublicPath(root, '/css/%E0%A4%A'),
      (err) => err instanceof HttpError && err.status === 400
    );
  });

  it('rejects null bytes', () => {
    assert.throws(
      () => resolvePublicPath(root, '/css/%00base.css'),
      (err) => err instanceof HttpError && err.status === 400
    );
  });

  it('rejects plain traversal', () => {
    assert.throws(
      () => resolvePublicPath(root, '/../../etc/passwd'),
      (err) => err instanceof HttpError && err.status === 403
    );
  });

  it('rejects encoded traversal', () => {
    assert.throws(
      () => resolvePublicPath(root, '/..%2F..%2Fetc%2Fpasswd'),
      (err) => err instanceof HttpError && err.status === 403
    );
  });

  it('rejects nested encoded traversal under a real directory', () => {
    assert.throws(
      () => resolvePublicPath(root, '/css/..%2F..%2Fetc%2Fpasswd'),
      (err) => err instanceof HttpError && err.status === 403
    );
  });

  it('does not treat a similarly prefixed sibling directory as public', () => {
    const sibling = root + '-evil';
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, 'secret.txt'), 'nope');
    try {
      assert.throws(
        () => resolvePublicPath(root, '/../' + path.basename(sibling) + '/secret.txt'),
        (err) => err instanceof HttpError && err.status === 403
      );
    } finally {
      fs.rmSync(sibling, { recursive: true, force: true });
    }
  });
});
