import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Catalog, hash, readJSON } from '../bench/store.mjs';
import { executeHeadless, prepare } from '../bench/lifecycle.mjs';
import { Discovery, sourceKey } from './discovery.mjs';

function setup(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-tests-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'lab');
  const workspaceRoot = path.join(temp, 'trial-roots');
  fs.mkdirSync(root);
  fs.mkdirSync(workspaceRoot);
  return { root, workspaceRoot, ledger: new Discovery(root), catalog: new Catalog(root) };
}

const source = { repo: 'example-fixture/agent-notes', commit: 'a'.repeat(40) };
const key = sourceKey(source);
const upstreamPath = 'portable/review.md';
const fixture = {
  [upstreamPath]: 'Before proposing a change, identify constraints and name the verification step.\n',
  'LICENSE': 'Fixture content may be used, modified, and redistributed. Preserve this notice.\n',
};
const skillPath = '.github/skills/review-step/SKILL.md';
const noticePath = 'THIRD-PARTY-NOTICES/review-step.txt';
const scan = {
  schemaVersion: 1, source, revision: 1, scope: 'Synthetic review workflow fixture',
  coverage: { tree: 'complete', state: 'complete', limits: ['Synthetic fixture, not a live repository'], next: [] },
  files: Object.entries(fixture).map(([file, content]) => ({ path: file, status: 'inspected', sha256: hash(content) })),
  candidates: [{
    path: upstreamPath, kind: 'skill', purpose: 'Plan a verification step before proposing a change.',
    requirements: [], overlaps: ['Compare with existing change-review instructions.'],
    compatibility: { status: 'adaptation-needed', notes: 'Add Copilot skill metadata and a narrow trigger.' },
    license: { status: 'permissive', expression: 'LicenseRef-SyntheticFixture', attribution: 'Keep fixture notice.', evidence: ['LICENSE'] },
    evidence: [{ path: upstreamPath, note: 'Line 1 names constraints and verification.' }],
    links: [{ path: 'LICENSE', reason: 'Notice governing the fixture.' }],
  }],
};
const component = {
  schemaVersion: 1, version: 1, id: 'review-step', title: 'Review step', kind: 'skill', prompt: '',
  files: {
    [skillPath]: '---\nname: review-step\ndescription: Check constraints before a proposed change.\n---\nName the relevant constraint and one verification step.\n',
    [noticePath]: fixture.LICENSE,
  },
};
const pin = ({ id, version }) => ({ id, version });
const profile = (parts, target = 'portable') => ({ schemaVersion: 1, id: 'review', title: 'Review harness', version: 1, target, parts });
const decision = {
  sourceKey: key, scanRevision: 1, path: upstreamPath, revision: 1, decision: 'adopted',
  reason: 'Focused, nonoverlapping review procedure.', component: pin(component),
  adaptation: 'Added Copilot metadata and scoped activation; no external requirements.', notices: [noticePath],
};

test('fixture discovery -> curation -> enable/disable -> frozen benchmark; deletion preserves historical pins', t => {
  const { root, workspaceRoot, ledger, catalog } = setup(t);
  ledger.saveScan(scan);
  catalog.put('components', component, 'create');
  const adoption = ledger.decide(decision);
  assert.equal(adoption.sourceSha256, hash(fixture[upstreamPath]));
  assert.equal(adoption.componentSha256, hash(component));
  assert.throws(() => ledger.decide(decision), /next revision/);
  catalog.put('profiles', profile([{ ...pin(component), enabled: true }]), 'create');
  const enabled = catalog.profileVariant('review', 1, 'enabled');
  catalog.put('profiles', { ...profile([{ ...pin(component), enabled: false }]), version: 2 }, 'update');
  const disabled = catalog.profileVariant('review', 2, 'disabled');
  assert.deepEqual(disabled.components, []);
  const rubric = { schemaVersion: 1, id: 'review', version: 1, title: 'Review', passScore: 1,
    criteria: [{ id: 'verification', description: 'Name a practical verification step.', maxScore: 1 }] };
  catalog.put('rubrics', rubric, 'create');
  const benchmark = { schemaVersion: 1, id: 'review', version: 1, title: 'Review a proposal', rubric: pin(rubric),
    task: 'Review the proposed change; write a short review.md.', files: { 'proposal.txt': 'Make the label clearer.' },
    variants: [enabled, disabled], checks: [{ id: 'review', type: 'file-exists', path: 'review.md' }] };
  assert.throws(() => catalog.put('cases', { ...benchmark, variants: [{ ...enabled, components: [] }] }, 'create'), /match enabled profile/);
  catalog.put('cases', benchmark, 'create');
  fs.writeFileSync(path.join(workspaceRoot, 'existing.txt'), 'unmanaged');
  catalog.delete('components', component.id, 1);
  catalog.delete('profiles', 'review', 2);
  const treatment = prepare(root, 'review', { variant: 'enabled', workspaceRoot });
  const control = prepare(root, 'review', { variant: 'disabled', workspaceRoot });
  catalog.put('profiles', { ...profile([], 'app'), id: 'app-review' }, 'create');
  catalog.put('cases', { ...benchmark, version: 2, variants: [catalog.profileVariant('app-review')] }, 'update');
  const app = prepare(root, 'review', { variant: 'app-review', workspaceRoot });
  assert.throws(() => executeHeadless(root, app.runId, { environment: 'Fixture', configurationAudit: 'No launch expected.' }), /targets the app/);
  assert.equal(fs.readFileSync(path.join(treatment.workspace, skillPath), 'utf8'), component.files[skillPath]);
  assert.equal(fs.readFileSync(path.join(treatment.workspace, noticePath), 'utf8'), fixture.LICENSE);
  assert.equal(fs.existsSync(path.join(control.workspace, skillPath)), false);
  assert.equal(fs.existsSync(path.join(control.workspace, noticePath)), false);
  assert.equal(fs.readFileSync(path.join(workspaceRoot, 'existing.txt'), 'utf8'), 'unmanaged');
  assert.equal(readJSON(treatment.manifest).profile.value.version, 1);
  assert.deepEqual(readJSON(control.manifest).components, []);
  assert.equal(catalog.validateAll().valid, true);
});

