'use strict';

const fs = require('fs');
const path = require('path');
const { HttpError } = require('../lib/http');

const DATA_FILE = path.join(__dirname, '..', 'data', 'test-results.json');
const MODES = ['high', 'medium', 'basic'];
const CATEGORIES = ['high-end-computer', 'mid-low-computer', 'mobile'];

function load() {
  try {
    const list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(list) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function str(v, field, max, required) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, 'INVALID_PAYLOAD', `${field} is required`, field);
    return '';
  }
  if (typeof v !== 'string' || v.length > max) throw new HttpError(400, 'INVALID_PAYLOAD', `${field} must be a string of at most ${max} characters`, field);
  return v;
}

function create(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'INVALID_PAYLOAD', 'body must be an object');
  if (!MODES.includes(body.expectedMode)) throw new HttpError(400, 'INVALID_PAYLOAD', 'expectedMode must be high, medium, or basic', 'expectedMode');
  if (!MODES.includes(body.modeUsed)) throw new HttpError(400, 'INVALID_PAYLOAD', 'modeUsed must be high, medium, or basic', 'modeUsed');
  if (!body.profile || typeof body.profile !== 'object') throw new HttpError(400, 'INVALID_PAYLOAD', 'profile is required', 'profile');
  if (body.deviceCategory && !CATEGORIES.includes(body.deviceCategory)) throw new HttpError(400, 'INVALID_PAYLOAD', 'deviceCategory is not recognised', 'deviceCategory');

  const list = load();
  const entry = {
    id: 'tr_' + String(list.length + 1).padStart(4, '0'),
    savedAt: new Date().toISOString(),
    testerLabel: str(body.testerLabel, 'testerLabel', 120),
    deviceDescription: str(body.deviceDescription, 'deviceDescription', 200),
    deviceCategory: body.deviceCategory || 'unknown',
    browser: str(body.browser, 'browser', 80),
    os: str(body.os, 'os', 80),
    score: typeof body.profile.score === 'number' ? body.profile.score : null,
    class: typeof body.profile.class === 'string' ? body.profile.class : null,
    estimated: !!body.profile.estimated,
    breakdown: body.profile.breakdown || null,
    appliedCaps: Array.isArray(body.profile.appliedCaps) ? body.profile.appliedCaps.slice(0, 10) : [],
    signals: body.signals || null,
    modeUsed: body.modeUsed,
    source: body.source === 'manual' ? 'manual' : 'auto',
    expectedMode: body.expectedMode,
    pass: body.pass === true,
    notes: str(body.notes, 'notes', 500),
    timing: body.timing || null
  };
  list.push(entry);
  save(list);
  return { id: entry.id, savedAt: entry.savedAt };
}

function list(query) {
  let limit = 50;
  if (query.has('limit')) {
    limit = Number(query.get('limit'));
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new HttpError(400, 'INVALID_QUERY', 'limit must be an integer between 1 and 200', 'limit');
  }
  const expected = query.get('expectedMode');
  if (expected && !MODES.includes(expected)) throw new HttpError(400, 'INVALID_QUERY', 'expectedMode must be high, medium, or basic', 'expectedMode');
  const results = load()
    .filter((r) => !expected || r.expectedMode === expected)
    .slice(-limit)
    .reverse();
  return { count: results.length, results };
}

module.exports = { create, list };
