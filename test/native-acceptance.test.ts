import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCEPTANCE_VARIABLE, type ScenarioRun } from '@taskelith/testing';
import {
  AcceptanceFailure,
  acceptanceContext,
  dfMountPoint,
  failureText,
  diskutilField,
  linuxPlatform,
  macosPlatform,
  matrixArchitecture,
  osReleaseName,
  parseAcceptanceCommand,
  runAcceptanceCommand,
  type AcceptanceDependencies,
  type EntryPlatform,
  type Run,
} from '../scripts/native-acceptance.ts';

const FACTS = { node: 'v24.22.1', kernel: 'Darwin 25.6.0', temporaryDirectory: '/var/folders/x/T' };
const IMAGES = { base: 'ubuntu:24.04@sha256:68ee', testImage: 'taskelith-linux-cgroup:test' };

// Answers each command line from a table, so that no program runs.
function stubRun(answers: Record<string, string>): Run {
  return (file, args) => {
    const line = [file, ...args].join(' ');
    const answer = answers[line];
    if (answer === undefined) throw new Error(`unexpected command: ${line}`);
    return answer;
  };
}

const DOCKER_ANSWERS = {
  'docker version --format {{.Server.Platform.Name}} {{.Server.Version}}': 'Docker Desktop 4.50.0 (210000) 29.6.1\n',
  'docker compose version --short': '5.2.0\n',
};

const MACOS_ANSWERS = {
  ...DOCKER_ANSWERS,
  'sw_vers -productVersion': '26.6.2\n',
  'sw_vers -buildVersion': '25G83\n',
  'uname -m': 'arm64\n',
  'df -P /var/folders/x/T': 'Filesystem 512-blocks Used Available Capacity Mounted on\n/dev/disk3s5 4787 3992 259 94% /System/Volumes/Data\n',
  'diskutil info /System/Volumes/Data': '   Mount Point:               /System/Volumes/Data\n   File System Personality:   APFS\n',
};

const LINUX_ANSWERS = {
  ...DOCKER_ANSWERS,
  'docker info --format {{.OperatingSystem}}|{{.KernelVersion}}|{{.Architecture}}|{{.ServerVersion}}|{{.Driver}}':
    'Docker Desktop|6.12.76-linuxkit|aarch64|29.6.1|overlay2\n',
  'docker run --rm ubuntu:24.04@sha256:68ee cat /etc/os-release': 'NAME="Ubuntu"\nPRETTY_NAME="Ubuntu 24.04.3 LTS"\n',
  'docker run --rm --volume /probe ubuntu:24.04@sha256:68ee stat -f -c %T /probe': 'ext2/ext3\n',
  'docker run --rm --entrypoint node taskelith-linux-cgroup:test -v': 'v24.22.1\n',
};

test('a macOS 26 host is its matrix entry, with its file system and versions', () => {
  assert.deepEqual(macosPlatform(stubRun(MACOS_ANSWERS), FACTS), {
    entry: 'macos-26-arm64',
    platform: {
      os: 'macOS 26.6.2 (25G83)',
      architecture: 'arm64',
      kernel: 'Darwin 25.6.0',
      filesystem: 'APFS at /System/Volumes/Data, which holds the temporary directory /var/folders/x/T',
      node: 'v24.22.1',
      docker: 'Docker Desktop 4.50.0 (210000) 29.6.1; Docker Compose 5.2.0',
    },
  });
  const intel = macosPlatform(stubRun({ ...MACOS_ANSWERS, 'uname -m': 'x86_64\n' }), FACTS);
  assert.equal(intel.entry, 'macos-26-x86_64');
});

test('a macOS version other than 26 is not a matrix entry', () => {
  assert.throws(() => macosPlatform(stubRun({ ...MACOS_ANSWERS, 'sw_vers -productVersion': '15.7\n' }), FACTS),
    /macOS 15.7 is not a matrix entry; it needs macOS 26/);
});

test('the Linux entry is the image release under the engine architecture', () => {
  assert.deepEqual(linuxPlatform(stubRun(LINUX_ANSWERS), IMAGES), {
    entry: 'linux-ubuntu-24.04-arm64',
    platform: {
      os: 'Ubuntu 24.04.3 LTS in containers of the pinned base on Docker Desktop',
      architecture: 'arm64',
      kernel: 'Linux 6.12.76-linuxkit',
      filesystem: 'ext2/ext3 on Docker volumes (the worker data root and the test container\'s temporary directory), storage driver overlay2',
      node: 'v24.22.1',
      docker: 'Docker Desktop 4.50.0 (210000) 29.6.1; Docker Compose 5.2.0',
    },
  });
});

test('another Linux release or architecture is not a matrix entry', () => {
  const noble = 'docker run --rm ubuntu:24.04@sha256:68ee cat /etc/os-release';
  assert.throws(() => linuxPlatform(stubRun({ ...LINUX_ANSWERS, [noble]: 'PRETTY_NAME="Ubuntu 22.04.5 LTS"\n' }), IMAGES),
    /Ubuntu 22.04.5 LTS is not a matrix entry; it needs Ubuntu 24.04/);
  assert.throws(() => matrixArchitecture('riscv64'), /architecture "riscv64" is not a matrix entry/);
  assert.equal(matrixArchitecture('aarch64'), 'arm64');
  for (const machine of ['x86_64', 'amd64', 'x86-64']) assert.equal(matrixArchitecture(machine), 'x86_64');
});