test('profile validation rejects wrong dependency pins, portable collisions, and runtime mismatch', t => {
  const { catalog } = setup(t);
  catalog.put('components', component, 'create');
  const dependent = { ...component, id: 'dependent', files: { 'reference.md': 'Checks.' }, requires: [pin(component)] };
  catalog.put('components', dependent, 'create');
  const selected = value => ({ ...pin(value), enabled: true });
  assert.throws(() => catalog.put('profiles', profile([selected(dependent), { ...selected(component), enabled: false }]), 'create'), /requires review-step@1/);
  catalog.put('components', { ...component, version: 2 }, 'update');
  assert.throws(() => catalog.put('profiles', profile([selected(dependent), selected({ ...component, version: 2 })]), 'create'), /requires review-step@1/);
  const alias = { ...component, id: 'alias', files: { '.github/skills/alias/SKILL.md': component.files[skillPath] } };
  const pathCollision = { ...component, id: 'collision', files: { [skillPath.toUpperCase()]: 'not a directory' } };
  const app = { ...component, id: 'app-only', files: {}, runtime: { appSetup: 'Requires an app setting.' } };
  for (const record of [alias, pathCollision, app]) catalog.put('components', record, 'create');
  assert.throws(() => catalog.put('profiles', profile([selected(component), selected(alias)]), 'create'), /entry-point name collision/);
  assert.throws(() => catalog.put('profiles', profile([selected(component), selected(pathCollision)]), 'create'), /file collision/);
  assert.throws(() => catalog.put('profiles', profile([selected(app)], 'headless'), 'create'), /incompatible with headless/);
  assert.throws(() => catalog.put('profiles', profile([selected(app)], 'portable'), 'create'), /incompatible with portable/);
  assert.equal(catalog.put('profiles', profile([selected(app)], 'app'), 'create').target, 'app');
});

test('batch reservations resume the same app session and deduplicate work across batches', t => {
  const { ledger } = setup(t);
  const batch = { schemaVersion: 1, id: 'fixture', sources: [source] };
  assert.throws(() => ledger.batch({ ...batch, sources: [source, { ...source, repo: source.repo.toUpperCase() }] }), /one pinned revision/);
  ledger.batch(batch);
  ledger.batch({ ...batch, id: 'another' });
  const dispatch = (version, action, attrs) => ledger.dispatch('fixture', key, { version, action, ...attrs });
  const sessionId = 'synthetic-app-session';
  const resultCommit = 'b'.repeat(40);
  dispatch(0, 'reserve');
  assert.throws(() => ledger.dispatch('another', key, { version: 1, action: 'reserve' }), /already reserved/);
  assert.throws(() => dispatch(0, 'reserve'), /stale dispatch version/);
  dispatch(1, 'bind', { sessionId });
  ledger.saveScan({ ...scan, coverage: { tree: 'truncated', state: 'partial', limits: ['Incomplete tree'], next: ['Inspect subtree'] } });
  assert.equal(dispatch(2, 'accept', { sessionId, scanRevision: 1, resultCommit }).status, 'partial');
  assert.throws(() => dispatch(3, 'resume', { sessionId: 'other' }), /session ID must match/);
  dispatch(3, 'resume', { sessionId });
  assert.throws(() => dispatch(4, 'accept', { sessionId, scanRevision: 1, resultCommit }), /already accepted/);
  assert.throws(() => ledger.saveScan({ ...scan, revision: 2, files: [{ ...scan.files[0], sha256: 'f'.repeat(64) }, scan.files[1]] }), /inspected bytes changed/);
  ledger.saveScan({ ...scan, revision: 2 });
  assert.equal(dispatch(4, 'accept', { sessionId, scanRevision: 2, resultCommit }).status, 'complete');
  assert.equal(ledger.status('another')[0].result.sha256, hash(ledger.scan(key, 2)));
});

test('indexed material cannot be adopted and unclear licenses remain reference-only', t => {
  const { ledger, catalog } = setup(t);
  const indexed = { path: upstreamPath, status: 'indexed', reason: 'Not read yet.' };
  assert.throws(() => ledger.saveScan({ ...scan, files: [indexed, scan.files[1]] }), /missing inspected evidence/);
  const unclear = { ...scan.candidates[0], license: { status: 'unclear', expression: 'NOASSERTION', attribution: 'Unknown', evidence: [] } };
  ledger.saveScan({ ...scan, candidates: [unclear] });
  catalog.put('components', component, 'create');
  assert.throws(() => ledger.decide(decision), /reference-only/);
  assert.equal(ledger.decide({ sourceKey: key, scanRevision: 1, path: upstreamPath, revision: 1,
    decision: 'reference-only', reason: 'License scope unavailable.' }).decision, 'reference-only');
  const supportPath = 'dependencies/checks.md';
  ledger.saveScan({ ...scan, revision: 2, files: [...scan.files, { ...indexed, path: supportPath }],
    candidates: [{ ...scan.candidates[0], links: [{ path: supportPath, reason: 'Linked requirements' }] }] });
  assert.throws(() => ledger.decide({ ...decision, revision: 2, scanRevision: 2 }), /missing inspected evidence/);
});
