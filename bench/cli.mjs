#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Catalog, readJSON } from './store.mjs';
import { ensure } from './schema.mjs';
import { prepare, executeHeadless, executeJudgeHeadless, collect, judgePacket, grade, saveReport, archive } from './lifecycle.mjs';

const help = `Agent Harness Lab (Node.js built-ins only)
  catalog list KIND
  catalog read KIND ID [--version N]
  catalog create|update KIND --file JSON
  catalog delete KIND ID --version EXPECTED
  validate
  prepare CASE --variant NAME --workspace-root ABS [--version N] [--model auto]
  headless RUN --environment TEXT --configuration-audit TEXT [--allow-tool RULE ...] [--timeout-ms N]
  collect RUN --receipt JSON [--allow-commands]
  judge-packet RUN
  judge-headless RUN --environment TEXT --configuration-audit TEXT [--allow-tool RULE ...] [--model auto] [--timeout-ms N]
  grade RUN --file VERDICT_JSON
  archive RUN
  report [CASE]
Kinds: cases, rubrics, components. Use --root ABS to select another lab checkout.
See bench/README.md and .github/skills/benchmark/SKILL.md for the app-native workflow.`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true, strict: true,
    options: {
      help: { type: 'boolean' }, root: { type: 'string' }, file: { type: 'string' },
      version: { type: 'string' }, variant: { type: 'string' }, 'workspace-root': { type: 'string' },
      model: { type: 'string' }, receipt: { type: 'string' }, 'allow-commands': { type: 'boolean' },
      environment: { type: 'string' }, 'configuration-audit': { type: 'string' },
      'allow-tool': { type: 'string', multiple: true }, 'timeout-ms': { type: 'string' },
    },
  });
  if (values.help || positionals.length === 0) console.log(help);
  else {
    const root = path.resolve(values.root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
    const catalog = new Catalog(root);
    const [command, first, second, third] = positionals;
    const version = values.version === undefined ? undefined : Number(values.version);
    if (version !== undefined) ensure(Number.isSafeInteger(version) && version > 0, '--version must be a positive integer');
    let result;
    if (command === 'catalog') {
      const kind = second;
      if (first === 'list') result = catalog.list(kind);
      else if (first === 'read') result = catalog.read(kind, third, version);
      else if (first === 'create' || first === 'update') {
        ensure(values.file, '--file is required');
        result = catalog.put(kind, readJSON(values.file), first);
      } else if (first === 'delete') {
        ensure(version !== undefined, 'delete requires --version to prevent stale deletion');
        result = catalog.delete(kind, third, version);
      } else throw new Error('unknown catalog operation');
    } else if (command === 'validate') result = catalog.validateAll();
    else if (command === 'prepare') result = prepare(root, first, { variant: values.variant,
      workspaceRoot: values['workspace-root'], version, model: values.model });
    else if (command === 'headless' || command === 'judge-headless') result = (command === 'headless' ? executeHeadless : executeJudgeHeadless)(root, first, { environment: values.environment,
      configurationAudit: values['configuration-audit'], permissions: values['allow-tool'],
      model: values.model,
      timeoutMs: values['timeout-ms'] === undefined ? undefined : Number(values['timeout-ms']) });
    else if (command === 'collect') {
      ensure(values.receipt, '--receipt is required');
      result = collect(root, first, readJSON(values.receipt), { allowCommands: values['allow-commands'] });
    } else if (command === 'judge-packet') result = judgePacket(root, first);
    else if (command === 'grade') {
      ensure(values.file, '--file is required');
      result = grade(root, first, readJSON(values.file));
    } else if (command === 'report') result = saveReport(root, first);
    else if (command === 'archive') result = archive(root, first);
    else throw new Error(`unknown command: ${command}`);
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(`bench: ${error.message}`);
  process.exitCode = 1;
}
