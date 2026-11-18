import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { hash, readJSON, writeJSON } from '../../store.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const selection = readJSON(path.join(directory, 'issue-selection.json'));
const sourceFile = path.join(directory, 'sources', selection.commit, 'lodash.js');
const require = createRequire(import.meta.url);
const lodash = require(sourceFile);
const original = new Array(5);
original[3] = 42;
const cloned = lodash.cloneDeep(original);
const visited = value => {
  const indices = [];
  value.forEach((_, index) => indices.push(index));
  return indices;
};
const actual = { length: cloned.length, ownIndices: Object.keys(cloned), forEachIndices: visited(cloned) };
const expected = { length: original.length, ownIndices: Object.keys(original), forEachIndices: visited(original) };
const reproduced = JSON.stringify(actual) !== JSON.stringify(expected);
const evidence = {
  schemaVersion: 1, observedAt: new Date().toISOString(), repository: selection.repository,
  issueUrl: selection.issue.url, commit: selection.commit, sourceSha256: hash(fs.readFileSync(sourceFile)),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  invocation: 'node bench/campaigns/sdlc-20261118/reproduce.mjs',
  input: 'const original = new Array(5); original[3] = 42; lodash.cloneDeep(original)',
  expected, actual, reproduced, noFixApplied: true,
};
writeJSON(path.join(directory, 'pre-fix-reproduction.json'), evidence);
console.log(JSON.stringify(evidence, null, 2));
if (!reproduced) process.exitCode = 1;
