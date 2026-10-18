'use strict';

/* Sypher Adaptive Web Experience: static site plus the custom JSON API. Zero dependencies. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const { sendJson, sendError, HttpError, readJson, createRateLimiter } = require('./lib/http');
const { resolvePublicPath } = require('./lib/static-path');
const deviceProfile = require('./routes/device-profile');
const testResults = require('./routes/test-results');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MODES_FILE = path.join(__dirname, 'config', 'modes.json');

const postLimiter = createRateLimiter(30);
const getLimiter = createRateLimiter(120);

let modesConfig = JSON.parse(fs.readFileSync(MODES_FILE, 'utf8'));

function watchModesConfig() {
  fs.watchFile(MODES_FILE, { interval: 2000 }, () => {
    try {
      modesConfig = JSON.parse(fs.readFileSync(MODES_FILE, 'utf8'));
      console.log(`[config] reloaded modes.json (${modesConfig.configVersion})`);
    } catch {
      console.error('[config] modes.json is invalid; keeping previous version');
    }
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt; charset=utf-8',
  '.ico': 'image/x-icon'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'"
};

/* ---------- API ---------- */

async function handleApi(req, res, url) {
  const isPost = req.method === 'POST';
  const limit = (isPost ? postLimiter : getLimiter)(req);
  if (!limit.ok) {
    return sendError(res, 429, 'RATE_LIMITED', 'Too many requests', null, { 'Retry-After': String(limit.retryAfter) });
  }

  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
    return sendError(res, 403, 'FORBIDDEN_ORIGIN', 'Only the site origin may call this API');
  }

  const route = `${req.method} ${url.pathname}`;
  switch (route) {
    case 'POST /api/device-profile': {
      const body = await readJson(req, 4 * 1024);
      return sendJson(res, 200, deviceProfile(body, modesConfig));
    }
    case 'GET /api/mode-config': {
      const mode = url.searchParams.get('mode');
      if (!['high', 'medium', 'basic'].includes(mode)) {
        throw new HttpError(400, 'INVALID_MODE', 'mode must be high, medium, or basic', 'mode');
      }
      const payload = {
        mode,
        configVersion: modesConfig.configVersion,
        flags: modesConfig.modes[mode],
        reducedMotionOverrides: modesConfig.reducedMotionOverrides
      };
      const etag = '"' + crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16) + '"';
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=3600' });
        return res.end();
      }
      return sendJson(res, 200, payload, { ETag: etag, 'Cache-Control': 'public, max-age=3600' });
    }
    case 'POST /api/test-results': {
      const body = await readJson(req, 8 * 1024);
      return sendJson(res, 201, testResults.create(body));
    }
    case 'GET /api/test-results':
      return sendJson(res, 200, testResults.list(url.searchParams));
    default:
      return sendError(res, 404, 'NOT_FOUND', `No route for ${route}`);
  }
}

/* ---------- Static files ---------- */

function sendStaticError(res, status, message) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, Object.assign({
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  }, SECURITY_HEADERS));
  res.end(message);
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  let file;
  try {
    file = resolvePublicPath(PUBLIC_DIR, url.pathname);
  } catch (err) {
    if (err instanceof HttpError) {
      return sendStaticError(res, err.status, err.message);
    }
    throw err;
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      return sendStaticError(res, 404, 'Not found');
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, Object.assign({
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
    }, SECURITY_HEADERS));
    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(file);
    stream.on('error', (streamErr) => {
      console.error('[static] read stream error:', streamErr.message);
      if (!res.headersSent) {
        sendStaticError(res, 500, 'Error reading file');
      } else {
        res.destroy(streamErr);
      }
    });
    stream.pipe(res);
  });
}

function parseRequestUrl(req) {
  try {
    return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    throw new HttpError(400, 'MALFORMED_URL', 'Request URL could not be parsed');
  }
}

function handleRequest(req, res) {
  let url;
  try {
    url = parseRequestUrl(req);
  } catch (err) {
    if (err instanceof HttpError) {
      return sendError(res, err.status, err.code, err.message);
    }
    console.error(err);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected server error');
  }

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      if (err instanceof HttpError) return sendError(res, err.status, err.code, err.message, err.field);
      console.error(err);
      if (!res.headersSent) sendError(res, 500, 'SERVER_ERROR', 'Unexpected server error');
    });
    return;
  }

  try {
    serveStatic(req, res, url);
  } catch (err) {
    if (err instanceof HttpError) {
      return sendStaticError(res, err.status, err.message);
    }
    console.error(err);
    sendStaticError(res, 500, 'Unexpected server error');
  }
}

/* ---------- Server ---------- */

function createServer() {
  return http.createServer(handleRequest);
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] :
    process.platform === 'darwin' ? ['open', [url]] :
    ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => console.log(`Could not open a browser; visit ${url} manually.`));
    child.unref();
  } catch {
    console.log(`Could not open a browser; visit ${url} manually.`);
  }
}

function start(port = PORT) {
  watchModesConfig();
  const server = createServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the other server or run with a different PORT.`);
      process.exit(1);
    }
    throw err;
  });
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`Sypher adaptive site running at ${url}`);
    console.log(`Debug view:  ${url}/?debug=1`);
    if (process.argv.includes('--open')) openBrowser(url);
  });
  return server;
}

if (require.main === module) {
  start();
}

module.exports = {
  createServer,
  start,
  handleRequest,
  PUBLIC_DIR,
  SECURITY_HEADERS
};
