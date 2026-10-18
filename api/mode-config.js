'use strict';

const crypto = require('crypto');
const config = require('../server/config/modes.json');
const { HttpError, sendJson } = require('../server/lib/http');
const { endpoint } = require('../server/lib/vercel-http');

module.exports = endpoint('GET', (req, res) => {
  const mode = new URL(req.url, `https://${req.headers.host}`).searchParams.get('mode');
  if (!['high', 'medium', 'basic'].includes(mode)) {
    throw new HttpError(400, 'INVALID_MODE', 'mode must be high, medium, or basic', 'mode');
  }
  const payload = {
    mode,
    configVersion: config.configVersion,
    flags: config.modes[mode],
    reducedMotionOverrides: config.reducedMotionOverrides
  };
  const etag = '"' + crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16) + '"';
  const headers = { ETag: etag, 'Cache-Control': 'public, max-age=3600' };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  sendJson(res, 200, payload, headers);
});
