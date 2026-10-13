'use strict';

/* Sypher Adaptive Web Experience: static site plus the custom JSON API. Zero dependencies. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const { sendJson, sendError, HttpError, readJson, createRateLimiter } = require('./lib/http');
const deviceProfile = require('./routes/device-profile');
const testResults = require('./routes/test-results');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MODES_FILE = path.join(__dirname, 'config', 'modes.json');

const postLimiter = createRateLimiter(30);
const getLimiter = createRateLimiter(120);

let modesConfig = JSON.parse(fs.readFileSync(MODES_FILE, 'utf8'));
fs.watchFile(MODES_FILE, { interval: 2000 }, () => {
  try {
    modesConfig = JSON.parse(fs.readFileSync(MODES_FILE, 'utf8'));
    console.log(`[config] reloaded modes.json (${modesConfig.configVersion})`);
  } catch {
    console.error('[config] modes.json is invalid; keeping previous version');
  }
});

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

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SECURITY_HEADERS));
      return res.end('Not found');
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, Object.assign({
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
    }, SECURITY_HEADERS));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- Server ---------- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      if (err instanceof HttpError) return sendError(res, err.status, err.code, err.message, err.field);
      console.error(err);
      sendError(res, 500, 'SERVER_ERROR', 'Unexpected server error');
    });
    return;
  }
  serveStatic(req, res, url);
});

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

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other server or run with a different PORT.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Sypher adaptive site running at ${url}`);
  console.log(`Debug view:  ${url}/?debug=1`);
  if (process.argv.includes('--open')) openBrowser(url);
});
