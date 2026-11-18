import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { componentKinds, ensure, identifier, MAX_TOTAL_BYTES, object, relativePath, text } from '../bench/schema.mjs';
import { Catalog, hash, readJSON, writeJSON } from '../bench/store.mjs';

const digest = /^[a-f0-9]{64}$/;
const sha = /^[a-f0-9]{40}$/;
const slug = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/;
const categories = [...componentKinds, 'context', 'memory', 'license', 'support'];
const decisionTypes = ['adopted', 'duplicate', 'reference-only', 'rejected'];
const copyingBases = ['permissive', 'permission-granted'];

function fields(value, allowed, label) {
  object(value, label);
  for (const key of Object.keys(value)) ensure(allowed.includes(key), `${label}: unexpected field ${key}`);
}

function integer(value, label, min = 1) {
  ensure(Number.isSafeInteger(value) && value >= min, `invalid ${label}`);
}

function array(value, label) {
  ensure(Array.isArray(value), `${label} must be an array`);
  return value;
}

function source(value) {
  fields(value, ['repo', 'commit'], 'source');
  ensure(typeof value.repo === 'string' && slug.test(value.repo) && !['.', '..'].includes(value.repo.split('/')[1]), 'expected GitHub owner/repo');
  ensure(typeof value.commit === 'string' && sha.test(value.commit), 'expected pinned 40-character lowercase commit SHA');
  return { repo: value.repo.toLowerCase(), commit: value.commit };
}

export const sourceKey = value => hash(source(value));

function evidencePath(map, file) {
  relativePath(file);
  ensure(map.get(file)?.status === 'inspected', `missing inspected evidence: ${file}`);
}

export function validateScan(value) {
  fields(value, ['schemaVersion', 'source', 'revision', 'scope', 'coverage', 'files', 'candidates'], 'scan');
  ensure(value.schemaVersion === 1, 'scan schemaVersion must be 1');
  source(value.source);
  integer(value.revision, 'scan revision');
  text(value.scope, 'scan scope');
  fields(value.coverage, ['tree', 'state', 'limits', 'next'], 'coverage');
  ensure(['complete', 'truncated', 'unavailable'].includes(value.coverage.tree), 'invalid tree coverage');
  ensure(['partial', 'complete'].includes(value.coverage.state), 'invalid inspection coverage');
  array(value.coverage.limits, 'coverage limits').forEach(item => text(item, 'coverage limit'));
  array(value.coverage.next, 'coverage next').forEach(item => text(item, 'continuation step'));
  if (value.coverage.state === 'complete') {
    ensure(value.coverage.tree === 'complete' && value.coverage.next.length === 0, 'completed scope cannot have incomplete tree or continuation work');
  } else {
    ensure(value.coverage.limits.length && value.coverage.next.length, 'partial coverage needs limits and continuation work');
  }
  const map = new Map();
  for (const file of array(value.files, 'files')) {
    fields(file, ['path', 'status', 'sha256', 'reason'], 'file evidence');
    relativePath(file.path);
    ensure(!map.has(file.path), `duplicate evidence path: ${file.path}`);
    ensure(['indexed', 'inspected', 'unavailable'].includes(file.status), 'invalid file evidence status');
    if (file.status === 'inspected') {
      ensure(typeof file.sha256 === 'string' && digest.test(file.sha256), 'inspected file requires SHA-256 of exact bytes');
    } else {
      ensure(file.sha256 === undefined, 'indexed/unavailable evidence must not claim a content hash');
      text(file.reason, 'uninspected-file reason');
    }
    map.set(file.path, file);
  }
  const seen = new Set();
  for (const item of array(value.candidates, 'candidates')) {
    fields(item, ['path', 'kind', 'purpose', 'requirements', 'license', 'compatibility', 'overlaps', 'evidence', 'links'], 'candidate');
    ensure(categories.includes(item.kind), 'invalid candidate kind');
    evidencePath(map, item.path);
    ensure(!seen.has(item.path), `duplicate candidate: ${item.path}`);
    seen.add(item.path);
    text(item.purpose, 'purpose');
    for (const name of ['requirements', 'overlaps']) array(item[name], name).forEach(entry => text(entry, name));
    fields(item.license, ['status', 'expression', 'attribution', 'evidence'], 'license');
    ensure([...copyingBases, 'unclear', 'restricted'].includes(item.license.status), 'invalid license status');
    text(item.license.expression, 'license expression or permission identifier');
    text(item.license.attribution, 'license attribution and notice obligations');
    const licenseFiles = array(item.license.evidence, 'license evidence');
    ensure(!copyingBases.includes(item.license.status) || licenseFiles.length > 0, 'license clearance needs inspected evidence');
    licenseFiles.forEach(file => evidencePath(map, file));
    fields(item.compatibility, ['status', 'notes'], 'compatibility');
    ensure(['native', 'adaptation-needed', 'unsupported', 'unknown'].includes(item.compatibility.status), 'invalid compatibility status');
    text(item.compatibility.notes, 'compatibility notes');
    ensure(array(item.evidence, 'evidence').length > 0, 'candidate needs cited evidence');
    for (const citation of item.evidence) {
      fields(citation, ['path', 'note'], 'citation');
      evidencePath(map, citation.path);
      text(citation.note, 'evidence note or line range and summary');
    }
    for (const link of array(item.links, 'links')) {
      fields(link, ['path', 'url', 'reason'], 'support link');
      ensure((link.path !== undefined) !== (link.url !== undefined), 'support link needs a path or URL');
      if (link.path !== undefined) {
        relativePath(link.path);
        ensure(map.has(link.path), `linked file must have an inventory entry: ${link.path}`);
      } else {
        text(link.url, 'link URL');
        const url = new URL(link.url);
        ensure(url.protocol === 'https:' && !url.username && !url.password && !url.search, 'use only clean HTTPS reference URLs');
      }
      text(link.reason, 'support link reason');
    }
  }
  return value;
}

