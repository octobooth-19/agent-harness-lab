import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, readJSON, readPinnedFile } from '../../store.mjs';
import { ensure } from '../../schema.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const freezeFile = path.join(directory, 'freeze.json');
const freeze = readJSON(freezeFile);
const policy = JSON.parse(readPinnedFile(path.resolve(directory, '../../..'), freeze.policy));
const arms = ['baseline', 'initial-harness'].map(arm => readJSON(path.join(directory, 'launches', `${arm}.json`)));
const workspaces = new Set();
const trials = [];
for (const record of freeze.cases) {
  const pair = arms.map(arm => {
    const trial = arm.trials.find(candidate => candidate.caseId === record.id);
    ensure(trial, `missing ${arm.arm} trial: ${record.id}`);
    const manifest = readJSON(trial.manifest);
    ensure(hash(manifest) === fs.readFileSync(path.join(path.dirname(trial.manifest), 'manifest.sha256'), 'utf8').trim(), 'manifest integrity failure');
    ensure(manifest.case.sha256 === record.caseSha256 && hash(manifest.case.value) === record.caseSha256, 'case differs from freeze');
    ensure(manifest.rubric.sha256 === record.rubricSha256 && hash(manifest.rubric.value) === record.rubricSha256, 'rubric differs from freeze');
    ensure(manifest.workspace === trial.workspace && manifest.runId === trial.runId && manifest.variant === arm.arm, 'launch routing mismatch');
    ensure(manifest.requestedModel === policy.requestedModel && hash(manifest.policy?.value) === hash(policy), 'policy/model differs from freeze');
    ensure(!['app-launch.json', 'launch.json', 'evidence.json'].some(file => fs.existsSync(path.join(path.dirname(trial.manifest), file))), 'trial already has launch or evidence records');
    ensure(!workspaces.has(trial.workspace), 'workspace reused');
    workspaces.add(trial.workspace);
    const prompt = fs.readFileSync(trial.promptFile);
    ensure(hash(prompt) === manifest.promptSha256, 'generated prompt changed');
    ensure(Object.keys(manifest.runtime).length === 0, 'unexpected additional runtime requirements');
    const expected = new Set(manifest.inputs.map(input => input.path));
    const walk = (folder, prefix = '') => {
      for (const name of fs.readdirSync(folder)) {
        const file = path.join(folder, name);
        const relative = `${prefix}${name}`;
        const stat = fs.lstatSync(file);
        ensure(!stat.isSymbolicLink(), 'prepared workspace contains a symlink');
        if (stat.isDirectory()) walk(file, `${relative}/`);
        else ensure(stat.isFile() && expected.has(relative), `unexpected subject file: ${relative}`);
      }
    };
    walk(trial.workspace);
    for (const input of manifest.inputs) {
      ensure(hash(fs.readFileSync(path.join(trial.workspace, input.path))) === input.sha256, `input changed: ${input.path}`);
    }
    if (arm.arm === 'baseline') {
      ensure(manifest.components.length === 0 && !manifest.profile, 'baseline is not zero-component');
      ensure(!fs.existsSync(path.join(trial.workspace, '.github')), 'baseline has native harness configuration');
    } else {
      ensure(manifest.profile?.sha256 === freeze.treatment.sha256 && hash(manifest.profile.value) === freeze.treatment.sha256 &&
        manifest.profile.value.target === 'app', 'wrong treatment profile');
      ensure(manifest.components.length === freeze.treatment.components.length, 'component count mismatch');
      manifest.components.forEach((component, index) => {
        ensure(component.sha256 === freeze.treatment.components[index].sha256 && hash(component.value) === component.sha256, 'component record differs from freeze');
        for (const [file, text] of Object.entries(component.value.files)) {
          ensure(hash(fs.readFileSync(path.join(trial.workspace, file))) === hash(text), `component bytes differ: ${file}`);
        }
      });
      ensure(expected.has('.github/copilot-instructions.md') &&
        [...expected].some(file => file.startsWith('.github/skills/') && file.endsWith('/SKILL.md')), 'native instruction/skill entries missing');
    }
    trials.push({ arm: arm.arm, caseId: record.id, runId: trial.runId, workspace: trial.workspace,
      manifest: trial.manifest, promptFile: trial.promptFile, manifestSha256: hash(manifest),
      inputBytesVerified: true, enabledComponents: manifest.components.length, extraSubjectFiles: 0 });
    return { manifest, prompt };
  });
  ensure(pair[0].prompt.equals(pair[1].prompt), 'arm kickoff prompts differ');
  ensure(hash(pair[0].manifest.policy) === hash(pair[1].manifest.policy), 'arm policies differ');
  for (const input of pair[0].manifest.inputs) {
    ensure(pair[1].manifest.inputs.some(other => other.path === input.path && other.sha256 === input.sha256), 'common arm inputs differ');
  }
}
ensure(trials.length === freeze.cases.length * 2, 'missing paired trials');
console.log(JSON.stringify({ schemaVersion: 1, campaignId: freeze.campaignId,
  freezeSha256: hash(fs.readFileSync(freezeFile)), verifiedAt: new Date().toISOString(),
  independentWorkspaces: workspaces.size, identicalArmPrompts: true, matchedCommonInputs: true,
  actualAppLoadingVerified: false, recordedSubjectLaunches: 0,
  limitation: 'Verified exact native configuration materialization only. The coordinator must verify actual app cwd, loading, inherited configuration and provenance at launch.',
  trials }, null, 2));
