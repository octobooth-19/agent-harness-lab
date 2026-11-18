import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const workspace = process.argv[2];
const tests = fs.readFileSync(path.join(workspace, 'submission.test.mjs'), 'utf8');
assert.ok(tests.includes('node:test') && tests.includes('node:assert'), 'use built-in test runner and assertions');
assert.ok(tests.includes('countRecent'), 'tests must exercise the actual exported function');
const review = fs.readFileSync(path.join(workspace, 'review.md'), 'utf8');
assert.ok(review.trim().length > 100, 'review must explain observed behavior');
const result = spawnSync(process.execPath, ['--test', 'submission.test.mjs'], {
  cwd: workspace, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
});
assert.equal(result.error, undefined, result.error?.message);
assert.equal(result.status, 1, 'submitted regression tests should expose the unfixed module');
assert.match(result.stdout + result.stderr, /AssertionError|ERR_ASSERTION/, 'failure must be an assertion, not syntax/import failure');
assert.doesNotMatch(result.stdout + result.stderr, /ERR_MODULE_NOT_FOUND|SyntaxError/);
console.log('PASS authored tests execute and expose a genuine assertion failure in the unfixed module');
console.log(result.stdout);
