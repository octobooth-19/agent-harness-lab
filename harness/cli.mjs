#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ensure } from '../bench/schema.mjs';
import { readJSON } from '../bench/store.mjs';
import { Discovery } from './discovery.mjs';

const help = `Harness discovery ledger (see harness/README.md)
  batch create --file JSON
  batch status ID
  batch dispatch ID SOURCE_KEY --file JSON
  scan save --file JSON
  scan read SOURCE_KEY [--revision N]
  decision save --file JSON
Use --root ABS for another lab checkout. These commands do not call GitHub or launch sessions.`;

try {
  const { values, positionals: [kind, operation, id, key, ...extra] } = parseArgs({
    allowPositionals: true, options: { help: { type: 'boolean' }, root: { type: 'string' }, file: { type: 'string' }, revision: { type: 'string' } },
  });
  const data = () => {
    ensure(values.file, '--file is required');
    return readJSON(values.file);
  };
  if (!kind || values.help) console.log(help);
  else {
    ensure(!extra.length, 'unexpected extra arguments');
    const ledger = new Discovery(path.resolve(values.root ?? fileURLToPath(new URL('..', import.meta.url))));
    let result;
    if (kind === 'batch' && operation === 'create') result = ledger.batch(data());
    else if (kind === 'batch' && operation === 'status') result = ledger.status(id);
    else if (kind === 'batch' && operation === 'dispatch') result = ledger.dispatch(id, key, data());
    else if (kind === 'scan' && operation === 'save') result = ledger.saveScan(data());
    else if (kind === 'scan' && operation === 'read') result = ledger.scan(id, values.revision === undefined ? undefined : Number(values.revision));
    else if (kind === 'decision' && operation === 'save') result = ledger.decide(data());
    else throw new Error('unknown operation; see --help');
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(`harness: ${error.message}`);
  process.exitCode = 1;
}
