import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Catalog, readJSON, hash, writeJSON } from '../../store.mjs';
import { prepare } from '../../lifecycle.mjs';
import { ensure } from '../../schema.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');
const catalog = new Catalog(root);
const { values } = parseArgs({ options: { arm: { type: 'string' }, 'workspace-root': { type: 'string' } } });
ensure(['baseline', 'initial-harness'].includes(values.arm), '--arm must be baseline or initial-harness');
const freeze = readJSON(path.join(directory, 'freeze.json'));
const policy = readJSON(path.join(root, freeze.policy.path));
ensure(hash(fs.readFileSync(path.join(root, freeze.policy.path))) === freeze.policy.sha256, 'campaign policy changed');
ensure(hash(catalog.read('profiles', freeze.treatment.id, freeze.treatment.version)) === freeze.treatment.sha256, 'profile differs from frozen treatment');
for (const pin of freeze.treatment.components) ensure(hash(catalog.read('components', pin.id, pin.version)) === pin.sha256, `component differs from freeze: ${pin.id}`);
for (const record of freeze.cases) {
  ensure(hash(catalog.read('cases', record.id, record.version)) === record.caseSha256, `case differs from freeze: ${record.id}`);
  ensure(hash(catalog.read('rubrics', record.id, record.version)) === record.rubricSha256, `rubric differs from freeze: ${record.id}`);
}
const destination = path.join(directory, 'launches', `${values.arm}.json`);
ensure(!fs.existsSync(destination), 'arm already prepared; preserve launch identities rather than overwriting them');
const trials = freeze.cases.map(record => ({
  caseId: record.id, stage: record.stage, partition: record.partition,
  ...prepare(root, record.id, { version: record.version, variant: values.arm,
    workspaceRoot: values['workspace-root'], model: policy.requestedModel }),
}));
fs.mkdirSync(path.dirname(destination), { recursive: true });
const launch = { schemaVersion: 1, campaignId: freeze.campaignId, arm: values.arm, preparedAt: new Date().toISOString(),
  policyFile: path.join(root, freeze.policy.path), freezeFile: path.join(directory, 'freeze.json'), trials };
writeJSON(destination, launch);
console.log(JSON.stringify({ launchFile: destination, ...launch }, null, 2));
