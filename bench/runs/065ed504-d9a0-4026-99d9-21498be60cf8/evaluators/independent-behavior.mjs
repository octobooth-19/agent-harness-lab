import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const text = fs.readFileSync(path.join(process.argv[2], 'plan.md'), 'utf8');
assert.ok(text.trim().length > 200, 'a substantive design rather than a placeholder');
for (const heading of ['Decision', 'Data flow', 'Failure modes', 'Validation', 'Rollout']) {
  assert.match(text, new RegExp(`^#{1,3} ${heading}\\s*$`, 'm'), `missing section ${heading}`);
}
assert.ok(text.split(/\s+/).length <= 1200, 'plan must remain within the task word limit');
console.log('PASS architecture output structure and word budget');
