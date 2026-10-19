'use strict';

const { HttpError, readJson, sendError } = require('./http');

// Vercel may supply a parsed body; local HTTP requests still use the raw stream.
async function readBody(req, maxBytes) {
  if (req.body === undefined) return readJson(req, maxBytes);
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
  }
  const raw = typeof req.body === 'string' || Buffer.isBuffer(req.body)
    ? req.body.toString() : JSON.stringify(req.body);
  if (Buffer.byteLength(raw) > maxBytes) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `Body exceeds ${maxBytes} bytes`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'INVALID_PAYLOAD', 'Body is not valid JSON');
  }
}

function endpoint(method, run) {
  return async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (req.method !== method) {
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Use ${method}`, null, { Allow: method });
      }
      const origin = req.headers.origin;
      if (origin && origin !== `https://${req.headers.host}` && origin !== `http://${req.headers.host}`) {
        throw new HttpError(403, 'FORBIDDEN_ORIGIN', 'Only the site origin may call this API');
      }
      await run(req, res);
    } catch (err) {
      if (err instanceof HttpError) return sendError(res, err.status, err.code, err.message, err.field);
      console.error('[api] unexpected request failure:', err && err.code ? err.code : 'unknown');
      if (!res.headersSent) sendError(res, 500, 'SERVER_ERROR', 'Unexpected server error');
    }
  };
}

module.exports = { endpoint, readBody };
