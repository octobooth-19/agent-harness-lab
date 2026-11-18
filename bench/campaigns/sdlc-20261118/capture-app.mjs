import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readJSON, writeJSON, hash } from '../../store.mjs';
import { validateReceipt, ensure } from '../../schema.mjs';
import { inspectAppEvents } from '../../observations.mjs';
import { publicTranscript } from '../../lifecycle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  events: { type: 'string' }, receipt: { type: 'string' },
} });
const [runId] = positionals;
ensure(typeof runId === 'string' && /^[a-f0-9-]{36}$/.test(runId), 'provide a run UUID');
ensure(values.events && values.receipt, 'supply --events ABS_EVENTS_JSONL and --receipt COORDINATOR_RECEIPT_JSON');
const directory = path.join(root, 'bench/runs', runId);
ensure(!fs.existsSync(path.join(directory, 'evidence.json')), 'capture app provenance before freezing collection');
const manifest = readJSON(path.join(directory, 'manifest.json'));
ensure(hash(manifest) === fs.readFileSync(path.join(directory, 'manifest.sha256'), 'utf8').trim(), 'manifest integrity failure');
const receipt = validateReceipt(readJSON(values.receipt));
ensure(receipt.runner === 'app', 'this capture accepts only actual app-session receipts');
const prompt = fs.readFileSync(path.join(directory, 'trial-prompt.txt'), 'utf8');
ensure(hash(prompt) === manifest.promptSha256, 'prompt integrity failure');
const raw = fs.readFileSync(values.events, 'utf8');
const events = raw.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
const observations = inspectAppEvents(events, { sessionId: receipt.sessionId, workspace: manifest.workspace, prompt,
  components: manifest.components.map(component => component.value) });
const trace = publicTranscript(raw);
const enriched = validateReceipt({ ...receipt, actualModel: observations.actualModel, metrics: observations.metrics });
writeJSON(path.join(directory, 'app-observation.json'), observations);
writeJSON(path.join(directory, 'receipt-observed.json'), enriched);
fs.writeFileSync(path.join(directory, 'app-transcript.jsonl'), trace.transcript, { flag: 'wx' });
writeJSON(path.join(directory, 'app-trace-summary.json'), {
  retainedEvents: trace.retainedEvents, omittedEvents: trace.omittedEvents,
  policy: 'Public messages/tools and selected runtime metadata only; internal instructions, hidden reasoning and opaque payloads excluded.',
});
console.log(JSON.stringify({ runId, observations: path.join(directory, 'app-observation.json'),
  receipt: path.join(directory, 'receipt-observed.json'), metrics: observations.metrics,
  configurationEvidence: observations.configurationEvidence }, null, 2));