export class Discovery {
  constructor(root) {
    this.catalog = new Catalog(root);
    this.root = this.catalog.root;
  }

  directory(...segments) {
    let result = this.root;
    for (const segment of ['harness', 'records', ...segments]) {
      ensure(identifier.test(segment), 'unsafe record directory segment');
      result = path.join(result, segment);
      const stat = fs.lstatSync(result, { throwIfNoEntry: false });
      ensure(!stat || stat.isDirectory(), `unsafe record directory: ${result}`);
    }
    return result;
  }

  read(directory, revision) {
    const file = path.join(directory, `${revision}.json`);
    ensure(fs.lstatSync(file, { throwIfNoEntry: false })?.isFile(), `missing or unsafe record: ${file}`);
    return readJSON(file);
  }

  latest(directory) {
    if (!fs.existsSync(directory)) return 0;
    const files = fs.readdirSync(directory);
    ensure(files.every(file => /^[1-9]\d*\.json$/.test(file)), `unexpected revision file: ${directory}`);
    const versions = files.map(file => Number(file.slice(0, -5))).sort((a, b) => a - b);
    ensure(versions.every((version, index) => version === index + 1), `record history has missing revisions: ${directory}`);
    return versions.at(-1) ?? 0;
  }

  append(directory, revision, value) {
    integer(revision, 'revision');
    ensure(Buffer.byteLength(JSON.stringify(value, null, 2)) + 1 <= MAX_TOTAL_BYTES, 'record is too large');
    fs.mkdirSync(directory, { recursive: true });
    writeJSON(path.join(directory, `${revision}.json`), value);
    return value;
  }

  batch(value) {
    fields(value, ['schemaVersion', 'id', 'sources'], 'batch');
    ensure(value.schemaVersion === 1 && typeof value.id === 'string' && identifier.test(value.id), 'invalid batch identity');
    const sources = array(value.sources, 'sources').map(source);
    ensure(sources.length && new Set(sources.map(item => item.repo)).size === sources.length, 'select one pinned revision per repository per batch');
    return this.append(this.directory('batches', value.id), 1, { ...value, sources });
  }

  status(id) {
    const batch = this.read(this.directory('batches', id), 1);
    return batch.sources.map(item => {
      const key = sourceKey(item);
      const directory = this.directory('dispatch', key);
      const version = this.latest(directory);
      const event = version ? this.read(directory, version) : { status: 'pending', version: 0 };
      return { source: item, key, ...event };
    });
  }

