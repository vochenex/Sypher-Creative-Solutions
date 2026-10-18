'use strict';

/**
 * Cross-platform test entrypoint for Node >=18.
 * Avoids shell glob expansion (unreliable on Windows cmd.exe and some npm versions).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function collectTests(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTests(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

const testRoot = __dirname;
const files = collectTests(testRoot, []).sort();

if (files.length === 0) {
  console.error('No *.test.js files found under', testRoot);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  windowsHide: true
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status == null ? 1 : result.status);
