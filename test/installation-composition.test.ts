import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { streamConfigs, TRANSPORT_LIMITS, TransportAddress } from '@taskelith/nats';

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
  readonly cgroup?: string;
  readonly cap_drop?: readonly string[];
  readonly cap_add?: readonly string[];
  readonly security_opt?: readonly string[];
  readonly init?: boolean;
  readonly environment?: Record<string, string | null>;
  readonly volumes?: readonly Mount[];
  readonly ports?: readonly Port[];
}

interface Composition {
  readonly services: Record<string, Service>;
  readonly volumes?: Record<string, unknown>;
}

interface Stage {
  readonly from: string;
  readonly user?: string;
  readonly copiesFrom: readonly string[];
}

const DIGEST_PINNED = /^[^@\s]+@sha256:[0-9a-f]{64}$/;
const PASSWORD = 'composition-test-password';
const ROOT_USERS = new Set(['', 'root', '0']);
const GIB = 1024 ** 3;

function makeVariable(name: string): string {
  const match = new RegExp(`^${name} := (.+)$`, 'm').exec(readFileSync('Makefile', 'utf8'));
  assert.ok(match, `Makefile defines ${name}`);
  return match[1];
}

function resolvedComposition(files: string | readonly string[], environment: Record<string, string>): Composition {
  const fileArguments = (typeof files === 'string' ? [files] : files).flatMap((file) => ['--file', file]);
  const output = execFileSync('docker', ['compose', ...fileArguments, '--profile', 'setup', '--profile', 'admin',
    '--profile', 'worker', 'config', '--format', 'json'], { env: { ...process.env, ...environment }, encoding: 'utf8' });
  return JSON.parse(output) as Composition;
}

function dockerfileStages(source: string): Map<string, Stage> {
  const stages = new Map<string, Stage>();
  let current: { name: string; stage: Stage } | undefined;
  for (const line of source.split('\n')) {
    const from = /^FROM (\S+) AS (\S+)$/.exec(line);
    const user = /^USER (\S+)$/.exec(line);
    const copy = /^COPY --from=(\S+) /.exec(line);
    if (from) {
      current = { name: from[2], stage: { from: from[1], copiesFrom: [] } };
      stages.set(current.name, current.stage);
    } else if (user && current) {
      current.stage = { ...current.stage, user: user[1] };
      stages.set(current.name, current.stage);
    } else if (copy && current) {
      current.stage = { ...current.stage, copiesFrom: [...current.stage.copiesFrom, copy[1]] };
      stages.set(current.name, current.stage);
    }
  }
  return stages;
}

function effectiveUser(stages: Map<string, Stage>, name: string): string {
  const stage = stages.get(name);
  if (stage === undefined) return '';
  return stage.user ?? effectiveUser(stages, stage.from);
}

function isRoot(user: string): boolean {
  return ROOT_USERS.has(user.split(':')[0]);
}

const COMPOSITION_ENVIRONMENT = { TASKELITH_IMAGE_TAG: 'composition-test', TASKELITH_POSTGRES_PASSWORD: PASSWORD };
const installation = resolvedComposition('infra/installation/compose.yaml', COMPOSITION_ENVIRONMENT);
const services = installation.services;
const dockerfile = readFileSync('infra/installation/Dockerfile', 'utf8');
const stages = dockerfileStages(dockerfile);

test('pulled images and the image pins are pinned by digest and checksum', () => {
  for (const [name, service] of Object.entries(services)) {
    if (!service.image.startsWith('taskelith-')) assert.match(service.image, DIGEST_PINNED, name);
  }
  assert.match(makeVariable('UBUNTU_BASE'), /^ubuntu:24\.04@sha256:[0-9a-f]{64}$/);
  assert.match(makeVariable('NODE_LINUX_X64_SHA256'), /^[0-9a-f]{64}$/);
  assert.match(makeVariable('NODE_LINUX_ARM64_SHA256'), /^[0-9a-f]{64}$/);
});

test('the installation uses the integration services images', () => {
  const integration = resolvedComposition('infra/services/compose.yaml', { TASKELITH_SERVICES_SECRETS: '/nonexistent' });
  assert.equal(services.postgres.image, integration.services.postgres.image);
  assert.equal(services.nats.image, integration.services.nats.image);
  assert.equal(services['nats-setup'].image, integration.services.nats.image);
});

