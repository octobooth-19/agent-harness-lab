import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lodash = require(path.join(process.argv[2], 'lodash.js'));
const failures = [];
function check(name, run) {
  try { run(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.log(`FAIL ${name}: ${error.message}`); }
}
check('published sparse-array reproduction preserves holes and length', () => {
  const source = new Array(5);
  source[3] = 42;
  const copy = lodash.cloneDeep(source);
  assert.equal(copy.length, 5);
  assert.deepEqual(Object.keys(copy), ['3']);
  const visited = [];
  copy.forEach((value, index) => visited.push([index, value]));
  assert.deepEqual(visited, [[3, 42]]);
});
check('all-hole arrays remain sparse', () => {
  const copy = lodash.cloneDeep(new Array(4));
  assert.equal(copy.length, 4);
  assert.deepEqual(Object.keys(copy), []);
});
check('explicit undefined remains an own element rather than a hole', () => {
  const source = [, undefined, , { value: 7 }];
  const copy = lodash.cloneDeep(source);
  assert.deepEqual(Object.keys(copy), ['1', '3']);
  assert.equal(Object.hasOwn(copy, '1'), true);
  assert.notEqual(copy[3], source[3]);
  assert.deepEqual(copy[3], source[3]);
});
check('nested sparse arrays retain structure and deep-clone objects', () => {
  const nested = new Array(3);
  nested[1] = { score: 9 };
  const source = { nested };
  const copy = lodash.cloneDeep(source);
  assert.deepEqual(Object.keys(copy.nested), ['1']);
  assert.notEqual(copy.nested[1], nested[1]);
  assert.equal(copy.nested[1].score, 9);
});
check('circular sparse arrays retain their cycle', () => {
  const source = new Array(3);
  source[2] = source;
  const copy = lodash.cloneDeep(source);
  assert.deepEqual(Object.keys(copy), ['2']);
  assert.equal(copy[2], copy);
});
check('ordinary dense array behavior remains correct', () => {
  const source = [1, undefined, { x: 2 }];
  const copy = lodash.cloneDeep(source);
  assert.deepEqual(copy, source);
  assert.notEqual(copy[2], source[2]);
  assert.deepEqual(lodash.map([1, 2, 3], value => value * 2), [2, 4, 6]);
});
console.log(JSON.stringify({ passed: 6 - failures.length, total: 6, failures }));
if (failures.length) process.exitCode = 1;
