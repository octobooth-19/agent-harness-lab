import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { parseLog } = await import(pathToFileURL(path.join(process.argv[2], 'parse-log.mjs')));
const cases = [
  ['2026-01-02T03:04:05Z|INFO|ready', { timestamp: '2026-01-02T03:04:05Z', level: 'INFO', message: 'ready' }],
  ['2026-01-02T03:04:05Z|WARN|a|b', { timestamp: '2026-01-02T03:04:05Z', level: 'WARN', message: 'a|b' }],
  ['{"timestamp":"2026-01-02T03:04:05Z","level":"error","message":"disk full","extra":3}',
    { timestamp: '2026-01-02T03:04:05Z', level: 'ERROR', message: 'disk full' }],
  ['{"timestamp":"2026-01-02T03:04:05Z","level":"info","message":""}',
    { timestamp: '2026-01-02T03:04:05Z', level: 'INFO', message: '' }],
  ['not a record', null], ['{"level":"INFO"}', null], ['{', null], ['[]', null],
  ['{"timestamp":5,"level":"INFO","message":"bad"}', null],
  ['{"timestamp":"x","level":"DEBUG","message":"not supported"}', null],
];
let passed = 0;
for (const [input, expected] of cases) {
  try { assert.deepEqual(parseLog(input), expected); passed++; }
  catch (error) { console.log(`FAIL ${JSON.stringify(input)}: ${error.message}`); }
}
console.log(JSON.stringify({ passed, total: cases.length }));
if (passed !== cases.length) process.exitCode = 1;
