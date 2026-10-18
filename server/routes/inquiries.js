'use strict';

/**
 * Contact inquiry persistence for demonstration / local evaluation.
 * Inquiries are stored on disk. There is no public read API and no email delivery.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HttpError } = require('../lib/http');

const DATA_FILE = path.join(__dirname, '..', 'data', 'inquiries.json');
const MAX_STORE = 500;
const SERVICES = new Set(['', 'Branding', 'Web Development', 'Multimedia', 'Digital Marketing']);
const BUDGETS = new Set(['', 'Under $5k', '$5k to $15k', '$15k to $50k', '$50k+', 'Prefer not to say']);

/** Recent clientRequestId values to reject accidental double-submits. */
const recentIds = new Map();
const DEDUPE_MS = 2 * 60 * 1000;

function load() {
  try {
    const list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw new HttpError(500, 'STORE_CORRUPT', 'Inquiry store could not be read');
  }
}

function save(list) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, DATA_FILE);
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

/**
 * Validate and persist an inquiry.
 * @returns {{ id: string, savedAt: string, delivery: 'saved', message: string }}
 */
function create(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'INVALID_PAYLOAD', 'body must be an object');
  }

  // Honeypot: bots filling hidden "company_website" are rejected quietly as success-shaped 400 avoidance
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

  const clientRequestId = fieldString(body, 'clientRequestId', { required: false, max: 64, pattern: /^[A-Za-z0-9_-]+$/ });
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

module.exports = { create, DATA_FILE };
