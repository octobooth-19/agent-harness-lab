import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Catalog, readJSON, hash } from './store.mjs';
import { prepare, collect } from './lifecycle.mjs';

const bench = path.dirname(fileURLToPath(import.meta.url));

test('campaign freezes five valid cases then prepares exact independent baseline/treatment sources without running models', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-campaign-test-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'lab');
  const campaign = path.join(root, 'bench/campaigns/sdlc-20261118');
  fs.mkdirSync(path.join(root, 'bench'), { recursive: true });
  for (const name of ['store.mjs', 'schema.mjs', 'lifecycle.mjs']) fs.copyFileSync(path.join(bench, name), path.join(root, 'bench', name));
  fs.cpSync(path.join(bench, 'campaigns/sdlc-20261118'), campaign, {
    recursive: true, filter: source => !['freeze.json', 'launches', 'reports'].includes(path.basename(source)),
  });
  const catalog = new Catalog(root);
  catalog.put('components', { schemaVersion: 1, id: 'fixture-guidance', version: 1, title: 'Test fixture only',
    kind: 'instructions', prompt: '', files: {
      '.github/copilot-instructions.md': 'Synthetic test configuration; no model executed.\n',
      '.github/skills/fixture/SKILL.md': 'Synthetic skill; no model executed.\n',
    } }, 'create');
  catalog.put('profiles', { schemaVersion: 1, id: 'fixture-profile', version: 1, title: 'Fixture profile', target: 'app',
    parts: [{ id: 'fixture-guidance', version: 1, enabled: true }] }, 'create');
  const invoke = (script, ...args) => {
    const result = spawnSync(process.execPath, [path.join(campaign, script), ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  invoke('build-catalog.mjs', '--profile', 'fixture-profile', '--version', '1', '--lab-commit', 'a'.repeat(40));
  const freeze = readJSON(path.join(campaign, 'freeze.json'));
  assert.equal(freeze.labBaseCommit, 'a'.repeat(40));
  assert.equal(freeze.cases.length, 5);
  assert.equal(freeze.cases.filter(record => record.partition === 'held-out').length, 1);
  assert.equal(catalog.validateAll().valid, true);
  const workspaceRoot = path.join(temporary, 'trials');
  fs.mkdirSync(workspaceRoot);
  const baseline = invoke('prepare-campaign.mjs', '--arm', 'baseline', '--workspace-root', workspaceRoot);
  const treatment = invoke('prepare-campaign.mjs', '--arm', 'initial-harness', '--workspace-root', workspaceRoot);
  const audit = invoke('verify-prepared.mjs');
  assert.equal(audit.independentWorkspaces, 10);
  assert.equal(audit.identicalArmPrompts, true);
  assert.equal(audit.actualAppLoadingVerified, false, 'materialization is not proof of actual app loading');
  assert.equal(new Set([...baseline.trials, ...treatment.trials].map(trial => trial.workspace)).size, 10);
  for (const trial of baseline.trials) {
    const manifest = readJSON(trial.manifest);
    assert.deepEqual(manifest.components, []);
    assert.equal(manifest.profile, undefined);
    assert.equal(fs.existsSync(path.join(trial.workspace, '.github')), false);
    assert.equal(fs.existsSync(path.join(trial.workspace, 'evaluators')), false);
    assert.equal(manifest.policy.value.runner, 'app');
    const matched = treatment.trials.find(other => other.caseId === trial.caseId);
    const treatmentManifest = readJSON(matched.manifest);
    assert.equal(manifest.case.sha256, treatmentManifest.case.sha256);
    assert.equal(manifest.rubric.sha256, treatmentManifest.rubric.sha256);
    assert.equal(manifest.policy.sha256, treatmentManifest.policy.sha256);
    for (const input of manifest.inputs) {
      assert.equal(hash(fs.readFileSync(path.join(matched.workspace, input.path))), input.sha256);
    }
  }
  const issue = baseline.trials.find(trial => trial.stage === 'issue');
  const issueManifest = readJSON(issue.manifest);
  assert.equal(issueManifest.case.value.source.repository, 'lodash/lodash');
  assert.equal(fs.statSync(path.join(issue.workspace, 'lodash.js')).size, 545953);
  assert.match(fs.readFileSync(path.join(issue.workspace, 'LICENSE'), 'utf8'), /Permission is hereby granted/);
  const evaluator = spawnSync(process.execPath, [
    path.join(path.dirname(issue.manifest), 'evaluators/independent-behavior.mjs'), issue.workspace,
  ], { encoding: 'utf8' });
  assert.equal(evaluator.status, 1);
  assert.equal(evaluator.stderr, '');
  assert.match(evaluator.stdout, /FAIL published sparse-array reproduction/);
  assert.match(evaluator.stdout, /PASS ordinary dense array behavior/);
  const summary = invoke('report-campaign.mjs');
  assert.equal(summary.runs.length, 10);
  assert.ok(summary.runs.every(run => run.status === 'prepared' && run.passed === null));
  assert.ok(summary.cases.every(record => record.arms.every(arm => arm.graded === 0 && arm.meanScore === null)));
  assert.equal(summary.cases[0].arms[0].metrics[0].totalTokens, null);
  const first = catalog.read('cases', freeze.cases[0].id);
  catalog.put('cases', { ...first, version: 2, task: `${first.task}\nA later, out-of-campaign revision.` }, 'update');
  const excluded = prepare(root, first.id, { version: 2, variant: 'baseline', workspaceRoot });
  const later = invoke('report-campaign.mjs');
  assert.equal(later.runs.length, 10, 'later revisions must not contaminate the frozen comparison');
  assert.equal(later.excludedRuns.length, 1);
  assert.equal(later.excludedRuns[0].runId, excluded.runId);
  const mismatchedModel = prepare(root, first.id, { version: 1, variant: 'baseline', workspaceRoot, model: 'different-model' });
  const modelReport = invoke('report-campaign.mjs');
  assert.equal(modelReport.runs.length, 10, 'a different requested model must not contaminate the app campaign');
  assert.ok(modelReport.excludedRuns.some(run => run.runId === mismatchedModel.runId));
  const mismatchedRunner = prepare(root, first.id, { version: 1, variant: 'baseline', workspaceRoot });
  collect(root, mismatchedRunner.runId, { schemaVersion: 1, sessionId: randomUUID(), runner: 'manual', model: 'auto',
    actualModel: 'test-fixture', environment: 'Synthetic unit test; no agent ran', configurationAudit: 'Synthetic test evidence',
    permissions: [], isolation: 'workspace-only', outcome: 'failed' }, { allowCommands: true });
  const runnerReport = invoke('report-campaign.mjs');
  assert.equal(runnerReport.runs.length, 10, 'a manual run must not count as an app campaign trial');
  assert.ok(runnerReport.excludedRuns.some(run => run.runId === mismatchedRunner.runId));
  assert.deepEqual(runnerReport.groups, [], 'excluded execution contexts must not leak into aggregate groups');
  fs.writeFileSync(path.join(baseline.trials[0].workspace, 'unintended-rubric.json'), '{}');
  const badAudit = spawnSync(process.execPath, [path.join(campaign, 'verify-prepared.mjs')], { cwd: root, encoding: 'utf8' });
  assert.notEqual(badAudit.status, 0);
  assert.match(badAudit.stderr, /unexpected subject file/);
});
