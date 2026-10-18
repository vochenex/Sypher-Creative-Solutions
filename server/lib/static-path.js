'use strict';

const path = require('path');
const { HttpError } = require('./http');

/**
 * True when candidate resolves to a path strictly inside root (not root itself).
 * Uses path.relative so a sibling prefix like "public-evil" cannot pass.
 */
function isPathInside(root, candidate) {
  const rootResolved = path.resolve(root);
  const candidateResolved = path.resolve(candidate);
  const relative = path.relative(rootResolved, candidateResolved);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
}

/**
 * Resolve a request pathname to a logical file path under publicDir.
 * Rejects malformed percent-encoding, null bytes, and path traversal
 * (including encoded ../ segments) using a directory-boundary check.
 *
 * Does not follow symlinks; callers must realpath and re-check with
 * isPathInside before serving content.
 *
 * @param {string} publicDir absolute path to the static root
 * @param {string} pathname URL pathname (may be percent-encoded)
 * @returns {string} absolute logical path to the candidate file
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

  if (!isPathInside(root, file)) {
    throw new HttpError(403, 'FORBIDDEN_PATH', 'Path is outside the public directory');
  }

  return file;
}

module.exports = { resolvePublicPath, isPathInside };