test('the Dockerfile builds only from the base and checks the Node.js tarballs', () => {
  const roots = new Set(['${BASE}', 'node-${TARGETARCH}']);
  for (const [name, stage] of stages) assert.ok(roots.has(stage.from) || stages.has(stage.from), name);
  assert.equal(dockerfile.match(/^FROM /gm)?.length, stages.size);
  const downloads = [...dockerfile.matchAll(/^ADD (.+)$/gm)].map(([, line]) => line);
  assert.equal(downloads.length, 2);
  for (const line of downloads) assert.match(line, /^--checksum=sha256:\$\{NODE_SHA256_(AMD64|ARM64)\} https:\/\/nodejs\.org\//);
});

// The instructions of a stage, each with its continuation lines joined.
function stageInstructions(name: string): readonly string[] {
  const start = dockerfile.indexOf(` AS ${name}\n`);
  assert.notEqual(start, -1, `the Dockerfile has the stage ${name}`);
  const end = dockerfile.indexOf('\nFROM ', start);
  return dockerfile.slice(start, end === -1 ? undefined : end).replace(/ \\\n\s*/g, ' ').split('\n').slice(1);
}

// Every stage that a target is built from or copies from, for each
// architecture of node-${TARGETARCH}.
function stageChain(stages: Map<string, Stage>, target: string): ReadonlySet<string> {
  const chain = new Set<string>();
  const visit = (reference: string): void => {
    for (const name of ['amd64', 'arm64'].map((architecture) => reference.replace('${TARGETARCH}', architecture))) {
      const stage = stages.get(name);
      if (stage === undefined || chain.has(name)) continue;
      chain.add(name);
      [stage.from, ...stage.copiesFrom].forEach(visit);
    }
  };
  visit(target);
  return chain;
}

const SOURCE_DATE_CLAMP = '-newermt "@${SOURCE_DATE_EPOCH:?}" -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} +';

test('the stage chain of a target follows its parents and copy sources', () => {
  const sample = dockerfileStages([
    'FROM ${BASE} AS node-amd64', 'FROM ${BASE} AS node-arm64', 'FROM node-${TARGETARCH} AS node',
    'FROM ${BASE} AS added', 'FROM node AS worker', 'COPY --from=added /x /x', 'FROM worker AS other', '',
  ].join('\n'));
  assert.deepEqual([...stageChain(sample, 'worker')].sort(), ['added', 'node', 'node-amd64', 'node-arm64', 'worker']);
});

test('every RUN of the worker image ends with the clamp to SOURCE_DATE_EPOCH', () => {
  const chain = stageChain(stages, 'worker');
  for (const name of ['build', 'node-amd64', 'node-arm64', 'runtime', 'worker']) assert.ok(chain.has(name), name);
  for (const name of chain) {
    const instructions = stageInstructions(name);
    const runs = instructions.filter((instruction) => instruction.startsWith('RUN '));
    if (runs.length > 0) assert.ok(instructions.includes('ARG SOURCE_DATE_EPOCH'), name);
    for (const run of runs) assert.ok(run.endsWith(SOURCE_DATE_CLAMP), `${name}: ${run}`);
  }
  assert.deepEqual(stageInstructions('node').filter((instruction) => instruction.trim() !== ''), ['COPY --from=node-files /node /usr/local']);
});

test('the effective user of a stage follows its parents', () => {
  const sample = dockerfileStages('FROM ${BASE} AS a\nUSER app\nFROM a AS b\nFROM b AS c\nUSER root\n');
  assert.equal(effectiveUser(sample, 'b'), 'app');
  assert.equal(effectiveUser(sample, 'c'), 'root');
  assert.equal(effectiveUser(sample, '${BASE}'), '');
  assert.equal(isRoot('0:0'), true);
  assert.equal(isRoot('10002:10002'), false);
});

// Relative to infra/installation, the project directory Compose resolves it in.
const WORKER_SECCOMP = 'seccomp=./seccomp/worker.json';

// The capabilities the worker entrypoint drops to before the worker runs.
const ENTRYPOINT_CAPABILITIES = ['CHOWN', 'DAC_OVERRIDE', 'KILL', 'SETGID', 'SETPCAP', 'SETUID', 'SYS_ADMIN'];

test('long-running services run unprivileged; only the worker entrypoint starts as root', () => {
  for (const target of ['control-plane', 'worker', 'worker-harnesses']) assert.equal(isRoot(effectiveUser(stages, target)), false, target);
  for (const [name, service] of Object.entries(services)) {
    if (service.image.startsWith('taskelith-') && name !== 'worker') assert.equal(service.user, undefined, name);
  }
  assert.equal(isRoot(services.nats.user ?? ''), false);
  const worker = services.worker;
  assert.equal(worker.user, '0:0');
  assert.deepEqual([worker.cap_drop, [...(worker.cap_add ?? [])].sort()], [['ALL'], ENTRYPOINT_CAPABILITIES]);
  assert.deepEqual([worker.cgroup, worker.init], ['private', true]);
  assert.deepEqual([...(worker.security_opt ?? [])].sort(), ['apparmor=unconfined', 'no-new-privileges=true', WORKER_SECCOMP]);
  assert.match(dockerfile, /^ENTRYPOINT \["bash", "\/opt\/taskelith\/infra\/installation\/worker-entrypoint\.sh"\]$/m);
  const entrypoint = readFileSync('infra/installation/worker-entrypoint.sh', 'utf8');
  assert.match(entrypoint, /^exec setpriv --bounding-set=-all,\+setuid,\+setgid,\+kill --inh-caps=-all --no-new-privs -- "\$@"$/m);
});

test('the worker image always names its containment parent and execution account', () => {
  const environment = /^ENV (TASKELITH_CONTAINMENT_PARENT=.+)$/m.exec(dockerfile)?.[1].split(' ') ?? [];
  assert.deepEqual(environment, [
    'TASKELITH_CONTAINMENT_PARENT=/sys/fs/cgroup/executions', 'TASKELITH_EXECUTION_UID=10003', 'TASKELITH_EXECUTION_GID=10003',
  ]);
  assert.match(dockerfile, /^RUN useradd --uid 10003 --user-group .* taskelith-exec \\$/m);
});

test('the smoke adds only its workflow and the scripted process', () => {
  const smoke = resolvedComposition(['infra/installation/compose.yaml', 'infra/installation/smoke/compose.yaml'], COMPOSITION_ENVIRONMENT);
  const added = (name: string) => Object.entries(smoke.services[name].environment ?? {})
    .filter(([variable]) => !Object.hasOwn(services[name].environment ?? {}, variable));
  assert.deepEqual(added('control-plane'), [['TASKELITH_WORKFLOWS', '/opt/taskelith/infra/installation/smoke/workflows.json']]);
  const [[variable, command] = []] = added('worker');
  assert.equal(variable, 'TASKELITH_WORKER_COMMAND');
  assert.equal((JSON.parse(command ?? '[]') as string[])[0], '/usr/local/bin/node');
  assert.deepEqual(Object.keys(smoke.services).sort(), Object.keys(services).sort());
  assert.equal(services.worker.environment?.TASKELITH_WORKER_COMMAND, undefined, 'only the smoke launches');
});

test('service data lives on named volumes', () => {
  const dataVolumes: Record<string, readonly [string, string]> = {
    postgres: ['/var/lib/postgresql', 'postgres-data'],
    nats: ['/data', 'nats-data'],
    'control-plane': ['/var/lib/taskelith', 'control-plane-data'],
    admin: ['/var/lib/taskelith', 'control-plane-data'],
    worker: ['/var/lib/taskelith', 'worker-data'],
  };
  for (const [name, [target, volume]] of Object.entries(dataVolumes)) {
    const mount = services[name].volumes?.find((candidate) => candidate.target === target);
    assert.deepEqual([mount?.type, mount?.source], ['volume', volume], name);
    assert.ok(Object.hasOwn(installation.volumes ?? {}, volume), volume);
  }
});

test('host ports are published on localhost only', () => {
  const ports = Object.values(services).flatMap((service) => service.ports ?? []);
  assert.deepEqual(ports.map((port) => port.target).sort(), [4222, 8080, 8443]);
  for (const port of ports) assert.equal(port.host_ip, '127.0.0.1');
});

test('the broker requires TLS and the worker trusts the installation CA read-only', () => {
  const broker = readFileSync('infra/installation/nats-server.conf', 'utf8');
  assert.match(broker, /^tls \{[^}]*cert_file: "\/etc\/nats\/authority\/nats-certificate\.pem"[^}]*min_version: "1\.2"/m);
  assert.doesNotMatch(broker, /^\s*allow_non_tls/m);
  const trust = services.worker.volumes?.find((mount) => mount.source === 'installation-trust');
  assert.deepEqual([trust?.target, (trust as { read_only?: boolean } | undefined)?.read_only], ['/etc/taskelith/trust', true]);
  const ca = '/etc/taskelith/trust/installation-ca.pem';
  assert.deepEqual([services.worker.environment?.TASKELITH_NATS_CA, services.worker.environment?.NODE_EXTRA_CA_CERTS], [ca, ca]);
  assert.match(services.worker.environment?.TASKELITH_CONTROL_PLANE_URL ?? '', /^https:\/\//);
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

test('the streams reserve no more than the fixed broker file store', () => {
  const store = /^\s*max_file_store: (\d+)GiB$/m.exec(readFileSync('infra/installation/nats-server.conf', 'utf8'));
  assert.ok(store, 'nats-server.conf fixes max_file_store in GiB');
  const streamMaxBytes = Number(services['control-plane'].environment?.TASKELITH_STREAM_MAX_BYTES);
  const address = TransportAddress.of('installation');
  assert.ok(address.ok);
  const streams = streamConfigs(address.value, { ...TRANSPORT_LIMITS, streamMaxBytes });
  const reserved = streams.reduce((total, stream) => total + (stream.max_bytes ?? 0), 0);
  assert.deepEqual([streamMaxBytes, Number(store[1]) * GIB], [GIB, 8 * GIB]);
  assert.ok(reserved <= Number(store[1]) * GIB, `${reserved} bytes reserved`);
});
