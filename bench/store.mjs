import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ensure, identifier, kinds, validate, MAX_TOTAL_BYTES } from './schema.mjs';

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
export const readJSON = file => {
  ensure(fs.statSync(file).size <= MAX_TOTAL_BYTES, `JSON file too large: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
export const writeJSON = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });

export function inside(parent, candidate) {
  const rel = path.relative(parent, candidate);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

export class Catalog {
  constructor(root) {
    this.root = fs.realpathSync(root);
  }

  directory(kind, id) {
    ensure(kinds.includes(kind), `unknown catalog kind: ${kind}`);
    ensure(typeof id === 'string' && identifier.test(id), 'invalid catalog id');
    const directory = path.join(this.root, 'bench', 'catalog', kind, id);
    // Catalog paths are trusted storage, but must never redirect writes outside the lab.
    let current = this.root;
    for (const part of path.relative(this.root, directory).split(path.sep)) {
      current = path.join(current, part);
      if (fs.existsSync(current)) ensure(fs.lstatSync(current).isDirectory() && !fs.lstatSync(current).isSymbolicLink(), `unsafe catalog directory: ${current}`);
    }
    return directory;
  }

  versions(kind, id) {
    const directory = this.directory(kind, id);
    if (!fs.existsSync(directory)) return [];
    const names = fs.readdirSync(directory);
    ensure(names.every(name => /^[1-9]\d*\.json$/.test(name)), `unexpected catalog revision file in ${kind}/${id}`);
    const versions = names
      .map(name => Number(name.slice(0, -5))).sort((a, b) => a - b);
    ensure(versions.every((version, index) => Number.isSafeInteger(version) && version === index + 1), `catalog history has missing revisions: ${kind}/${id}`);
    return versions;
  }

  read(kind, id, version) {
    const versions = this.versions(kind, id);
    const selected = version ?? versions.at(-1);
    ensure(Number.isSafeInteger(selected) && versions.includes(selected), `${kind}/${id} revision not found`);
    const file = path.join(this.directory(kind, id), `${selected}.json`);
    ensure(!fs.lstatSync(file).isSymbolicLink(), `catalog revision is a symlink: ${file}`);
    const value = validate(kind, readJSON(file), { tombstone: true });
    ensure(value.id === id && value.version === selected, `catalog identity mismatch: ${file}`);
    ensure(value.deleted !== true, `${kind}/${id} is deleted at version ${selected}`);
    return value;
  }

  list(kind) {
    ensure(kinds.includes(kind), `unknown catalog kind: ${kind}`);
    const directory = path.join(this.root, 'bench', 'catalog', kind);
    if (!fs.existsSync(directory)) return [];
    ensure(!fs.lstatSync(directory).isSymbolicLink(), 'catalog kind directory cannot be a symlink');
    return fs.readdirSync(directory).sort().map(id => {
      const versions = this.versions(kind, id);
      ensure(versions.length > 0, `empty catalog record: ${kind}/${id}`);
      const file = path.join(this.directory(kind, id), `${versions.at(-1)}.json`);
      ensure(!fs.lstatSync(file).isSymbolicLink(), 'catalog revision cannot be a symlink');
      const value = validate(kind, readJSON(file), { tombstone: true });
      ensure(value.id === id && value.version === versions.at(-1), `catalog identity mismatch: ${kind}/${id}`);
      return value;
    }).filter(value => value.deleted !== true);
  }

  resolveCase(value) {
    const rubric = this.read('rubrics', value.rubric.id, value.rubric.version);
    const variants = value.variants.map(variant => ({
      ...variant,
      resolved: variant.components.map(ref => this.read('components', ref.id, ref.version)),
    }));
    for (const variant of variants) {
      const paths = [...Object.keys(value.files), ...variant.resolved.flatMap(c => Object.keys(c.files))];
      ensure(new Set(paths).size === paths.length, `file collision in variant ${variant.name}`);
      for (const file of paths) {
        ensure(!paths.some(other => other !== file && file.startsWith(`${other}/`)), `file/directory collision: ${file}`);
      }
      const runtimeKeys = variant.resolved.flatMap(c => Object.keys(c.runtime ?? {}));
      ensure(new Set(runtimeKeys).size === runtimeKeys.length, `runtime configuration collision in variant ${variant.name}`);
      for (const check of value.checks.filter(c => c.type === 'file-unchanged')) {
        ensure(paths.includes(check.path), `file-unchanged check must reference an input: ${check.path}`);
      }
    }
    return { rubric, variants };
  }

  put(kind, value, operation) {
    validate(kind, value);
    ensure(['create', 'update'].includes(operation), 'operation must be create or update');
    const versions = this.versions(kind, value.id);
    if (operation === 'create') ensure(versions.length === 0 && value.version === 1, 'create requires a new id at version 1');
    else {
      ensure(versions.length > 0 && value.version === versions.at(-1) + 1, 'update requires the next version (stale update or missing record)');
      this.read(kind, value.id);
    }
    if (kind === 'cases') this.resolveCase(value);
    const directory = this.directory(kind, value.id);
    fs.mkdirSync(directory, { recursive: true });
    writeJSON(path.join(directory, `${value.version}.json`), value);
    return value;
  }

  delete(kind, id, expectedVersion) {
    const current = this.read(kind, id);
    ensure(current.version === expectedVersion, 'stale delete: expected version must match latest revision');
    const value = { schemaVersion: 1, id, version: current.version + 1, deleted: true };
    writeJSON(path.join(this.directory(kind, id), `${value.version}.json`), value);
    return value;
  }

  validateAll() {
    let revisions = 0;
    for (const kind of kinds) {
      const directory = path.join(this.root, 'bench', 'catalog', kind);
      this.list(kind);
      if (!fs.existsSync(directory)) continue;
      for (const id of fs.readdirSync(directory)) {
        for (const version of this.versions(kind, id)) {
          const file = path.join(this.directory(kind, id), `${version}.json`);
          ensure(!fs.lstatSync(file).isSymbolicLink(), 'catalog revision cannot be a symlink');
          const value = validate(kind, readJSON(file), { tombstone: true });
          ensure(value.id === id && value.version === version, `catalog identity mismatch: ${file}`);
          if (kind === 'cases' && value.deleted !== true) this.resolveCase(value);
          revisions++;
        }
      }
    }
    return { valid: true, revisions };
  }
}
