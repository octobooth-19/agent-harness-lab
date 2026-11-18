import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { report } from '../../lifecycle.mjs';
import { readJSON, writeJSON } from '../../store.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');
const freeze = readJSON(path.join(directory, 'freeze.json'));
const selected = new Set(freeze.cases.map(record => record.id));
const snapshot = report(root);
const candidates = snapshot.runs.filter(run => selected.has(run.case));
const matchesFreeze = run => {
  const record = freeze.cases.find(record => record.id === run.case);
  if (run.version !== record.version || run.caseSha256 !== record.caseSha256 || run.rubricSha256 !== record.rubricSha256) return false;
  if (run.variant === 'baseline') return run.profileSha256 === null && run.componentHashes.length === 0;
  return run.variant === 'initial-harness' && run.profileSha256 === freeze.treatment.sha256 &&
    JSON.stringify(run.componentHashes) === JSON.stringify(freeze.treatment.components.map(component => component.sha256));
};
const runs = candidates.filter(matchesFreeze);
const excludedRuns = candidates.filter(run => !matchesFreeze(run)).map(run => ({
  ...run, exclusionReason: 'Run case/rubric revision or arm/profile/component hashes do not match this frozen campaign; do not aggregate it with matched trials.',
}));
const cases = freeze.cases.map(record => ({
  caseId: record.id, stage: record.stage, partition: record.partition,
  arms: ['baseline', 'initial-harness'].map(arm => {
    const trials = runs.filter(run => run.case === record.id && run.variant === arm);
    const graded = trials.filter(run => run.status === 'graded');
    return { arm, prepared: trials.length, graded: graded.length, passed: graded.filter(run => run.passed).length,
      meanScore: graded.length ? graded.reduce((sum, run) => sum + run.score, 0) / graded.length : null,
      ungraded: trials.filter(run => run.status !== 'graded').map(run => ({ runId: run.runId, status: run.status })),
      metrics: trials.map(run => ({ runId: run.runId, ...(run.metrics ?? {
        wallMs: null, inputTokens: null, outputTokens: null, totalTokens: null, observedFrom: 'not collected or not observable',
      }) })) };
  }),
}));
const result = { schemaVersion: 1, campaignId: freeze.campaignId, reportedAt: new Date().toISOString(),
  interpretation: 'Descriptive smoke results only. Tiny sample, Auto routing and inherited runtime configuration confound comparisons. Missing/blocked/ungraded is not a pass. Held-out maintenance may not inform this profile.',
  cases, runs, excludedRuns, groups: snapshot.groups.filter(group => freeze.cases.some(record => record.caseSha256 === group.caseSha256)) };
const destination = path.join(directory, 'reports', `${randomUUID()}.json`);
fs.mkdirSync(path.dirname(destination), { recursive: true });
writeJSON(destination, result);
console.log(JSON.stringify({ reportFile: destination, ...result }, null, 2));
