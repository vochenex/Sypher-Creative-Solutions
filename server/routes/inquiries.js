'use strict';

/**
 * Contact inquiry persistence for demonstration / local evaluation.
 *
 * Privacy:
 * - Stores name, email, and message on local disk only.
 * - Does not send email and does not expose a public read/list API.
 * - Runtime file is gitignored; created on first write (see server/data/README.md).
 * - Soft-retains at most MAX_STORE entries; operators should delete the file after demos.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HttpError } = require('../lib/http');

const DATA_FILE = path.join(__dirname, '..', 'data', 'inquiries.json');
const MAX_STORE = 500;
const MAX_BYTES = 2 * 1024 * 1024;
const SERVICES = new Set(['', 'Branding', 'Web Development', 'Multimedia', 'Digital Marketing']);
const BUDGETS = new Set(['', 'Under $5k', '$5k to $15k', '$15k to $50k', '$50k+', 'Prefer not to say']);

/** Recent clientRequestId values to reject accidental double-submits. */
const recentIds = new Map();
const DEDUPE_MS = 2 * 60 * 1000;

/**
 * Serialize store mutations. Node runs JS on one thread, and create() uses sync I/O,
 * so overlapping awaits cannot interleave inside create(); this lock documents the
 * critical section and stays correct if load/save later become async.
 */
let storeChain = Promise.resolve();
function withStoreLock(fn) {
  const run = storeChain.then(() => fn(), () => fn());
  storeChain = run.then(() => undefined, () => undefined);
  return run;
}

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) {
      throw new HttpError(500, 'STORE_CORRUPT', 'Inquiry store exceeds the allowed size');
    }
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err && err.code === 'ENOENT') return [];
    throw new HttpError(500, 'STORE_CORRUPT', 'Inquiry store could not be read');
  }
}

function save(list) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const payload = JSON.stringify(list, null, 2);
    if (Buffer.byteLength(payload, 'utf8') > MAX_BYTES) {
      throw new HttpError(500, 'STORE_FULL', 'Inquiry store would exceed the allowed size');
    }
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Never include paths or record contents in the client-facing message.
    throw new HttpError(500, 'STORE_WRITE_FAILED', 'Inquiry could not be saved');
  }
}

function clean(str) {
  return String(str).replace(/\0/g, '').trim();
}

function fieldString(body, field, { required, max, pattern }) {
  const raw = body[field];
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw new HttpError(400, 'INVALID_PAYLOAD', `${field} is required`, field);
    return '';
  }
  if (typeof raw !== 'string') {
    throw new HttpError(400, 'INVALID_PAYLOAD', `${field} must be a string`, field);
  }
  const value = clean(raw);
  if (required && !value) throw new HttpError(400, 'INVALID_PAYLOAD', `${field} is required`, field);
  if (value.length > max) {
    throw new HttpError(400, 'INVALID_PAYLOAD', `${field} must be at most ${max} characters`, field);
  }
  if (pattern && value && !pattern.test(value)) {
    throw new HttpError(400, 'INVALID_PAYLOAD', `${field} is not valid`, field);
  }
  return value;
}

function purgeDedupe(now) {
  for (const [id, at] of recentIds) {
    if (now - at > DEDUPE_MS) recentIds.delete(id);
  }
}

function createSync(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'INVALID_PAYLOAD', 'body must be an object');
  }

  // Honeypot: bots filling hidden "company_website" are rejected without storing data.
  if (body.company_website) {
    throw new HttpError(400, 'INVALID_PAYLOAD', 'Rejected', 'company_website');
  }

  const name = fieldString(body, 'name', { required: true, max: 120 });
  const email = fieldString(body, 'email', {
    required: true,
    max: 254,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  });
  const message = fieldString(body, 'message', { required: true, max: 4000 });
  const service = fieldString(body, 'service', { required: false, max: 80 });
  const budget = fieldString(body, 'budget', { required: false, max: 80 });
  if (service && !SERVICES.has(service)) {
    throw new HttpError(400, 'INVALID_PAYLOAD', 'service is not recognised', 'service');
  }
  if (budget && !BUDGETS.has(budget)) {
    throw new HttpError(400, 'INVALID_PAYLOAD', 'budget is not recognised', 'budget');
  }

  const clientRequestId = fieldString(body, 'clientRequestId', {
    required: false,
    max: 64,
    pattern: /^[A-Za-z0-9_-]+$/
  });
  const now = Date.now();
  purgeDedupe(now);
  if (clientRequestId && recentIds.has(clientRequestId)) {
    throw new HttpError(409, 'DUPLICATE_SUBMISSION', 'This inquiry was already received', 'clientRequestId');
  }

  const list = load();
  const entry = {
    id: 'inq_' + crypto.randomBytes(8).toString('hex'),
    savedAt: new Date(now).toISOString(),
    name,
    email,
    service: service || null,
    budget: budget || null,
    message,
    clientRequestId: clientRequestId || null,
    delivery: 'saved',
    note: 'Stored locally. Email was not sent.'
  };

  list.push(entry);
  while (list.length > MAX_STORE) list.shift();
  save(list);

  if (clientRequestId) recentIds.set(clientRequestId, now);

  return {
    id: entry.id,
    savedAt: entry.savedAt,
    delivery: 'saved',
    message: 'Inquiry saved on the server. Email was not sent from this demonstration environment.'
  };
}

/**
 * Validate and persist an inquiry.
 * @returns {Promise<{ id: string, savedAt: string, delivery: 'saved', message: string }>}
 */
function create(body) {
  return withStoreLock(() => createSync(body));
}

module.exports = { create, createSync, DATA_FILE, MAX_STORE, MAX_BYTES };
