import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { hash, writeJSON } from '../../store.mjs';
import { ensure } from '../../schema.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = 'lodash/lodash';
const issueNumber = 6191;
const commit = '2b5e6f7399a7b48005140b5d5c6bc6c0e62919a8';
const destination = path.join(directory, 'sources', commit);

function api(endpoint, raw = false) {
  const result = spawnSync('gh', ['api', endpoint, ...(raw ? ['-H', 'Accept: application/vnd.github.raw+json'] : [])],
    { maxBuffer: 2 * 1024 * 1024 });
  ensure(!result.error && result.status === 0, `GitHub acquisition failed: ${result.error?.message ?? result.stderr}`);
  return raw ? result.stdout : JSON.parse(result.stdout.toString('utf8'));
}

ensure(!fs.existsSync(destination), 'source snapshot already exists; never overwrite a frozen acquisition');
const selectedAt = new Date().toISOString();
const issue = api(`repos/${repository}/issues/${issueNumber}`);
const repo = api(`repos/${repository}`);
ensure(issue.state === 'open' && !issue.pull_request, 'selected issue must still be an open issue');
fs.mkdirSync(destination, { recursive: true });
const files = [];
for (const name of ['lodash.js', 'LICENSE', 'package.json', 'README.md']) {
  const bytes = api(`repos/${repository}/contents/${name}?ref=${commit}`, true);
  fs.writeFileSync(path.join(destination, name), bytes, { flag: 'wx' });
  files.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
}
writeJSON(path.join(directory, 'issue-selection.json'), {
  schemaVersion: 1, campaignId: 'sdlc-20261118', selectedAt, repository, commit,
  issue: { number: issue.number, url: issue.html_url, title: issue.title, state: issue.state,
    createdAt: issue.created_at, updatedAt: issue.updated_at, body: issue.body },
  popularity: { stars: repo.stargazers_count, observedAt: selectedAt },
  files,
  selectionRationale: 'Popular project; open concrete sparse-array cloneDeep behavior; upstream lodash.js is runnable directly with Node built-ins and includes its license. Selection precedes all campaign subjects.',
  exposure: 'Issue body and its attached output image inspected. Historical PR referenced in body was not followed; no linked fix or solution inspected. Other rejected issue bodies were inspected only during candidate selection. None are trial inputs.',
  trialIssuePolicy: 'Supply the canonical issue URL, title, observed/expected behavior, and original reproduction only; omit historical PR link to avoid solution leakage.',
});
console.log(JSON.stringify({ destination, files }, null, 2));
