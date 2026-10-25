import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface LockedPackage {
  readonly version?: string;
  readonly resolved?: string;
  readonly integrity?: string;
  readonly os?: readonly string[];
}

interface Harness {
  readonly name: string;
  readonly version: string;
  readonly record: string;
  readonly linuxPackages: readonly string[];
}

const HARNESS_DIRECTORY = 'infra/installation/harnesses';
const REGISTRY = 'https://registry.npmjs.org/';
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;

const HARNESSES: readonly Harness[] = [
  {
    name: '@anthropic-ai/claude-agent-sdk',
    version: '0.3.308',
    record: 'docs/qualification/claude-code.md',
    linuxPackages: ['@anthropic-ai/claude-agent-sdk-linux-x64', '@anthropic-ai/claude-agent-sdk-linux-arm64'],
  },
  {
    name: '@openai/codex',
    version: '0.164.0',
    record: 'docs/qualification/codex.md',
    linuxPackages: ['@openai/codex-linux-x64', '@openai/codex-linux-arm64'],
  },
];

const manifest = JSON.parse(readFileSync(`${HARNESS_DIRECTORY}/package.json`, 'utf8')) as {
  readonly dependencies: Record<string, string>;
};
const lock = JSON.parse(readFileSync(`${HARNESS_DIRECTORY}/package-lock.json`, 'utf8')) as {
  readonly packages: Record<string, LockedPackage & { readonly dependencies?: Record<string, string> }>;
};
const dockerfile = readFileSync('infra/installation/Dockerfile', 'utf8');

function locked(name: string): LockedPackage {
  const entry = lock.packages[`node_modules/${name}`];
  assert.ok(entry, `the harness lockfile has ${name}`);
  return entry;
}

function stageBody(name: string): string {
  const header = dockerfile.indexOf(` AS ${name}\n`);
  assert.notEqual(header, -1, `the Dockerfile has the stage ${name}`);
  const start = dockerfile.lastIndexOf('FROM ', header);
  const next = dockerfile.indexOf('\nFROM ', start);
  return dockerfile.slice(start, next === -1 ? undefined : next);
}

test('the harness manifest and the lock root pin exactly the qualified versions', () => {
  const expected = Object.fromEntries(HARNESSES.map((harness) => [harness.name, harness.version]));
  assert.deepEqual(manifest.dependencies, expected);
  assert.deepEqual(lock.packages[''].dependencies, expected);
});

test('every locked package comes from the registry with an integrity hash', () => {
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === '') continue;
    assert.match(entry.integrity ?? '', INTEGRITY, path);
    assert.ok(entry.resolved?.startsWith(REGISTRY), path);
  }
});

test('each harness locks its pinned version and Linux packages', () => {
  for (const harness of HARNESSES) {
    assert.equal(locked(harness.name).version, harness.version, harness.name);
    for (const name of [harness.name, ...harness.linuxPackages]) {
      const entry = locked(name);
      assert.ok(entry.version?.startsWith(harness.version), name);
      assert.ok(entry.resolved?.endsWith(`-${entry.version}.tgz`), `${name} resolves to its version`);
    }
    for (const platform of harness.linuxPackages) assert.deepEqual(locked(platform).os, ['linux'], platform);
  }
});

test('each qualification record states the locked integrity hashes', () => {
  for (const harness of HARNESSES) {
    const record = readFileSync(harness.record, 'utf8');
    assert.ok(record.includes(`\`${harness.name}@${harness.version}\``), harness.record);
    for (const name of [harness.name, ...harness.linuxPackages]) {
      assert.ok(record.includes(locked(name).integrity ?? '-'), `${harness.record} states ${name}`);
    }
  }
});

test('the harness variant installs from the lockfile and leaves the worker unchanged', () => {
  const install = stageBody('harnesses');
  assert.match(install, /^FROM node-\$\{TARGETARCH\} AS harnesses$/m);
  assert.match(install, /^COPY infra\/installation\/harnesses\/package\.json infra\/installation\/harnesses\/package-lock\.json \.\/$/m);
  assert.match(install, /^RUN npm ci --ignore-scripts$/m);
  assert.match(stageBody('worker-harnesses'), /^FROM worker AS worker-harnesses$/m);
  assert.match(stageBody('worker-harnesses'), /DISABLE_AUTOUPDATER=1/);
  for (const stage of ['runtime', 'control-plane', 'worker']) assert.doesNotMatch(stageBody(stage), /harnesses/, stage);
  assert.equal(dockerfile.match(/--from=harnesses/g)?.length, 1);
});
