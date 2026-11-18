import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Catalog, readJSON, hash, writeJSON } from './store.mjs';
import { inspectAppEvents } from './observations.mjs';
import { validate } from './schema.mjs';
import { prepare, registerApp, collect, judgePacket, grade, report, executeHeadless, executeJudgeHeadless, archive, publicTranscript } from './lifecycle.mjs';

const source = path.dirname(fileURLToPath(import.meta.url));

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'lab');
  const workspaceRoot = path.join(temp, 'trials');
  fs.mkdirSync(path.join(root, 'bench'), { recursive: true });
  fs.mkdirSync(workspaceRoot);
  for (const record of ['cases/incident-summary', 'rubrics/incident-summary', 'components/brief-prompt', 'components/evidence-prompt']) {
    fs.cpSync(path.join(source, 'catalog', record), path.join(root, 'bench/catalog', record), { recursive: true });
  }
  return { root, workspaceRoot, catalog: new Catalog(root) };
}

const receipt = (sessionId = randomUUID()) => ({
  schemaVersion: 1, sessionId, runner: 'manual', model: 'auto', actualModel: 'test-fixture',
  environment: 'node:test synthetic fixture; not a model benchmark',
  configurationAudit: 'No agent executed; explicitly synthetic test evidence', permissions: [], isolation: 'workspace-only', outcome: 'completed',
});

function prepared(t, variant = 'baseline') {
  const context = fixture(t);
  return { ...context, trial: prepare(context.root, 'incident-summary', { variant, workspaceRoot: context.workspaceRoot }) };
}

function completed(t, answer = '120 requests failed over 14 minutes. Root cause and data loss are unknown. Investigate deployment D42.') {
  const context = prepared(t);
  fs.writeFileSync(path.join(context.trial.workspace, 'answer.md'), answer);
  const metadata = receipt();
  const collected = collect(context.root, context.trial.runId, metadata);
  const judge = judgePacket(context.root, context.trial.runId);
  const verdict = readJSON(path.join(judge.workspace, 'verdict-template.json'));
  verdict.judge = receipt();
  verdict.scores = verdict.scores.map((s, i) => ({
    ...s, score: [4, 4, 2][i], rationale: 'Synthetic unit-test verdict.', evidence: ['workspace/answer.md'],
  }));
  return { ...context, collected, judge, verdict };
}

