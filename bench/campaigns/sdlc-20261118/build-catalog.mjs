import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Catalog, readJSON, hash, writeJSON } from '../../store.mjs';
import { ensure } from '../../schema.mjs';
import { commonConstraints, definitions } from './cases.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');
const catalog = new Catalog(root);
const { values } = parseArgs({ options: { profile: { type: 'string' }, version: { type: 'string' } } });
ensure(values.profile && values.version, 'supply a finalized --profile ID --version N before freezing any arm');
const treatment = catalog.profileVariant(values.profile, Number(values.version), 'initial-harness');
ensure(treatment.components.length > 0, 'treatment profile must have enabled components');
const selection = readJSON(path.join(directory, 'issue-selection.json'));
const reproduction = readJSON(path.join(directory, 'pre-fix-reproduction.json'));
ensure(reproduction.reproduced && reproduction.noFixApplied, 'a verified pre-fix failure is required');
const preFixEvaluator = readJSON(path.join(directory, 'pre-fix-evaluator.json'));
ensure(preFixEvaluator.validReproduction && preFixEvaluator.noFixApplied && preFixEvaluator.status === 1,
  'behavioral pre-fix evaluator evidence is required');
const pin = file => ({ path: path.relative(root, file).split(path.sep).join('/'), sha256: hash(fs.readFileSync(file)) });
const policy = pin(path.join(directory, 'policy.json'));
const records = [];
for (const definition of definitions) {
  const id = `sdlc-20261118-${definition.stage}`;
  const rubric = { schemaVersion: 1, id, version: 1, title: definition.title, passScore: 8, criteria: definition.criteria };
  catalog.put('rubrics', rubric, 'create');
  const checks = [
    { id: 'artifact-present', type: 'file-exists', path: definition.artifact },
    { id: 'handoff-present', type: 'file-exists', path: 'handoff.md' },
    { id: 'independent-behavior', type: 'evaluator', script: pin(path.join(directory, 'evaluators', `${definition.stage}.mjs`)), timeoutMs: 20000 },
  ];
  const protectedFiles = definition.stage === 'issue'
    ? ['ISSUE.md', 'reproduce.cjs', 'LICENSE', 'package.json', 'README.md']
    : Object.keys(definition.files).filter(file => !(['maintenance'].includes(definition.stage) && ['parse-log.mjs', 'CHANGELOG.md'].includes(file)));
  protectedFiles.forEach((file, index) => checks.push({ id: `input-preserved-${index + 1}`, type: 'file-unchanged', path: file }));
  const testCase = {
    schemaVersion: 1, id, version: 1, title: definition.title,
    task: `${definition.task}\n\n${commonConstraints}`,
    files: definition.files, variants: [{ name: 'baseline', components: [] }, treatment],
    rubric: { id, version: 1 }, checks, policy,
  };
  if (definition.stage === 'issue') {
    testCase.source = { repository: selection.repository, commit: selection.commit,
      files: Object.fromEntries(selection.files.map(file => [file.path, pin(path.join(directory, 'sources', selection.commit, file.path))])) };
  }
  catalog.put('cases', testCase, 'create');
  records.push({ id, version: 1, stage: definition.stage, partition: definition.stage === 'maintenance' ? 'held-out' : 'development',
    caseSha256: hash(testCase), rubricSha256: hash(rubric), evaluatorSha256: checks[2].script.sha256 });
}
const freeze = {
  schemaVersion: 1, campaignId: 'sdlc-20261118', frozenAt: new Date().toISOString(),
  labBaseCommit: '275669b', policy, selectionSha256: hash(selection), preFixReproductionSha256: hash(reproduction),
  preFixEvaluatorSha256: hash(preFixEvaluator),
  treatment: { id: values.profile, version: Number(values.version), sha256: hash(catalog.read('profiles', values.profile, Number(values.version))),
    components: treatment.components.map(ref => ({ ...ref, sha256: hash(catalog.read('components', ref.id, ref.version)) })) },
  cases: records,
  noSubjectOutputsObserved: true,
};
writeJSON(path.join(directory, 'freeze.json'), freeze);
console.log(JSON.stringify({ freeze: path.join(directory, 'freeze.json'), ...catalog.validateAll() }, null, 2));