  dispatch(id, key, request) {
    fields(request, ['version', 'action', 'sessionId', 'scanRevision', 'resultCommit', 'note'], 'dispatch request');
    const current = this.status(id).find(item => item.key === key);
    ensure(current, 'source is not in this batch');
    ensure(current.version === request.version, 'stale dispatch version; refresh batch status');
    const event = { version: current.version + 1, batch: id, date: new Date().toISOString() };
    if (request.action === 'reserve') {
      ensure(['pending', 'released'].includes(current.status), 'source already reserved, dispatched, or accepted');
      Object.assign(event, { status: 'reserved', reservation: randomUUID() });
    } else if (request.action === 'release') {
      ensure(current.status === 'reserved', 'only an unbound reservation can be released');
      text(request.note, 'reconciliation evidence confirming no session exists');
      Object.assign(event, { status: 'released', reservation: current.reservation, note: request.note });
    } else if (request.action === 'bind') {
      ensure(current.status === 'reserved', 'reserve before binding the app session');
      text(request.sessionId, 'actual app session ID');
      Object.assign(event, { status: 'running', reservation: current.reservation, sessionId: request.sessionId });
    } else {
      ensure(['accept', 'block', 'resume'].includes(request.action), 'unknown dispatch action');
      ensure(current.sessionId && current.sessionId === request.sessionId, 'session ID must match this source dispatch');
      Object.assign(event, { reservation: current.reservation, sessionId: current.sessionId });
      if (request.action === 'accept') {
        ensure(current.status === 'running', 'only a running scan can be accepted');
        ensure(request.scanRevision > (current.result?.revision ?? 0), 'scan revision was already accepted');
        ensure(typeof request.resultCommit === 'string' && sha.test(request.resultCommit), 'accepted scan needs its lab results commit SHA');
        const scan = this.scan(key, request.scanRevision);
        Object.assign(event, { status: scan.coverage.state === 'complete' ? 'complete' : 'partial',
          result: { revision: scan.revision, sha256: hash(scan), commit: request.resultCommit } });
      } else if (request.action === 'block') {
        ensure(current.status === 'running', 'only a running scan can be marked blocked');
        text(request.note, 'blocking reason');
        Object.assign(event, { status: 'blocked', note: request.note, ...(current.result && { result: current.result }) });
      } else {
        ensure(['partial', 'blocked'].includes(current.status), 'only partial or blocked work can be resumed');
        Object.assign(event, { status: 'running', ...(current.result && { result: current.result }) });
      }
    }
    return this.append(this.directory('dispatch', key), event.version, event);
  }

  saveScan(value) {
    validateScan(value);
    const key = sourceKey(value.source);
    const directory = this.directory('scans', key);
    const latest = this.latest(directory);
    ensure(value.revision === latest + 1, 'scan requires the next revision');
    if (latest) {
      const previous = this.scan(key, latest);
      const files = new Map(value.files.map(file => [file.path, file]));
      for (const file of previous.files.filter(file => file.status === 'inspected')) {
        ensure(files.get(file.path)?.sha256 === file.sha256, `inspected bytes changed or went missing at the pinned commit: ${file.path}`);
      }
    }
    return this.append(directory, value.revision, { ...value, source: source(value.source) });
  }

  scan(key, revision) {
    ensure(digest.test(key), 'invalid source key');
    const directory = this.directory('scans', key);
    const selected = revision ?? this.latest(directory);
    integer(selected, 'scan revision');
    const scan = validateScan(this.read(directory, selected));
    ensure(scan.revision === selected && sourceKey(scan.source) === key, 'scan identity mismatch');
    return scan;
  }

  decide(value) {
    fields(value, ['sourceKey', 'scanRevision', 'path', 'revision', 'decision', 'reason', 'component', 'adaptation', 'notices'], 'curation decision');
    integer(value.revision, 'decision revision');
    integer(value.scanRevision, 'pinned scan revision');
    ensure(decisionTypes.includes(value.decision), 'invalid decision');
    text(value.reason, 'decision rationale');
    const scan = this.scan(value.sourceKey, value.scanRevision);
    const candidate = scan.candidates.find(item => item.path === value.path);
    ensure(candidate, 'decision requires an inspected candidate in the pinned scan');
    const directory = this.directory('decisions', value.sourceKey, hash(candidate.path));
    ensure(value.revision === this.latest(directory) + 1, 'decision requires the next revision');
    const { component } = value;
    let componentSha256;
    if (['adopted', 'duplicate'].includes(value.decision)) {
      fields(component, ['id', 'version'], 'component reference');
      integer(component.version, 'component version');
      const record = this.catalog.read('components', component.id, component.version);
      componentSha256 = hash(record);
      if (value.decision === 'adopted') {
        ensure(copyingBases.includes(candidate.license.status), 'unclear or restricted sources remain reference-only');
        ensure(['native', 'adaptation-needed'].includes(candidate.compatibility.status), 'resolve compatibility before adoption');
        const files = new Map(scan.files.map(file => [file.path, file]));
        for (const link of candidate.links) if (link.path) evidencePath(files, link.path);
        text(value.adaptation, 'reviewed adaptation and dependency/runtime compatibility');
        const notices = array(value.notices, 'notice files');
        ensure(notices.length > 0, 'adoption must preserve attribution and any required notices');
        for (const file of notices) {
          relativePath(file);
          ensure(Object.hasOwn(record.files, file) && record.files[file].trim(), `notice must be part of the component: ${file}`);
        }
      }
    } else {
      ensure(component === undefined, 'only adoption and duplicate decisions link a component');
    }
    ensure(value.decision === 'adopted' || (value.adaptation === undefined && value.notices === undefined),
      'adaptation and notices are only accepted for adoption');
    return this.append(directory, value.revision, {
      schemaVersion: 1, ...value, source: scan.source, scanSha256: hash(scan),
      sourceSha256: scan.files.find(file => file.path === value.path).sha256,
      license: candidate.license, ...(componentSha256 && { componentSha256 }),
    });
  }
}