function fakeCopilot(t, root) {
  const bin = path.join(root, 'fake-bin');
  fs.mkdirSync(bin);
  const script = `#!${process.execPath}
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('fixture-copilot'); process.exit(0); }
if (fs.existsSync('packet.json')) {
  const verdict = JSON.parse(fs.readFileSync('verdict-template.json', 'utf8'));
  verdict.scores = verdict.scores.map((s, i) => ({...s, score: [4,4,2][i], rationale: 'Synthetic fake CLI evidence.', evidence: ['workspace/answer.md']}));
  fs.writeFileSync('verdict.json', JSON.stringify(verdict));
} else {
  fs.writeFileSync('answer.md', '120 requests failed over 14 minutes; cause and data loss unknown. Inspect logs.');
}
console.log(JSON.stringify({args: process.argv.slice(2)}));
if (process.env.BENCH_TEST_RUNNER_FAIL === 'yes') process.exit(7);
`;
  fs.writeFileSync(path.join(bin, 'copilot'), script, { mode: 0o755 });
  const original = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${original}`;
  t.after(() => { process.env.PATH = original; delete process.env.BENCH_TEST_RUNNER_FAIL; });
}

test('catalog CRUD appends revisions, rejects stale writes, and retains pinned history after deletion', t => {
  const { catalog } = fixture(t);
  const first = { ...catalog.read('components', 'brief-prompt'), id: 'temporary-prompt' };
  catalog.put('components', first, 'create');
  assert.throws(() => catalog.put('components', first, 'create'), /new id/);
  const next = { ...first, version: 2, prompt: 'Revised prompt.' };
  catalog.put('components', next, 'update');
  assert.equal(catalog.read('components', first.id).prompt, next.prompt);
  assert.equal(catalog.read('components', first.id, 1).prompt, first.prompt);
  assert.throws(() => catalog.put('components', next, 'update'), /next version/);
  assert.throws(() => catalog.delete('components', first.id, 1), /stale delete/);
  catalog.delete('components', first.id, 2);
  assert.throws(() => catalog.read('components', first.id), /deleted/);
  assert.equal(catalog.read('components', first.id, 1).id, first.id);
  assert.equal(catalog.list('components').some(c => c.id === first.id), false);
  assert.throws(() => catalog.put('components', { ...first, version: 4 }, 'update'), /deleted/);
  assert.equal(catalog.validateAll().valid, true);
});

test('all catalog schemas reject unknown fields, traversal, duplicates, and invalid rubric bounds', t => {
  const { catalog } = fixture(t);
  const component = catalog.read('components', 'brief-prompt');
  assert.throws(() => validate('components', { ...component, unexpected: true }), /unknown field/);
  for (const file of ['../leak', '/absolute', 'foo\\bar', '.git/config', 'a/../b', 'C:/x']) {
    assert.throws(() => validate('components', { ...component, files: { [file]: 'bad' } }), /unsafe/);
  }
  const rubric = catalog.read('rubrics', 'incident-summary');
  assert.throws(() => validate('rubrics', { ...rubric, passScore: 11 }), /passScore/);
  assert.throws(() => validate('rubrics', { ...rubric, criteria: [rubric.criteria[0], rubric.criteria[0]] }), /duplicate/);
  const testCase = catalog.read('cases', 'incident-summary');
  assert.throws(() => validate('cases', { ...testCase, variants: [testCase.variants[0], testCase.variants[0]] }), /duplicate/);
  assert.throws(() => catalog.read('components', '../outside'), /invalid/);
});

test('case writes validate pinned dependencies, input collisions, and runtime collisions', t => {
  const { catalog } = fixture(t);
  const value = catalog.read('cases', 'incident-summary');
  assert.throws(() => catalog.put('cases', { ...value, id: 'missing-rubric', rubric: { id: 'missing', version: 1 } }, 'create'), /not found/);
  catalog.put('components', { schemaVersion: 1, id: 'collision', version: 1, title: 'Collision',
    kind: 'instructions', prompt: '', files: { 'incident.txt': 'replaced' } }, 'create');
  assert.throws(() => catalog.put('cases', { ...value, id: 'colliding-case',
    variants: [{ name: 'one', components: [{ id: 'collision', version: 1 }] }] }, 'create'), /collision/);
  catalog.put('components', { schemaVersion: 1, id: 'ancestor', version: 1, title: 'Ancestor',
    kind: 'instructions', prompt: '', files: { 'incident.txt/child': 'bad' } }, 'create');
  assert.throws(() => catalog.put('cases', { ...value, id: 'ancestor-case',
    variants: [{ name: 'one', components: [{ id: 'ancestor', version: 1 }] }] }, 'create'), /directory collision/);
});

test('prepare isolates workspaces, pins exact variant content, and freezes records across edits', t => {
  const { root, workspaceRoot, catalog, trial } = prepared(t);
  const other = prepare(root, 'incident-summary', { variant: 'evidence-first', workspaceRoot });
  assert.notEqual(other.workspace, trial.workspace);
  assert.deepEqual(fs.readdirSync(trial.workspace), ['incident.txt']);
  const manifest = readJSON(trial.manifest);
  assert.equal(manifest.components[0].value.id, 'brief-prompt');
  assert.equal(manifest.case.sha256, hash(catalog.read('cases', 'incident-summary')));
  const updated = { ...catalog.read('components', 'brief-prompt'), version: 2, prompt: 'New prompt' };
  catalog.put('components', updated, 'update');
  assert.notEqual(manifest.components[0].value.prompt, updated.prompt);
  assert.notEqual(fs.readFileSync(trial.promptFile, 'utf8'), fs.readFileSync(other.promptFile, 'utf8'));
  assert.throws(() => prepare(root, 'incident-summary', { variant: 'baseline', workspaceRoot: root }), /outside/);
  assert.throws(() => prepare(root, 'incident-summary', { variant: 'unknown', workspaceRoot }), /unknown variant/);
});

test('prepare rejects inherited repository/instruction configuration', t => {
  const { root, workspaceRoot } = fixture(t);
  fs.writeFileSync(path.join(workspaceRoot, 'AGENTS.md'), 'contaminating instructions');
  assert.throws(() => prepare(root, 'incident-summary', { variant: 'baseline', workspaceRoot }), /inherits configuration/);
});

test('file-backed skills, agents, MCP config, and app setup remain part of the treatment', t => {
  const { root, workspaceRoot, catalog } = fixture(t);
  const component = {
    schemaVersion: 1, id: 'custom-harness', version: 1, title: 'Harness', kind: 'harness', prompt: '',
    files: { '.github/skills/review/SKILL.md': '# Review', '.github/agents/reviewer.agent.md': '# Reviewer',
      'mcp.json': '{"mcpServers":{}}', '.github/copilot-instructions.md': 'Use evidence.' },
    runtime: { agent: 'reviewer', mcpConfig: 'mcp.json', disableBuiltinMcps: true, appSetup: 'Disable personal extensions.' },
  };
  catalog.put('components', component, 'create');
  const value = catalog.read('cases', 'incident-summary');
  catalog.put('cases', { ...value, id: 'custom-harness-case',
    variants: [{ name: 'custom', components: [{ id: component.id, version: 1 }] }] }, 'create');
  const trial = prepare(root, 'custom-harness-case', { variant: 'custom', workspaceRoot });
  assert.equal(readJSON(trial.manifest).runtime.agent, 'reviewer');
  assert.equal(fs.readFileSync(path.join(trial.workspace, '.github/skills/review/SKILL.md'), 'utf8'), '# Review');
  assert.throws(() => executeHeadless(root, trial.runId, { environment: 'fixture', configurationAudit: 'fixture' }), /app-specific/);
});

test('collection captures actual artifacts; a fabricated success summary cannot make checks pass', t => {
  const { root, trial } = prepared(t);
  fs.writeFileSync(path.join(trial.workspace, '.bench-result.json'), '{"summary":"Everything passed!"}');
  const result = collect(root, trial.runId, receipt());
  assert.equal(result.deterministicPassed, false);
  const evidence = readJSON(result.evidence);
  assert.equal(evidence.checks.find(c => c.id === 'answer-present').passed, false);
  assert.equal(evidence.checks.find(c => c.id === 'source-preserved').passed, true);
  assert.throws(() => collect(root, trial.runId, receipt()), /already frozen/);
});

test('collection rejects symlinks rather than reading outside a trial', t => {
  const { root, trial } = prepared(t);
  fs.symlinkSync(path.join(root, 'bench/catalog'), path.join(trial.workspace, 'outside'));
  assert.throws(() => collect(root, trial.runId, receipt()), /symlink/);
});

test('manifest tampering and prelaunch input changes are detected without launching an agent', t => {
  const context = prepared(t);
  fs.writeFileSync(path.join(context.trial.workspace, 'incident.txt'), 'changed');
  assert.throws(() => executeHeadless(context.root, context.trial.runId,
    { environment: 'test', configurationAudit: 'test' }), /input changed/);
  const manifest = readJSON(context.trial.manifest);
  manifest.variant = 'tampered';
  fs.writeFileSync(context.trial.manifest, JSON.stringify(manifest));
  assert.throws(() => collect(context.root, context.trial.runId, receipt()), /integrity failure/);
});

test('command checks require explicit approval, run without a shell, and capture failures', t => {
  const { root, workspaceRoot, catalog } = fixture(t);
  const original = catalog.read('cases', 'incident-summary');
  catalog.put('cases', { ...original, id: 'command-case', checks: [
    { id: 'argv-literal', type: 'command', argv: [process.execPath, '-e',
      'process.stdout.write(process.argv[1])', 'literal; exit 99'], timeoutMs: 1000 },
    { id: 'fails', type: 'command', argv: [process.execPath, '-e', 'process.exit(3)'], timeoutMs: 1000 },
  ] }, 'create');
  const trial = prepare(root, 'command-case', { variant: 'baseline', workspaceRoot });
  assert.throws(() => collect(root, trial.runId, receipt()), /allow-commands/);
  const result = collect(root, trial.runId, receipt(), { allowCommands: true });
  const evidence = readJSON(result.evidence);
  assert.equal(evidence.checks[0].stdout, 'literal; exit 99');
  assert.equal(evidence.checks[0].passed, true);
  assert.equal(evidence.checks[1].exitCode, 3);
  assert.equal(result.deterministicPassed, false);
});

test('judge packet is inert, excludes treatment prompts, and binds grading to independent evidence', t => {
  const { root, trial, verdict, judge } = completed(t);
  assert.deepEqual(fs.readdirSync(judge.workspace).sort(), ['judge-prompt.txt', 'packet.json', 'verdict-template.json']);
  const packet = readJSON(path.join(judge.workspace, 'packet.json'));
  assert.equal(Object.hasOwn(packet, 'components'), false);
  assert.deepEqual(readJSON(path.join(root, 'bench/runs', trial.runId, 'judge-input.json')), packet);
  const result = grade(root, trial.runId, verdict);
  assert.equal(result.score, 10);
  assert.equal(result.passed, true);
  assert.deepEqual(readJSON(path.join(root, 'bench/runs', trial.runId, 'verdict.json')), verdict);
  assert.throws(() => grade(root, trial.runId, verdict), /EEXIST/);
  assert.equal(report(root).runs[0].status, 'graded');
});

test('judges do not receive unchanged installed harness configuration but can see subject edits', t => {
  const { root, workspaceRoot, catalog } = fixture(t);
  catalog.put('components', { schemaVersion: 1, id: 'blind-guidance', version: 1, title: 'Synthetic blinding fixture',
    kind: 'instructions', prompt: 'Synthetic treatment prompt', files: {
      '.github/copilot-instructions.md': 'Do not reveal this treatment configuration to the judge.',
      '.github/skills/probe/SKILL.md': 'Original synthetic skill.',
    } }, 'create');
  const original = catalog.read('cases', 'incident-summary');
  catalog.put('cases', { ...original, id: 'blinding-case',
    variants: [{ name: 'configured', components: [{ id: 'blind-guidance', version: 1 }] }] }, 'create');
  const trial = prepare(root, 'blinding-case', { variant: 'configured', workspaceRoot });
  fs.writeFileSync(path.join(trial.workspace, '.github/skills/probe/SKILL.md'), 'Subject changed this configuration.');
  const collected = collect(root, trial.runId, receipt());
  const judge = judgePacket(root, trial.runId);
  const packet = readJSON(path.join(judge.workspace, 'packet.json'));
  assert.ok(readJSON(collected.evidence).files.some(file => file.path === '.github/copilot-instructions.md'), 'retain complete audit evidence');
  assert.equal(packet.files.some(file => file.path === 'workspace/.github/copilot-instructions.md'), false);
  assert.ok(packet.files.some(file => file.path === 'workspace/.github/skills/probe/SKILL.md'));
  assert.equal(JSON.stringify(packet).includes('Synthetic treatment prompt'), false);
  assert.equal(fs.existsSync(path.join(judge.workspace, '.github')), false);
});

test('grading rejects self-judging, stale evidence, missing criteria, bad ranges, and invented citations', t => {
  const { root, trial, verdict, collected } = completed(t);
  const self = structuredClone(verdict);
  self.judge.sessionId = readJSON(collected.evidence).receipt.sessionId;
  assert.throws(() => grade(root, trial.runId, self), /independent session/);
  assert.throws(() => grade(root, trial.runId, { ...verdict, evidenceSha256: 'wrong' }), /hashes/);
  assert.throws(() => grade(root, trial.runId, { ...verdict, scores: verdict.scores.slice(1) }), /every criterion/);
  const bad = structuredClone(verdict);
  bad.scores[0].score = 999;
  assert.throws(() => grade(root, trial.runId, bad), /out of range/);
  bad.scores[0].score = 4;
  bad.scores[0].evidence = ['workspace/imaginary.md'];
  assert.throws(() => grade(root, trial.runId, bad), /cite collected/);
});

test('deterministic failures gate a full-score verdict and reports do not count pending as passes', t => {
  const { root, trial, verdict } = completed(t, 'A vague summary without the impact number.');
  const result = grade(root, trial.runId, verdict);
  assert.equal(result.score, 10);
  assert.equal(result.passed, false);
  const context = fixture(t);
  prepare(root, 'incident-summary', { variant: 'baseline', workspaceRoot: context.workspaceRoot });
  const summary = report(root);
  assert.equal(summary.runs.filter(r => r.status === 'prepared').length, 1);
  assert.equal(summary.groups[0].graded, 1);
  assert.equal(summary.groups[0].passRate, 0);
});

test('collect disallows reuse of a session across trials', t => {
  const { root, workspaceRoot, trial } = prepared(t);
  const same = receipt();
  collect(root, trial.runId, same);
  const other = prepare(root, 'incident-summary', { variant: 'evidence-first', workspaceRoot });
  assert.throws(() => collect(root, other.runId, same), /already used/);
});

test('catalog directories and revision files cannot be symlinks', t => {
  const { root, catalog } = fixture(t);
  const original = path.join(root, 'bench/catalog/components/brief-prompt/1.json');
  const outside = path.join(root, 'outside.json');
  fs.renameSync(original, outside);
  fs.symlinkSync(outside, original);
  assert.throws(() => catalog.read('components', 'brief-prompt'), /symlink/);
  assert.throws(() => catalog.list('components'), /symlink/);
  assert.throws(() => catalog.validateAll(), /symlink/);
});

test('archive preserves a versionable result without raw prompts, credentials, paths, or judge prose', t => {
  const { root, trial, verdict } = completed(t);
  grade(root, trial.runId, verdict);
  const archived = archive(root, trial.runId);
  assert.equal(archived.record.score, 10);
  assert.equal(readJSON(archived.file).evidenceSha256, verdict.evidenceSha256);
  const serialized = fs.readFileSync(archived.file, 'utf8');
  assert.equal(serialized.includes(trial.workspace), false);
  assert.equal(serialized.includes('Synthetic unit-test verdict'), false);
  assert.equal(serialized.includes('environment'), false);
  assert.throws(() => archive(root, trial.runId), /EEXIST/);
});

test('report rejects edited aggregate scores rather than displaying fabricated success', t => {
  const { root, trial, verdict } = completed(t);
  grade(root, trial.runId, verdict);
  const file = path.join(root, 'bench/runs', trial.runId, 'grade.json');
  const value = readJSON(file);
  value.score = 999;
  fs.writeFileSync(file, JSON.stringify(value));
  assert.throws(() => report(root), /stored grade/);
});

test('headless adapter launches independent subject and judge processes and records exact runtime flags', t => {
  const { root, workspaceRoot, catalog } = fixture(t);
  fakeCopilot(t, root);
  catalog.put('components', { schemaVersion: 1, id: 'mcp-agent', version: 1, title: 'Agent runtime',
    kind: 'agent', prompt: '', files: { 'mcp.json': '{"mcpServers":{}}' },
    runtime: { agent: 'tester', mcpConfig: 'mcp.json', disableBuiltinMcps: true } }, 'create');
  const original = catalog.read('cases', 'incident-summary');
  catalog.put('cases', { ...original, id: 'runtime-case',
    variants: [{ name: 'runtime', components: [{ id: 'mcp-agent', version: 1 }] }] }, 'create');
  const trial = prepare(root, 'runtime-case', { variant: 'runtime', workspaceRoot });
  const options = { environment: 'synthetic subprocess fixture', configurationAudit: 'fake executable; no model executed', permissions: ['write'] };
  const subject = executeHeadless(root, trial.runId, options);
  const launch = readJSON(path.join(root, 'bench/runs', trial.runId, 'launch.json'));
  assert.ok(launch.args.includes('--agent'));
  assert.ok(launch.args.includes('--additional-mcp-config'));
  assert.ok(launch.args.includes('@mcp.json'));
  assert.ok(launch.args.includes('--disable-builtin-mcps'));
  assert.ok(launch.args.includes('--allow-tool=write'));
  assert.throws(() => executeHeadless(root, trial.runId, options), /extra input files/);
  collect(root, trial.runId, readJSON(subject.receipt));
  judgePacket(root, trial.runId);
  const judge = executeJudgeHeadless(root, trial.runId, options);
  assert.notEqual(judge.sessionId, subject.sessionId);
  const judgeArgs = readJSON(path.join(root, 'bench/runs', trial.runId, 'judge-launch.json')).args;
  assert.equal(judgeArgs.includes('--agent'), false);
  assert.equal(judgeArgs.includes('--additional-mcp-config'), false);
  assert.equal(grade(root, trial.runId, readJSON(judge.verdict)).passed, true);
});

test('failed headless process remains a failed trial even with passing artifacts and rubric scores', t => {
  const { root, trial } = prepared(t);
  fakeCopilot(t, root);
  process.env.BENCH_TEST_RUNNER_FAIL = 'yes';
  const options = { environment: 'synthetic fixture', configurationAudit: 'fake runner exits nonzero', permissions: ['write'] };
  assert.throws(() => executeHeadless(root, trial.runId, options), /runner failed/);
  delete process.env.BENCH_TEST_RUNNER_FAIL;
  const directory = path.join(root, 'bench/runs', trial.runId);
  const result = collect(root, trial.runId, readJSON(path.join(directory, 'receipt.json')));
  assert.equal(result.deterministicPassed, true);
  assert.equal(result.runnerSucceeded, false);
  judgePacket(root, trial.runId);
  const judge = executeJudgeHeadless(root, trial.runId, options);
  const graded = grade(root, trial.runId, readJSON(judge.verdict));
  assert.equal(graded.score, 10);
  assert.equal(graded.passed, false);
});

test('grading rejects provenance placeholders from the generated verdict template', t => {
  const { root, trial, verdict } = completed(t);
  verdict.judge.sessionId = '<coordinator supplies actual independent judge session id>';
  assert.throws(() => grade(root, trial.runId, verdict), /placeholder/);
});

test('unknown or failed imported execution cannot pass even with full scores', t => {
  const { root, trial } = prepared(t);
  fs.writeFileSync(path.join(trial.workspace, 'answer.md'), '120 failed requests.');
  const metadata = { ...receipt(), runner: 'app', outcome: 'unknown' };
  assert.equal(collect(root, trial.runId, metadata).runnerSucceeded, null);
  const packet = judgePacket(root, trial.runId);
  const verdict = readJSON(path.join(packet.workspace, 'verdict-template.json'));
  verdict.judge = receipt();
  verdict.scores = verdict.scores.map((s, i) => ({ ...s, score: [4, 4, 2][i],
    rationale: 'Synthetic verdict', evidence: ['workspace/answer.md'] }));
  const result = grade(root, trial.runId, verdict);
  assert.equal(result.score, 10);
  assert.equal(result.runnerSucceeded, null);
  assert.equal(result.passed, false);
});

test('persisted transcripts retain public outputs but exclude internal instructions and reasoning', () => {
  const output = [
    { type: 'session.start', data: { sessionId: 'fixture', context: { cwd: '/fixture', internal: 'not public' } } },
    { type: 'instruction.update', data: { content: 'internal fixture' } },
    { type: 'assistant.reasoning', data: { content: 'hidden fixture' } },
    { type: 'assistant.message', data: { content: 'Public answer', reasoningText: 'hidden fixture', reasoningOpaque: 'opaque fixture' } },
    { type: 'assistant.message', data: { phase: 'analysis', content: 'hidden fixture' } },
    { type: 'tool.execution_complete', data: { toolCallId: 'one', success: true, result: { content: 'Observed result' } } },
  ].map(event => JSON.stringify(event)).join('\n');
  const trace = publicTranscript(output);
  assert.equal(trace.retainedEvents, 3);
  assert.equal(trace.omittedEvents, 3);
  assert.match(trace.transcript, /Public answer/);
  assert.match(trace.transcript, /Observed result/);
  assert.doesNotMatch(trace.transcript, /hidden fixture|internal fixture|opaque fixture|not public/);
  assert.throws(() => publicTranscript('not JSON'), /not valid JSONL/);
});

test('grading and reporting remain usable from retained repo artifacts after execution folder cleanup', t => {
  const { root, trial, verdict, judge } = completed(t);
  fs.rmSync(judge.workspace, { recursive: true });
  assert.equal(grade(root, trial.runId, verdict).passed, true);
  assert.equal(report(root).runs[0].score, 10);
  assert.equal(archive(root, trial.runId).record.passed, true);
});

test('real-source cases materialize exact pinned bytes and keep frozen evaluators outside the subject', t => {
  const { root, workspaceRoot, catalog } = fixture(t);
  const source = path.join(root, 'bench/source');
  fs.mkdirSync(source);
  const sourceText = 'export const original = 7;\n';
  fs.writeFileSync(path.join(source, 'module.mjs'), sourceText);
  const evaluator = 'import fs from "node:fs"; import path from "node:path"; if(!fs.readFileSync(path.join(process.argv[2],"upstream.mjs"),"utf8").includes("original")) process.exitCode=1;\n';
  fs.writeFileSync(path.join(source, 'evaluator.mjs'), evaluator);
  fs.writeFileSync(path.join(source, 'policy.json'), '{"runner":"app","budgetMinutes":15}\n');
  const original = catalog.read('cases', 'incident-summary');
  const value = { ...original, id: 'real-source-case',
    source: { repository: 'example/upstream', commit: 'a'.repeat(40),
      files: { 'upstream.mjs': { path: 'bench/source/module.mjs', sha256: hash(sourceText) } } },
    policy: { path: 'bench/source/policy.json', sha256: hash(fs.readFileSync(path.join(source, 'policy.json'))) },
    checks: [{ id: 'external-evaluator', type: 'evaluator', script: { path: 'bench/source/evaluator.mjs', sha256: hash(evaluator) }, timeoutMs: 1000 }],
  };
  catalog.put('cases', value, 'create');
  const trial = prepare(root, value.id, { variant: 'baseline', workspaceRoot });
  assert.equal(fs.readFileSync(path.join(trial.workspace, 'upstream.mjs'), 'utf8'), sourceText);
  assert.equal(fs.existsSync(path.join(trial.workspace, 'evaluator.mjs')), false);
  assert.equal(readJSON(trial.manifest).policy.value.budgetMinutes, 15);
  fs.writeFileSync(path.join(source, 'evaluator.mjs'), 'throw Error("changed after prepare");');
  assert.throws(() => collect(root, trial.runId, receipt()), /allow-commands/);
  const result = collect(root, trial.runId, receipt(), { allowCommands: true });
  assert.equal(result.deterministicPassed, true, 'uses frozen evaluator, not mutable original');
  fs.writeFileSync(path.join(source, 'module.mjs'), 'changed');
  assert.throws(() => prepare(root, value.id, { variant: 'baseline', workspaceRoot }), /hash mismatch/);
});

test('source references reject traversal, symlinks, collisions and mismatched hashes', t => {
  const { root, catalog } = fixture(t);
  const directory = path.join(root, 'bench/source');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'module.mjs'), 'source');
  const original = catalog.read('cases', 'incident-summary');
  const value = { ...original, id: 'source-error',
    source: { repository: 'example/upstream', commit: 'b'.repeat(40),
      files: { 'upstream.mjs': { path: 'bench/source/module.mjs', sha256: hash('wrong') } } } };
  assert.throws(() => catalog.put('cases', value, 'create'), /hash mismatch/);
  value.source.files['upstream.mjs'].sha256 = hash('source');
  value.files['upstream.mjs'] = 'collides';
  assert.throws(() => catalog.put('cases', value, 'create'), /collision/);
  delete value.files['upstream.mjs'];
  value.source.files['upstream.mjs'].path = '../outside';
  assert.throws(() => catalog.put('cases', value, 'create'), /unsafe/);
  value.source.files['upstream.mjs'].path = 'bench/source/link.mjs';
  fs.symlinkSync(path.join(directory, 'module.mjs'), path.join(directory, 'link.mjs'));
  assert.throws(() => catalog.put('cases', value, 'create'), /symlink/);
});

test('observable receipt metrics survive reporting without fabricated token defaults', t => {
  const { root, trial } = prepared(t);
  const metadata = { ...receipt(), metrics: { wallMs: 1234, inputTokens: null, outputTokens: null,
    totalTokens: null, observedFrom: 'fixture clock; tokens unavailable' } };
  collect(root, trial.runId, metadata);
  assert.deepEqual(report(root).runs[0].metrics, metadata.metrics);
  assert.equal(report(root).runs[0].passed, null);
});

test('app telemetry validates exact cwd/prompt and reports observable model, token counters and elapsed time', () => {
  const metadata = { sessionId: 'fresh-fixture', workspace: '/fixture/subject', prompt: 'frozen task' };
  const events = [
    { type: 'session.start', timestamp: '2026-01-01T00:00:00Z', data: {
      sessionId: metadata.sessionId, context: { cwd: metadata.workspace }, selectedModel: 'auto', copilotVersion: 'fixture' } },
    { type: 'user.message', data: { content: metadata.prompt } },
    { type: 'session.auto_mode_resolved', data: { chosenModel: 'fixture-model' } },
    { type: 'assistant.turn_end', timestamp: '2026-01-01T00:00:05Z' },
    { type: 'session.usage_checkpoint', data: { providerModelMetrics: [
      { metrics: { usage: { inputTokens: 100, outputTokens: 12 } } },
    ] } },
    { type: 'session.shutdown', timestamp: '2026-01-01T00:30:00Z' },
  ];
  const result = inspectAppEvents(events, metadata);
  assert.equal(result.metrics.wallMs, 5000);
  assert.equal(result.metrics.totalTokens, 112);
  assert.equal(result.actualModel, 'fixture-model');
  assert.equal(inspectAppEvents(events.filter(event => event.type !== 'session.usage_checkpoint'), metadata).metrics.totalTokens, null);
  assert.throws(() => inspectAppEvents(events, { ...metadata, workspace: '/wrong' }), /working directory/);
  assert.throws(() => inspectAppEvents(events, { ...metadata, prompt: 'changed' }), /kickoff/);
  assert.throws(() => inspectAppEvents([...events, { type: 'user.message', data: { content: 'extra instructions' } }], metadata), /extra or changed/);
});

test('registered app launches remain observable before collection and reject reused or mismatched sessions', t => {
  const { root, workspaceRoot, trial } = prepared(t);
  const metadata = { ...receipt(), runner: 'app', outcome: 'unknown' };
  const launch = { receipt: metadata, actualCwd: trial.workspace, startedAt: new Date().toISOString() };
  assert.throws(() => registerApp(root, trial.runId, { ...launch, actualCwd: '/wrong' }), /actual app cwd/);
  registerApp(root, trial.runId, launch);
  assert.equal(report(root).runs[0].status, 'launched');
  assert.throws(() => registerApp(root, trial.runId, launch), /app launch is already registered/);
  assert.throws(() => executeHeadless(root, trial.runId, { environment: 'fixture', configurationAudit: 'fixture' }),
    /trial is registered to an app session/);
  assert.throws(() => collect(root, trial.runId, { ...metadata, sessionId: 'different' }), /registered app session/);
  const other = prepare(root, 'incident-summary', { variant: 'evidence-first', workspaceRoot });
  assert.throws(() => registerApp(root, other.runId, { ...launch, actualCwd: other.workspace }), /already belongs/);
  const headless = prepare(root, 'incident-summary', { variant: 'evidence-first', workspaceRoot });
  writeJSON(path.join(root, 'bench/runs', headless.runId, 'launch.json'), { receipt: { sessionId: 'prior-runner' } });
  assert.throws(() => registerApp(root, headless.runId, { ...launch, receipt: { ...metadata, sessionId: 'fresh-session' },
    actualCwd: headless.workspace }), /another runner is already registered/);
  collect(root, trial.runId, { ...metadata, outcome: 'failed' });
  assert.equal(report(root).runs.find(run => run.runId === trial.runId).runnerSucceeded, false);
});

test('large-source judge packets stay bounded and expose inert source plus independent diffs', t => {
  const { root, workspaceRoot, catalog } = fixture(t);
  const original = catalog.read('cases', 'incident-summary');
  const bigSource = Array.from({ length: 2000 }, (_, i) => `const item${i} = ${i};`).join('\n');
  catalog.put('cases', { ...original, id: 'large-source', files: { ...original.files, 'large.mjs': bigSource } }, 'create');
  const trial = prepare(root, 'large-source', { variant: 'baseline', workspaceRoot });
  fs.writeFileSync(path.join(trial.workspace, 'large.mjs'), bigSource.replace('const item100 = 100;', 'const item100 = 101;'));
  fs.writeFileSync(path.join(trial.workspace, 'answer.md'), '120 requests.');
  collect(root, trial.runId, receipt());
  const judge = judgePacket(root, trial.runId);
  const packetPath = path.join(judge.workspace, 'packet.json');
  assert.ok(fs.statSync(packetPath).size < 12000, 'do not embed the entire large upstream source in packet JSON');
  const entry = readJSON(packetPath).files.find(file => file.path === 'workspace/large.mjs');
  assert.equal(entry.contentBase64, undefined);
  assert.match(fs.readFileSync(path.join(judge.workspace, entry.diffFile), 'utf8'), /-const item100 = 100;\n\+const item100 = 101;/);
  assert.equal(fs.readFileSync(path.join(judge.workspace, entry.contentFile), 'utf8'), fs.readFileSync(path.join(trial.workspace, 'large.mjs'), 'utf8'));
  const retained = path.join(root, 'bench/runs', trial.runId, 'judge-artifacts', path.basename(entry.diffFile));
  assert.ok(fs.existsSync(retained));
  assert.equal(fs.existsSync(path.join(judge.workspace, '.github')), false);
  const verdict = readJSON(path.join(judge.workspace, 'verdict-template.json'));
  verdict.judge = receipt();
  verdict.scores = verdict.scores.map(score => ({ ...score, rationale: 'Synthetic verdict', evidence: ['workspace/large.mjs'] }));
  const liveDiff = path.join(judge.workspace, entry.diffFile);
  const diffContent = fs.readFileSync(liveDiff, 'utf8');
  fs.unlinkSync(liveDiff);
  assert.throws(() => grade(root, trial.runId, verdict), /judge artifact is missing/);
  fs.writeFileSync(liveDiff, diffContent);
  fs.writeFileSync(path.join(judge.workspace, entry.diffFile), 'tampered');
  assert.throws(() => grade(root, trial.runId, verdict), /judge artifact was modified/);
});

test('CLI validates catalog, surfaces errors, and drives the lifecycle without dependencies', t => {
  const { root, workspaceRoot } = fixture(t);
  const invoke = (...args) => spawnSync(process.execPath, [path.join(source, 'cli.mjs'), '--root', root, ...args], { encoding: 'utf8' });
  assert.equal(invoke('validate').status, 0);
  const bad = invoke('catalog', 'read', 'cases', 'not-here');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /not found/);
  const prepared = invoke('prepare', 'incident-summary', '--variant', 'baseline', '--workspace-root', workspaceRoot);
  assert.equal(prepared.status, 0, prepared.stderr);
  const trial = JSON.parse(prepared.stdout);
  fs.writeFileSync(path.join(trial.workspace, 'answer.md'), '120 affected requests.');
  const receiptFile = path.join(root, 'receipt.json');
  writeJSON(receiptFile, receipt());
  assert.equal(invoke('collect', trial.runId, '--receipt', receiptFile).status, 0);
  const packetResult = invoke('judge-packet', trial.runId);
  assert.equal(packetResult.status, 0, packetResult.stderr);
  const judge = JSON.parse(packetResult.stdout);
  const verdict = readJSON(path.join(judge.workspace, 'verdict-template.json'));
  verdict.judge = receipt();
  verdict.scores = verdict.scores.map(s => ({ ...s, rationale: 'Synthetic smoke evidence', evidence: ['workspace/answer.md'] }));
  const verdictFile = path.join(root, 'verdict.json');
  writeJSON(verdictFile, verdict);
  const graded = invoke('grade', trial.runId, '--file', verdictFile);
  assert.equal(graded.status, 0, graded.stderr);
  const saved = JSON.parse(invoke('report').stdout);
  assert.equal(saved.runs[0].passed, false);
  assert.deepEqual(readJSON(saved.reportFile).runs, saved.runs);
});
