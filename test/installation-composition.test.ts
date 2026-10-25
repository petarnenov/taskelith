import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface Mount {
  readonly type: string;
  readonly source?: string;
  readonly target: string;
}

interface Port {
  readonly host_ip?: string;
  readonly target: number;
}

interface Service {
  readonly image: string;
  readonly user?: string;
  readonly build?: { readonly args: Record<string, string> };
  readonly environment?: Record<string, string | null>;
  readonly volumes?: readonly Mount[];
  readonly ports?: readonly Port[];
}

interface Composition {
  readonly services: Record<string, Service>;
}

const DIGEST_PINNED = /^[^@\s]+@sha256:[0-9a-f]{64}$/;
const PASSWORD = 'composition-test-password';

function makeVariable(name: string): string {
  const match = new RegExp(`^${name} := (.+)$`, 'm').exec(readFileSync('Makefile', 'utf8'));
  assert.ok(match, `Makefile defines ${name}`);
  return match[1];
}

function resolvedComposition(file: string, environment: Record<string, string>): Composition {
  const output = execFileSync('docker', ['compose', '--file', file, '--profile', 'setup', '--profile', 'admin',
    '--profile', 'worker', 'config', '--format', 'json'], { env: { ...process.env, ...environment }, encoding: 'utf8' });
  return JSON.parse(output) as Composition;
}

const installation = resolvedComposition('infra/installation/compose.yaml', {
  TASKELITH_UBUNTU_BASE: makeVariable('UBUNTU_BASE'),
  TASKELITH_NODE_VERSION: readFileSync('.nvmrc', 'utf8').trim(),
  TASKELITH_NODE_SHA256_AMD64: makeVariable('NODE_LINUX_X64_SHA256'),
  TASKELITH_NODE_SHA256_ARM64: makeVariable('NODE_LINUX_ARM64_SHA256'),
  TASKELITH_POSTGRES_PASSWORD: PASSWORD,
});
const services = installation.services;
const dockerfile = readFileSync('infra/installation/Dockerfile', 'utf8');

test('pulled images and the build base are pinned by digest', () => {
  for (const [name, service] of Object.entries(services)) {
    if (service.build === undefined && !service.image.startsWith('taskelith-')) {
      assert.match(service.image, DIGEST_PINNED, name);
    }
  }
  for (const name of ['control-plane', 'worker']) {
    const args = services[name].build?.args;
    assert.match(args?.BASE ?? '', DIGEST_PINNED, name);
    assert.match(args?.NODE_SHA256_AMD64 ?? '', /^[0-9a-f]{64}$/, name);
    assert.match(args?.NODE_SHA256_ARM64 ?? '', /^[0-9a-f]{64}$/, name);
  }
});

test('the installation uses the integration services images', () => {
  const integration = resolvedComposition('infra/services/compose.yaml', { TASKELITH_SERVICES_SECRETS: '/nonexistent' });
  assert.equal(services.postgres.image, integration.services.postgres.image);
  assert.equal(services.nats.image, integration.services.nats.image);
  assert.equal(services['nats-setup'].image, integration.services.nats.image);
});

test('the Dockerfile builds only from the base and checks the Node.js tarballs', () => {
  const stages = new Set(['${BASE}', 'node-${TARGETARCH}']);
  for (const [, image, stage] of dockerfile.matchAll(/^FROM (\S+) AS (\S+)$/gm)) {
    assert.ok(stages.has(image), `stage ${stage} starts from ${image}`);
    stages.add(stage);
  }
  assert.equal(stages.size, 8);
  const downloads = [...dockerfile.matchAll(/^ADD (.+)$/gm)].map(([, line]) => line);
  assert.equal(downloads.length, 2);
  for (const line of downloads) assert.match(line, /^--checksum=sha256:\$\{NODE_SHA256_(AMD64|ARM64)\} https:\/\/nodejs\.org\//);
});

test('long-running services run unprivileged', () => {
  assert.match(dockerfile, /^USER taskelith$/m);
  assert.match(services.nats.user ?? '', /^[1-9]\d*:[1-9]\d*$/);
});

test('service data lives on named volumes', () => {
  const dataPaths: Record<string, string> = {
    postgres: '/var/lib/postgresql',
    nats: '/data',
    'control-plane': '/var/lib/taskelith',
    worker: '/var/lib/taskelith',
  };
  for (const [name, target] of Object.entries(dataPaths)) {
    const mount = services[name].volumes?.find((volume) => volume.target === target);
    assert.equal(mount?.type, 'volume', name);
  }
});

test('host ports are published on localhost only', () => {
  const ports = Object.values(services).flatMap((service) => service.ports ?? []);
  assert.deepEqual(ports.map((port) => port.target).sort(), [4222, 8080]);
  for (const port of ports) assert.equal(port.host_ip, '127.0.0.1');
});

test('secrets come from the environment of the make targets', () => {
  assert.equal(services.postgres.environment?.POSTGRES_PASSWORD, PASSWORD);
  for (const name of ['control-plane', 'admin']) {
    assert.equal(services[name].environment?.TASKELITH_POSTGRES_URL, `postgres://taskelith:${PASSWORD}@postgres:5432/taskelith`);
  }
  for (const service of Object.values(services)) {
    assert.equal(service.environment?.TASKELITH_OPERATOR_TOKEN, undefined);
  }
});
