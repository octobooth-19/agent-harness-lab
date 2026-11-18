import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readJSON, writeJSON, hash } from '../../store.mjs';
import { ensure } from '../../schema.mjs';
import fs from 'node:fs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const selection = readJSON(path.join(directory, 'issue-selection.json'));
const script = path.join(directory, 'evaluators', 'issue.mjs');
const result = spawnSync(process.execPath, [script, path.join(directory, 'sources', selection.commit)],
  { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 });
ensure(!result.error && result.status === 1 && result.stderr === '' &&
  result.stdout.includes('FAIL published sparse-array reproduction') &&
  result.stdout.includes('PASS ordinary dense array behavior'), 'pre-fix evaluator did not reproduce the expected behavioral failure');
const evidence = {
  schemaVersion: 1, validReproduction: true, observedAt: new Date().toISOString(),
  commit: selection.commit, evaluatorSha256: hash(fs.readFileSync(script)),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  status: result.status, stdout: result.stdout, stderr: result.stderr, noFixApplied: true,
};
writeJSON(path.join(directory, 'pre-fix-evaluator.json'), evidence);
console.log(JSON.stringify(evidence, null, 2));
