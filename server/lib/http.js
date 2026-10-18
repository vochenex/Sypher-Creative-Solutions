'use strict';

/** Small HTTP helpers: JSON responses, body parsing with size limits, rate limiting. */

function sendJson(res, status, body, headers) {
  const data = JSON.stringify(body);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store'
  }, headers || {}));
  res.end(data);
}

function sendError(res, status, code, message, field, headers) {
  const error = { code, message };
  if (field) error.field = field;
  sendJson(res, status, { error }, headers);
}

class HttpError extends Error {
  constructor(status, code, message, field) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

function readRawBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', `Body exceeds ${limitBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function contentType(req) {
  return (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
}

function readJson(req, limitBytes) {
  if (contentType(req) !== 'application/json') {
    req.resume();
    return Promise.reject(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
  }
  return readRawBody(req, limitBytes).then((buf) => {
    try {
      return JSON.parse(buf.toString('utf8') || 'null');
    } catch {
      throw new HttpError(400, 'INVALID_PAYLOAD', 'Body is not valid JSON');
    }
  });
}

/** JSON or URL-encoded form bodies for progressive-enhancement endpoints. */
function readJsonOrForm(req, limitBytes) {
  const type = contentType(req);
  return readRawBody(req, limitBytes).then((buf) => {
    const text = buf.toString('utf8');
    if (type === 'application/json') {
      try {
        return { kind: 'json', body: JSON.parse(text || 'null') };
      } catch {
        throw new HttpError(400, 'INVALID_PAYLOAD', 'Body is not valid JSON');
      }
    }
    if (type === 'application/x-www-form-urlencoded') {
      const params = new URLSearchParams(text);
      const body = {};
      for (const [key, value] of params.entries()) body[key] = value;
      return { kind: 'form', body };
    }
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json or application/x-www-form-urlencoded');
  });
}

/** Fixed-window rate limiter keyed by client IP. */
function createRateLimiter(limitPerMinute) {
  const hits = new Map();
  return function check(req) {
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || now - entry.start >= 60000) {
      hits.set(ip, { start: now, count: 1 });
      return { ok: true };
    }
    entry.count++;
    if (entry.count > limitPerMinute) {
      return { ok: false, retryAfter: Math.ceil((entry.start + 60000 - now) / 1000) };
    }
    return { ok: true };
  };
}

module.exports = {
  sendJson,
  sendError,
  HttpError,
  readJson,
  readJsonOrForm,
  createRateLimiter
};
