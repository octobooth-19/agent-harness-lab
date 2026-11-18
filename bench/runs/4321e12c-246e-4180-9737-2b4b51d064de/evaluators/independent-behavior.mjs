import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const value = JSON.parse(fs.readFileSync(path.join(process.argv[2], 'requirements.json'), 'utf8'));
for (const key of ['requirements', 'questions', 'assumptions', 'outOfScope']) assert.ok(Array.isArray(value[key]), `${key} must be an array`);
assert.ok(value.requirements.length >= 4, 'at least four observable requirements');
assert.ok(value.questions.length >= 2, 'at least two unresolved stakeholder questions');
const ids = value.requirements.map(item => item.id);
assert.equal(new Set(ids).size, ids.length, 'requirement IDs are unique');
for (const item of value.requirements) {
  assert.ok(typeof item.id === 'string' && item.id);
  assert.ok(typeof item.statement === 'string' && item.statement);
  assert.ok(typeof item.acceptance === 'string' && item.acceptance);
}
console.log('PASS structured requirement and question contract');
