import path from 'node:path';

export const kinds = ['cases', 'rubrics', 'components'];
export const componentKinds = ['prompt', 'skill', 'instructions', 'agent', 'mcp', 'tool-config', 'harness'];
export const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_TOTAL_BYTES = 20 * MAX_FILE_BYTES;

export function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

export function object(value, label) {
  ensure(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
}

export function text(value, label) {
  ensure(typeof value === 'string' && value.trim().length > 0, `${label} must be a nonempty string`);
}

function keys(value, allowed, label) {
  object(value, label);
  for (const key of Object.keys(value)) ensure(allowed.includes(key), `${label}: unknown field ${key}`);
}

function id(value, label) {
  ensure(typeof value === 'string' && identifier.test(value), `${label} must be a kebab-case identifier`);
}

function integer(value, label, min = 1, max = Number.MAX_SAFE_INTEGER) {
  ensure(Number.isSafeInteger(value) && value >= min && value <= max, `${label} must be an integer from ${min} to ${max}`);
}

export function relativePath(value) {
  text(value, 'path');
  ensure(!path.posix.isAbsolute(value) && !value.includes('\\') && !value.includes(':') &&
    !/[\u0000-\u001f]/.test(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..' && part !== '.git'),
  `unsafe relative path: ${value}`);
  return value;
}

function files(value) {
  object(value, 'files');
  let bytes = 0;
  for (const [file, content] of Object.entries(value)) {
    relativePath(file);
    ensure(typeof content === 'string', `files.${file} must be a UTF-8 string`);
    const size = Buffer.byteLength(content);
    ensure(size <= MAX_FILE_BYTES, `file too large: ${file}`);
    bytes += size;
  }
  ensure(bytes <= MAX_TOTAL_BYTES, 'files exceed total size limit');
}

function reference(value) {
  keys(value, ['id', 'version'], 'reference');
  id(value.id, 'reference.id');
  integer(value.version, 'reference.version');
}

function unique(values, label) {
  ensure(new Set(values).size === values.length, `duplicate ${label}`);
}

export function validate(kind, value, { tombstone = false } = {}) {
  ensure(kinds.includes(kind), `unknown catalog kind: ${kind}`);
  object(value, kind);
  ensure(value.schemaVersion === 1, 'schemaVersion must be 1');
  id(value.id, 'id');
  integer(value.version, 'version');
  if (tombstone && value.deleted === true) {
    keys(value, ['schemaVersion', 'id', 'version', 'deleted'], 'tombstone');
    return value;
  }
  const common = ['schemaVersion', 'id', 'version', 'title'];
  text(value.title, 'title');
  if (kind === 'components') {
    keys(value, [...common, 'kind', 'prompt', 'files', 'runtime'], kind);
    ensure(componentKinds.includes(value.kind), `unknown component kind: ${value.kind}`);
    files(value.files);
    ensure(typeof value.prompt === 'string', 'prompt must be a string (empty is allowed for file-only components)');
    ensure(value.prompt.trim() || Object.keys(value.files).length || (value.runtime && Object.keys(value.runtime).length),
      'component must provide a prompt, files, or runtime settings');
    if (value.runtime !== undefined) {
      keys(value.runtime, ['agent', 'mcpConfig', 'disableBuiltinMcps', 'appSetup'], 'runtime');
      if (value.runtime.agent !== undefined) text(value.runtime.agent, 'runtime.agent');
      if (value.runtime.appSetup !== undefined) text(value.runtime.appSetup, 'runtime.appSetup');
      if (value.runtime.disableBuiltinMcps !== undefined) ensure(typeof value.runtime.disableBuiltinMcps === 'boolean', 'runtime.disableBuiltinMcps must be boolean');
      if (value.runtime.mcpConfig !== undefined) {
        relativePath(value.runtime.mcpConfig);
        ensure(Object.hasOwn(value.files, value.runtime.mcpConfig), 'runtime.mcpConfig must name a file supplied by this component');
        object(JSON.parse(value.files[value.runtime.mcpConfig]), 'MCP configuration');
      }
    }
  } else if (kind === 'rubrics') {
    keys(value, [...common, 'criteria', 'passScore'], kind);
    ensure(Array.isArray(value.criteria) && value.criteria.length > 0, 'criteria must be a nonempty array');
    for (const criterion of value.criteria) {
      keys(criterion, ['id', 'description', 'maxScore'], 'criterion');
      id(criterion.id, 'criterion.id');
      text(criterion.description, 'criterion.description');
      integer(criterion.maxScore, 'criterion.maxScore', 1, 1000);
    }
    unique(value.criteria.map(c => c.id), 'criterion id');
    integer(value.passScore, 'passScore', 0, value.criteria.reduce((sum, c) => sum + c.maxScore, 0));
  } else {
    keys(value, [...common, 'task', 'files', 'variants', 'rubric', 'checks'], kind);
    text(value.task, 'task');
    files(value.files);
    reference(value.rubric);
    ensure(Array.isArray(value.variants) && value.variants.length > 0, 'variants must be a nonempty array');
    for (const variant of value.variants) {
      keys(variant, ['name', 'components'], 'variant');
      id(variant.name, 'variant.name');
      ensure(Array.isArray(variant.components), 'variant.components must be an array');
      variant.components.forEach(reference);
      unique(variant.components.map(c => c.id), 'component id in variant');
    }
    unique(value.variants.map(v => v.name), 'variant name');
    ensure(Array.isArray(value.checks), 'checks must be an array');
    for (const check of value.checks) {
      id(check.id, 'check.id');
      if (check.type === 'command') {
        keys(check, ['id', 'type', 'argv', 'timeoutMs'], 'check');
        ensure(Array.isArray(check.argv) && check.argv.length > 0, 'command argv must be a nonempty array');
        check.argv.forEach(arg => ensure(typeof arg === 'string' && !arg.includes('\0'), 'argv entries must be strings without NUL'));
        text(check.argv[0], 'command executable');
        integer(check.timeoutMs, 'timeoutMs', 1, 60000);
      } else {
        ensure(['file-exists', 'file-contains', 'file-unchanged'].includes(check.type), `unknown check type: ${check.type}`);
        keys(check, ['id', 'type', 'path', ...(check.type === 'file-contains' ? ['text'] : [])], 'check');
        relativePath(check.path);
        if (check.type === 'file-contains') text(check.text, 'check.text');
      }
    }
    unique(value.checks.map(c => c.id), 'check id');
  }
  return value;
}

export function validateReceipt(receipt) {
  keys(receipt, ['schemaVersion', 'sessionId', 'runner', 'model', 'actualModel', 'environment',
    'configurationAudit', 'permissions', 'isolation', 'outcome'], 'receipt');
  ensure(receipt.schemaVersion === 1, 'receipt.schemaVersion must be 1');
  for (const field of ['sessionId', 'model', 'actualModel', 'environment', 'configurationAudit']) {
    text(receipt[field], `receipt.${field}`);
    ensure(!/^<.*>$/.test(receipt[field]), `receipt.${field} still contains a placeholder`);
  }
  ensure(receipt.sessionId !== 'unknown', 'receipt.sessionId must identify the actual session');
  ensure(['app', 'headless', 'manual'].includes(receipt.runner), 'receipt.runner must be app, headless, or manual');
  if (receipt.runner !== 'headless' || receipt.outcome !== undefined) {
    ensure(['completed', 'failed', 'unknown'].includes(receipt.outcome), 'app/manual receipt.outcome must be completed, failed, or unknown');
  }
  ensure(receipt.isolation === 'workspace-only', 'receipt.isolation must explicitly acknowledge workspace-only isolation');
  ensure(Array.isArray(receipt.permissions) && receipt.permissions.every(p => typeof p === 'string'), 'receipt.permissions must be a string array');
  return receipt;
}

export function validateVerdict(verdict, manifest, evidence, evidenceSha256) {
  keys(verdict, ['schemaVersion', 'runId', 'manifestSha256', 'evidenceSha256', 'judge', 'scores'], 'verdict');
  ensure(verdict.schemaVersion === 1 && verdict.runId === manifest.runId, 'verdict identifies the wrong run');
  ensure(verdict.manifestSha256 === evidence.manifestSha256 && verdict.evidenceSha256 === evidenceSha256,
    'verdict must bind to the frozen manifest and collected evidence hashes');
  validateReceipt(verdict.judge);
  ensure(verdict.judge.sessionId !== evidence.receipt.sessionId, 'judge must use an independent session');
  ensure(verdict.judge.runner === 'headless' || verdict.judge.outcome === 'completed', 'judge session must have completed successfully');
  ensure(Array.isArray(verdict.scores), 'verdict.scores must be an array');
  const criteria = manifest.rubric.value.criteria;
  ensure(verdict.scores.length === criteria.length, 'verdict must score every criterion exactly once');
  unique(verdict.scores.map(s => s.criterionId), 'score criterion');
  const refs = new Set([...evidence.files.map(f => `workspace/${f.path}`), ...evidence.checks.map(c => `checks/${c.id}`)]);
  for (const score of verdict.scores) {
    keys(score, ['criterionId', 'score', 'rationale', 'evidence'], 'score');
    const criterion = criteria.find(c => c.id === score.criterionId);
    ensure(criterion, `unknown criterion: ${score.criterionId}`);
    ensure(typeof score.score === 'number' && Number.isFinite(score.score) && score.score >= 0 &&
      score.score <= criterion.maxScore, `score out of range: ${score.criterionId}`);
    text(score.rationale, 'score.rationale');
    ensure(Array.isArray(score.evidence) && score.evidence.length > 0 &&
      score.evidence.every(ref => refs.has(ref)), 'score must cite collected workspace/<path> or checks/<id> evidence');
  }
  return verdict;
}
