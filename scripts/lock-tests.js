#!/usr/bin/env node
/**
 * Locks and verifies the unit/integration test suite (test/*.test.js).
 *
 * Usage:
 *   node scripts/lock-tests.js --lock     # Generate test/test-lock.json and set chmod 0444 (read-only)
 *   node scripts/lock-tests.js --verify   # Verify SHA-256 hashes, test list, and read-only lock status
 *   node scripts/lock-tests.js --unlock   # Restore write permissions (0644) for authorized test updates
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEST_DIR = path.join(__dirname, '..', 'test');
const LOCK_FILE = path.join(TEST_DIR, 'test-lock.json');

function getTestFiles() {
  return fs
    .readdirSync(TEST_DIR)
    .filter((f) => f.endsWith('.test.js'))
    .sort();
}

function extractTestNames(sourceText) {
  const names = [];
  const regex = /\btest\(\s*(['"`])([\s\S]*?)\1/g;
  let match;
  while ((match = regex.exec(sourceText)) !== null) {
    names.push(match[2].replace(/\s+/g, ' ').trim());
  }
  return names;
}

function computeFileMetadata(fileName) {
  const fullPath = path.join(TEST_DIR, fileName);
  const buf = fs.readFileSync(fullPath);
  const text = buf.toString('utf8');
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const lines = text.split('\n').length;
  const tests = extractTestNames(text);
  return {
    sha256,
    bytes: buf.length,
    lines,
    testCount: tests.length,
    tests
  };
}

function unlockFiles() {
  const files = getTestFiles();
  for (const f of files) {
    const p = path.join(TEST_DIR, f);
    if (fs.existsSync(p)) {
      fs.chmodSync(p, 0o644);
    }
  }
  if (fs.existsSync(LOCK_FILE)) {
    fs.chmodSync(LOCK_FILE, 0o644);
  }
  console.log('Unlocked test files (mode 0644).');
}

function lockTests() {
  const files = getTestFiles();
  if (files.length === 0) {
    console.error('No test/*.test.js files found to lock.');
    process.exit(1);
  }

  // Ensure lock file is writable before regenerating
  if (fs.existsSync(LOCK_FILE)) {
    fs.chmodSync(LOCK_FILE, 0o644);
  }

  const fileMap = {};
  let totalTests = 0;

  for (const fileName of files) {
    const meta = computeFileMetadata(fileName);
    fileMap[fileName] = meta;
    totalTests += meta.testCount;
  }

  const lockPayload = {
    locked: true,
    targetDevice: 'Google Pixel 10',
    totalTestFiles: files.length,
    totalTests,
    files: fileMap
  };

  fs.writeFileSync(LOCK_FILE, `${JSON.stringify(lockPayload, null, 2)}\n`, 'utf8');

  // Set read-only permissions (0444) on all test files and the lock manifest
  for (const fileName of files) {
    fs.chmodSync(path.join(TEST_DIR, fileName), 0o444);
  }
  fs.chmodSync(LOCK_FILE, 0o444);

  console.log(
    `Locked ${files.length} test file(s) (${totalTests} unit/integration tests) in test/test-lock.json with SHA-256 verification and mode 0444 (read-only).`
  );
}

function verifyTests() {
  if (!fs.existsSync(LOCK_FILE)) {
    console.error('LOCK ERROR: test/test-lock.json is missing. Run `npm run test:lock`.');
    process.exit(1);
  }

  const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
  if (!lockData.locked) {
    console.error('LOCK ERROR: test/test-lock.json is not marked as locked.');
    process.exit(1);
  }

  const actualFiles = getTestFiles();
  const lockedFiles = Object.keys(lockData.files || {}).sort();

  if (JSON.stringify(actualFiles) !== JSON.stringify(lockedFiles)) {
    console.error(
      `LOCK ERROR: Test files on disk (${actualFiles.join(', ')}) do not match locked manifest (${lockedFiles.join(', ')}).`
    );
    process.exit(1);
  }

  for (const fileName of lockedFiles) {
    const fullPath = path.join(TEST_DIR, fileName);
    const expected = lockData.files[fileName];
    const actual = computeFileMetadata(fileName);

    if (actual.sha256 !== expected.sha256) {
      console.error(
        `LOCK ERROR: SHA-256 mismatch for test/${fileName}.\n  Expected: ${expected.sha256}\n  Actual:   ${actual.sha256}`
      );
      process.exit(1);
    }

    const stat = fs.statSync(fullPath);
    if ((stat.mode & 0o222) !== 0) {
      console.error(
        `LOCK ERROR: test/${fileName} is writable (${(stat.mode & 0o777).toString(8)}). Expected read-only mode 0444.`
      );
      process.exit(1);
    }
  }

  console.log(
    `✔ Verified locked test suite: ${lockData.totalTestFiles} files, ${lockData.totalTests} tests match SHA-256 lock and read-only (0444) permissions.`
  );
}

const arg = process.argv[2] || '--verify';
if (arg === '--lock') {
  lockTests();
} else if (arg === '--unlock') {
  unlockFiles();
} else {
  verifyTests();
}
