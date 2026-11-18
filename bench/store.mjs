import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ensure, identifier, kinds, validate, relativePath, object, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from './schema.mjs';

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

export function readPinnedFile(root, pin) {
  relativePath(pin.path);
  ensure(pin.path.startsWith('bench/'), 'pinned files must be retained under bench/');
  let current = fs.realpathSync(root);
  for (const part of pin.path.split('/')) {
    current = path.join(current, part);
    ensure(!fs.lstatSync(current).isSymbolicLink(), `pinned source cannot be a symlink: ${pin.path}`);
  }
  const stat = fs.statSync(current);
  ensure(stat.isFile() && stat.size <= MAX_FILE_BYTES, `pinned source must be a regular file <= 1 MiB: ${pin.path}`);
  const bytes = fs.readFileSync(current);
  ensure(hash(bytes) === pin.sha256, `pinned file hash mismatch: ${pin.path}`);
  ensure(Buffer.from(bytes.toString('utf8')).equals(bytes), `pinned source must be UTF-8: ${pin.path}`);
  return bytes.toString('utf8');
}

function validateComposition(components, fixtures, label, target) {
  const selected = new Map(components.map(component => [component.id, component.version]));
  const paths = new Set();
  const directories = new Map();
  const names = new Set();
  const runtime = new Set();
  let bytes = 0;
  for (const component of components) {
    for (const ref of component.requires ?? []) {
      ensure(selected.get(ref.id) === ref.version, `${label}: ${component.id} requires ${ref.id}@${ref.version} to be enabled`);
    }
    for (const key of Object.keys(component.runtime ?? {})) {
      ensure(!runtime.has(key), `runtime configuration collision in ${label}: ${key}`);
      runtime.add(key);
    }
  }
  ensure(!['headless', 'portable'].includes(target) || !runtime.has('appSetup'), `${label}: appSetup is incompatible with ${target}`);
  const files = [fixtures, ...components.map(c => c.files)];
  for (const [file, content] of files.flatMap(Object.entries)) {
    bytes += Buffer.byteLength(content);
    ensure(bytes <= MAX_TOTAL_BYTES, 'combined trial inputs exceed total size limit');
    const key = file.normalize('NFC').toLowerCase();
    ensure(!paths.has(key), `file collision in ${label}: ${file}`);
    ensure(!directories.has(key), `file/directory collision: ${file}`);
    paths.add(key);
    const segments = file.split('/');
    while (segments.length > 1) {
      segments.pop();
      const spelling = segments.join('/');
      const directory = spelling.normalize('NFC').toLowerCase();
      ensure(!paths.has(directory), `file/directory collision: ${file}`);
      ensure(!directories.has(directory) || directories.get(directory) === spelling, `directory spelling collision: ${spelling}`);
      directories.set(directory, spelling);
    }
    const entry = key.match(/^\.(?:github|agents|claude)\/skills\/([^/]+)\/skill\.md$/)
      ?? key.match(/^\.github\/agents\/([^/]+?)(?:\.agent)?\.md$/);
    if (!entry) continue;
    const kind = key.includes('/skills/') ? 'skill' : 'agent';
    const header = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    const display = header?.match(/^name:[ \t]+(?:'([^'\r\n]+)'|"([^"\r\n]+)"|([a-zA-Z0-9][a-zA-Z0-9 -]*))[ \t]*(?:#.*)?\r?$/m);
    const aliases = new Set([entry[1], (display?.[1] ?? display?.[2] ?? display?.[3] ?? entry[1]).trim().normalize('NFC').toLowerCase()]);
    for (const alias of aliases) {
      const name = `${kind}:${alias}`;
      ensure(!names.has(name), `entry-point name collision in ${label}: ${name}`);
      names.add(name);
    }
  }
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

  resolveProfile(value) {
    const label = `profile ${value.id}@${value.version}`;
    const parts = value.parts.map(part => ({
      ...part, record: this.read('components', part.id, part.version),
    }));
    const enabled = parts.filter(part => part.enabled);
    validateComposition(enabled.map(part => part.record), {}, label, value.target);
    return enabled.map(({ id, version }) => ({ id, version }));
  }

  profileVariant(id, version, name = id) {
    ensure(typeof name === 'string' && identifier.test(name), 'invalid variant name');
    const profile = this.read('profiles', id, version);
    return { name, components: this.resolveProfile(profile), profile: { id, version: profile.version } };
  }

  resolveCase(value) {
    const rubric = this.read('rubrics', value.rubric.id, value.rubric.version);
    const fixtures = Object.assign(Object.create(null), value.files);
    for (const [destination, pin] of Object.entries(value.source?.files ?? {})) {
      ensure(!Object.hasOwn(fixtures, destination), `source/fixture collision: ${destination}`);
      fixtures[destination] = readPinnedFile(this.root, pin);
    }
    const policy = value.policy && JSON.parse(readPinnedFile(this.root, value.policy));
    if (value.policy) object(policy, 'pinned policy');
    for (const check of value.checks.filter(check => check.type === 'evaluator')) readPinnedFile(this.root, check.script);
    const variants = value.variants.map(variant => {
      const profile = variant.profile && this.read('profiles', variant.profile.id, variant.profile.version);
      if (profile) {
        ensure(canonical(this.resolveProfile(profile)) === canonical(variant.components),
          `variant ${variant.name} must match enabled profile pins and order`);
      }
      const resolved = variant.components.map(ref => this.read('components', ref.id, ref.version));
      validateComposition(resolved, fixtures, `variant ${variant.name}`, profile?.target);
      for (const check of value.checks.filter(c => c.type === 'file-unchanged')) {
        ensure([fixtures, ...resolved.map(c => c.files)].some(files => Object.hasOwn(files, check.path)),
          `file-unchanged check must reference an input: ${check.path}`);
      }
      return { ...variant, resolved, profileRecord: profile };
    });
    return { rubric, variants, fixtures, policy };
  }

  validateReferences(kind, value) {
    if (kind === 'cases') this.resolveCase(value);
    if (kind === 'profiles') this.resolveProfile(value);
    if (kind === 'components') {
      for (const ref of value.requires ?? []) this.read('components', ref.id, ref.version);
    }
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
    this.validateReferences(kind, value);
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
          if (value.deleted !== true) this.validateReferences(kind, value);
          revisions++;
        }
      }
    }
    return { valid: true, revisions };
  }
}