test('the output parsers take mount points with spaces and fail on missing fields', () => {
  assert.equal(dfMountPoint('Filesystem 512-blocks Used Available Capacity Mounted on\nmap 0 0 0 100% /Volumes/My Disk\n'), '/Volumes/My Disk');
  assert.throws(() => dfMountPoint('Filesystem\n'), AcceptanceFailure);
  assert.throws(() => diskutilField('Mount Point: /\n', 'File System Personality'), /no File System Personality/);
  assert.throws(() => osReleaseName('NAME="Ubuntu"\n'), /no PRETTY_NAME/);
  assert.equal(osReleaseName('PRETTY_NAME=Plain\n'), 'Plain');
});

test('a context validates its row against the entry and platform', () => {
  const entryPlatform = macosPlatform(stubRun(MACOS_ANSWERS), FACTS);
  assert.equal(acceptanceContext(entryPlatform, 'cancellation', 'make x').row, 'cancellation');
  assert.throws(() => acceptanceContext(entryPlatform, 'resource-budgets', 'make x'), /row must be one of/);
});

test('the commands parse, and anything else prints the usage', () => {
  assert.deepEqual(parseAcceptanceCommand(['seed']), { name: 'seed' });
  assert.deepEqual(parseAcceptanceCommand(['platform', 'linux']), { name: 'platform', kind: 'linux' });
  assert.deepEqual(parseAcceptanceCommand(['context', 'p.json', 'connectivity', 'make y']),
    { name: 'context', platformFile: 'p.json', row: 'connectivity', proof: 'make y' });
  const record = parseAcceptanceCommand(['record', 'acceptance-x', '12', 'host-test-suite', 'passed', 'tests 3']);
  assert.deepEqual(record, { name: 'record', run: { scenario: 'acceptance-x', seed: 12, target: 'host-test-suite', outcome: 'passed', detail: 'tests 3' } });
  const malformedSeed = parseAcceptanceCommand(['record', 'acceptance-x', '-1', 'host-test-suite', 'passed', 'd']);
  assert.ok(malformedSeed.name === 'record' && Number.isNaN(malformedSeed.run.seed));
  for (const argv of [[], ['platform', 'windows'], ['seed', 'x'], ['record', 'a']]) {
    assert.throws(() => parseAcceptanceCommand(argv), /^AcceptanceFailure: usage:|usage: native-acceptance.ts/);
  }
});

function dependencies(environment: NodeJS.ProcessEnv, recorded: ScenarioRun[]): AcceptanceDependencies {
  const entryPlatform: EntryPlatform = macosPlatform(stubRun(MACOS_ANSWERS), FACTS);
  return {
    seed: () => 7,
    macos: () => entryPlatform,
    linux: () => ({ ...entryPlatform, entry: 'linux-ubuntu-24.04-arm64' }),
    readText: () => JSON.stringify(entryPlatform),
    environment,
    recorder: () => ({ record: async (run) => { recorded.push(run); } }),
  };
}

test('the commands print the seed, the platform, and the context', async () => {
  const deps = dependencies({}, []);
  assert.equal(await runAcceptanceCommand({ name: 'seed' }, deps), '7');
  assert.equal(JSON.parse(await runAcceptanceCommand({ name: 'platform', kind: 'macos' }, deps)).entry, 'macos-26-arm64');
  assert.equal(JSON.parse(await runAcceptanceCommand({ name: 'platform', kind: 'linux' }, deps)).entry, 'linux-ubuntu-24.04-arm64');
  const context = JSON.parse(await runAcceptanceCommand({ name: 'context', platformFile: 'p', row: 'process-ownership', proof: 'make z' }, deps));
  assert.deepEqual([context.entry, context.row, context.proof], ['macos-26-arm64', 'process-ownership', 'make z']);
});

test('a record needs the acceptance context and then reaches the recorder', async () => {
  const run: ScenarioRun = { scenario: 'acceptance-x', seed: 7, target: 'host-test-suite', outcome: 'failed', detail: 'exit status 1' };
  const recorded: ScenarioRun[] = [];
  await assert.rejects(runAcceptanceCommand({ name: 'record', run }, dependencies({}, recorded)), /record needs TASKELITH_ACCEPTANCE/);
  assert.equal(await runAcceptanceCommand({ name: 'record', run }, dependencies({ [ACCEPTANCE_VARIABLE]: '{}' }, recorded)), '');
  assert.deepEqual(recorded, [run]);
});

test('a failed command reports its standard error with its message', () => {
  const error = Object.assign(new Error('Command failed: docker info'), { stderr: 'Cannot connect to the Docker daemon\n' });
  assert.equal(failureText(error), 'Command failed: docker info\nCannot connect to the Docker daemon');
  const buffered = Object.assign(new Error('Command failed: df'), { stderr: Buffer.from('df: no such file\n') });
  assert.equal(failureText(buffered), 'Command failed: df\ndf: no such file');
  assert.equal(failureText(new Error('plain')), 'plain');
  assert.equal(failureText('text'), 'text');
});
