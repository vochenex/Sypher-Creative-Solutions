'use strict';

const path = require('path');
const { HttpError } = require('./http');

/**
 * Resolve a request pathname to a file under publicDir.
 * Rejects malformed percent-encoding, null bytes, and path traversal
 * (including encoded ../ segments) using a directory-boundary check.
 *
 * @param {string} publicDir absolute path to the static root
 * @param {string} pathname URL pathname (may be percent-encoded)
 * @returns {string} absolute path to the candidate file
 */
function resolvePublicPath(publicDir, pathname) {
  if (typeof pathname !== 'string' || pathname.length === 0) {
    throw new HttpError(400, 'MALFORMED_URL', 'URL path is missing');
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'MALFORMED_URL', 'URL path could not be decoded');
  }

  if (decoded.includes('\0')) {
    throw new HttpError(400, 'MALFORMED_URL', 'URL path contains invalid characters');
  }

  // URL paths use POSIX separators; strip leading slashes so join cannot reset to root.
  let relativeUrlPath = decoded.replace(/^\/+/, '');
  if (!relativeUrlPath || relativeUrlPath.endsWith('/')) {
    relativeUrlPath = path.posix.join(relativeUrlPath, 'index.html');
  }

  const normalizedRel = path.posix.normalize(relativeUrlPath);
  if (
    normalizedRel === '..' ||
    normalizedRel.startsWith('../') ||
    path.posix.isAbsolute(normalizedRel)
  ) {
    throw new HttpError(403, 'FORBIDDEN_PATH', 'Path is outside the public directory');
  }

  const root = path.resolve(publicDir);
  const file = path.resolve(root, normalizedRel.split('/').join(path.sep));
  const relativeToRoot = path.relative(root, file);

  if (
    relativeToRoot === '' ||
    relativeToRoot.startsWith('..' + path.sep) ||
    relativeToRoot === '..' ||
    path.isAbsolute(relativeToRoot)
  ) {
    throw new HttpError(403, 'FORBIDDEN_PATH', 'Path is outside the public directory');
  }

  return file;
}

module.exports = { resolvePublicPath };
