import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, test } from 'node:test';
import { failure } from '@taskelith/kernel';
import { ScenarioProcess, failed, id, value } from '@taskelith/testing';
import {
  ExclusiveFileLock,
  JOURNAL_APPLICATION_ID,
  JOURNAL_FORMAT,
  checkVolume,
  claimWorkerRoot,
  credentialReferencesOf,
  enrollWorkerRoot,
  parseDfMountPoint,
  failureReason,
  hostBootId,
  openWorkerRoot,
  recordJournalFault,
  parseMacMountOptions,
  probeVolume,
  readWorkerCredentials,
  resolveDataRoot,
  startNewIncarnation,
  workerPaths,
  type VolumeProbe,
  type WorkerRoot,
} from '@taskelith/worker-journal';
import { BINDING, ENROLLMENT, digest, rootOptions, temporaryDataRoot } from './fixtures.ts';

let dataRoot: string;
let remove: () => void;
const opened: WorkerRoot[] = [];

beforeEach(() => {
  ({ dataRoot, remove } = temporaryDataRoot());
});

afterEach(() => {
  for (const root of opened.splice(0)) root.close();
  remove();
});

function enroll(): WorkerRoot {
  const root = value(enrollWorkerRoot(rootOptions(dataRoot), ENROLLMENT));
  opened.push(root);
  return root;
}

function reasonOf(result: { ok: boolean }): string | undefined {
  return failureReason(failed(result as never));
}

function fileDigest(path: string): string {
  return digest(readFileSync(path).toString('base64'));
}

test('the data root follows explicit configuration, then TASKELITH_DATA_DIR, then the OS default', () => {
  const environment = { TASKELITH_DATA_DIR: '/srv/taskelith', HOME: '/home/ana', XDG_DATA_HOME: '/xdg' };
  assert.equal(value(resolveDataRoot({ explicit: '/explicit/', environment, platform: 'linux' })), '/explicit');
  assert.equal(value(resolveDataRoot({ environment, platform: 'linux' })), '/srv/taskelith');
  assert.equal(value(resolveDataRoot({ environment: { ...environment, TASKELITH_DATA_DIR: '' }, platform: 'linux' })), '/xdg/taskelith');
  assert.equal(value(resolveDataRoot({ environment: { HOME: '/home/ana', XDG_DATA_HOME: 'relative' }, platform: 'linux' })), '/home/ana/.local/share/taskelith');
  assert.equal(value(resolveDataRoot({ environment: { HOME: '/Users/ana' }, platform: 'darwin' })), '/Users/ana/Library/Application Support/Taskelith');
});

test('an empty, relative, or tilde data root fails instead of falling back', () => {
  for (const explicit of ['', 'data', '~/data']) {
    assert.equal(failed(resolveDataRoot({ explicit, environment: { HOME: '/home/ana' }, platform: 'linux' })).code, 'invalid');
  }
  assert.equal(failed(resolveDataRoot({ environment: { TASKELITH_DATA_DIR: 'relative', HOME: '/h' }, platform: 'linux' })).code, 'invalid');
  assert.equal(failed(resolveDataRoot({ environment: {}, platform: 'darwin' })).code, 'invalid');
  assert.equal(failed(resolveDataRoot({ environment: { HOME: '/h' }, platform: 'win32' })).code, 'invalid');
});

test('enrollment creates the journal before the identity, with private modes', () => {
  const root = enroll();
  const { paths } = root;
  for (const directory of [paths.worker, paths.journalDirectory, paths.executions, paths.logs, paths.workspaces]) {
    assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
  }
  const credentialFiles = [join(paths.credentials, 'control-plane.1'), join(paths.credentials, 'broker.1.creds')];
  for (const file of [paths.lock, paths.identity, paths.journal, `${paths.journal}-wal`, ...credentialFiles]) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
  }
  assert.equal(statSync(paths.credentials).mode & 0o777, 0o700);
  assert.equal(existsSync(`${paths.journal}-shm`), false);
  assert.deepEqual(JSON.parse(readFileSync(paths.identity, 'utf8')), {
    format: 1,
    installationId: BINDING.installationId,
    workerId: BINDING.workerId,
    journalId: BINDING.journalId,
    credentialGeneration: 1,
    credentials: { controlPlane: 'credentials/control-plane.1', broker: 'credentials/broker.1.creds' },
  });
  assert.deepEqual(root.journal.binding, BINDING);
  assert.deepEqual(root.identity.credentials, credentialReferencesOf(1));
  assert.deepEqual(value(readWorkerCredentials(paths, root.identity, process.getuid?.() ?? -1)), ENROLLMENT.credentials);
  assert.equal(failed(enrollWorkerRoot(rootOptions(dataRoot), ENROLLMENT)).code, 'conflict');
});

test('a claim holds the root lock until it completes or is abandoned', () => {
  const claim = value(claimWorkerRoot(rootOptions(dataRoot)));
  const { paths } = claim;
  assert.equal(failed(claimWorkerRoot(rootOptions(dataRoot))).code, 'conflict');
  assert.equal(failed(ExclusiveFileLock.acquire(paths.lock)).code, 'conflict');
  claim.abandon();
  claim.abandon();
  assert.equal(existsSync(paths.worker), false);
  assert.equal(failed(claim.complete(ENROLLMENT)).code, 'conflict');
  const completed = value(claimWorkerRoot(rootOptions(dataRoot)));
  opened.push(value(completed.complete(ENROLLMENT)));
  completed.abandon();
  assert.equal(existsSync(paths.identity), true);
});

test('the credentials are read only while present, nonempty, and safe', () => {
  const { paths, identity } = enroll();
  const uid = process.getuid?.() ?? -1;
  const broker = join(paths.credentials, 'broker.1.creds');
  writeFileSync(broker, '');
  assert.equal(reasonOf(readWorkerCredentials(paths, identity, uid)), 'corrupt');
  rmSync(broker);
  assert.equal(reasonOf(readWorkerCredentials(paths, identity, uid)), 'corrupt');
  symlinkSync(paths.identity, broker);
  assert.equal(reasonOf(readWorkerCredentials(paths, identity, uid)), 'unsafe-path');
  rmSync(join(paths.credentials, 'control-plane.1'));
  assert.equal(reasonOf(readWorkerCredentials(paths, identity, uid)), 'corrupt');
});

test('a group-writable credentials directory fails startup', () => {
  const { paths } = enroll();
  opened.splice(0).forEach((root) => root.close());
  chmodSync(paths.credentials, 0o770);
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'unsafe-path');
});

test('the journal is a Taskelith journal of the current format, reopened with its binding', () => {
  enroll().close();
  opened.length = 0;
  const raw = new DatabaseSync(workerPaths(dataRoot).journal);
  assert.equal(raw.prepare('PRAGMA application_id').get()?.application_id, JOURNAL_APPLICATION_ID);
  assert.equal(raw.prepare('PRAGMA user_version').get()?.user_version, JOURNAL_FORMAT);
  raw.close();
  const root = value(openWorkerRoot(rootOptions(dataRoot)));
  opened.push(root);
  assert.deepEqual(root.journal.binding, BINDING);
});

test('a second worker on the same root fails to take the root lock', () => {
  enroll();
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'root-locked');
});

test('a reopened root holds its existing lock file against a second worker', () => {
  enroll();
  opened.splice(0).forEach((root) => root.close());
  opened.push(value(openWorkerRoot(rootOptions(dataRoot))));
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'root-locked');
});

test('the root lock of a killed process is free, and a live holder keeps it', async () => {
  const lockFile = join(dirname(dataRoot), 'lock');
  const holder = await ScenarioProcess.start(process.execPath, [
    '--input-type=module',
    '-e',
    `import { ExclusiveFileLock } from '@taskelith/worker-journal';
     ExclusiveFileLock.acquire(${JSON.stringify(lockFile)}); console.log('held'); setInterval(() => {}, 1000);`,
  ], { cwd: process.cwd() });
  await holder.waitForOutput('held');
  assert.equal(reasonOf(ExclusiveFileLock.acquire(lockFile)), 'root-locked');
  holder.kill();
  await holder.exited;
  value(ExclusiveFileLock.acquire(lockFile)).release();
});

test('a data root inside a Git working tree is refused', () => {
  mkdirSync(join(dirname(dataRoot), '.git'));
  assert.equal(reasonOf(enrollWorkerRoot(rootOptions(dataRoot), ENROLLMENT)), 'inside-checkout');
});

test('a symbolic link or a group-writable control record fails startup', () => {
  const { paths } = enroll();
  opened.splice(0).forEach((root) => root.close());
  rmSync(paths.logs, { recursive: true });
  symlinkSync(paths.workspaces, paths.logs);
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'unsafe-path');
  rmSync(paths.logs);
  mkdirSync(paths.logs, { mode: 0o700 });
  chmodSync(paths.executions, 0o770);
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'unsafe-path');
  chmodSync(paths.executions, 0o700);
  symlinkSync(paths.logs, join(paths.workspaces, 'link-in-workspace'));
  opened.push(value(openWorkerRoot(rootOptions(dataRoot))));
});

test('without a worker subtree or an identity the worker is not enrolled', () => {
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'not-enrolled');
  const { paths } = enroll();
  opened.splice(0).forEach((root) => root.close());
  rmSync(paths.identity);
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'not-enrolled');
});

test('a missing journal starts nothing until a new incarnation is started explicitly', () => {
  const { paths } = enroll();
  opened.splice(0).forEach((root) => root.close());
  rmSync(paths.journal);
  rmSync(`${paths.journal}-wal`, { force: true });
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'journal-loss');
  assert.equal(existsSync(paths.journal), false);

  const journalId = id('JournalId', 'journal-2');
  const root = value(startNewIncarnation(rootOptions(dataRoot), journalId, BINDING.recoveryEpoch));
  opened.push(root);
  assert.equal(root.journal.binding.journalId, journalId);
  assert.equal(JSON.parse(readFileSync(paths.identity, 'utf8')).journalId, journalId);
});

test('a new incarnation keeps the old journal files aside as evidence', () => {
  const { paths } = enroll();
  opened.splice(0).forEach((root) => root.close());
  const before = fileDigest(paths.journal);
  const root = value(startNewIncarnation(rootOptions(dataRoot), id('JournalId', 'journal-2'), BINDING.recoveryEpoch));
  opened.push(root);
  const evidence = readdirSync(paths.journalDirectory).filter((name) => name.startsWith('evidence-'));
  assert.equal(evidence.length, 1);
  assert.equal(fileDigest(join(paths.journalDirectory, evidence[0]!, 'journal.sqlite')), before);
});

test('a valid SQLite database of another application is refused untouched', () => {
  const { paths } = enroll();
  opened.splice(0).forEach((root) => root.close());
  rmSync(paths.journal);
  rmSync(`${paths.journal}-wal`, { force: true });
  const foreign = new DatabaseSync(paths.journal);
  foreign.exec('CREATE TABLE notes (text TEXT); INSERT INTO notes VALUES (1)');
  foreign.close();
  const before = fileDigest(paths.journal);
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'corrupt');
  assert.equal(fileDigest(paths.journal), before);
  assert.equal(existsSync(`${paths.journal}-wal`), false);
});

test('a -shm file left by another process fails startup and a new incarnation moves it aside', () => {
  const { paths } = enroll();
  opened.splice(0).forEach((root) => root.close());
  writeFileSync(`${paths.journal}-shm`, '');
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'foreign-access');
  opened.push(value(startNewIncarnation(rootOptions(dataRoot), id('JournalId', 'journal-2'), BINDING.recoveryEpoch)));
  assert.equal(existsSync(`${paths.journal}-shm`), false);
});

test('the open journal refuses a second connection, which the root lock alone would not stop', () => {
  const { paths } = enroll();
  const second = new DatabaseSync(paths.journal, { timeout: 0 });
  assert.throws(() => second.prepare('SELECT * FROM journal_meta').get(), (error: { errcode?: number }) => error.errcode === 5);
  second.close();
});

test('a foreign, truncated, bit-flipped, or newer journal fails startup without changing the files', () => {
  const { paths } = enroll();
  opened.splice(0).forEach((root) => root.close());
  const original = readFileSync(paths.journal);
  rmSync(`${paths.journal}-wal`, { force: true });
  const damage: Array<[string, Buffer]> = [
    ['corrupt', Buffer.from('not a database at all, only text that is long enough to be read as a header')],
    ['corrupt', original.subarray(0, 1000)],
    ['corrupt', flipBits(original, 4096)],
  ];
  for (const [reason, content] of damage) {
    writeFileSync(paths.journal, content);
    const before = fileDigest(paths.journal);
    assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), reason);
    assert.equal(fileDigest(paths.journal), before);
  }
  writeFileSync(paths.journal, original);
  const raw = new DatabaseSync(paths.journal);
  raw.exec(`PRAGMA user_version = ${JOURNAL_FORMAT + 1}`);
  raw.close();
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'newer-format');
});

test('a journal that is not the one the identity names fails startup', () => {
  const { paths } = enroll();
  opened.splice(0).forEach((root) => root.close());
  const stored = JSON.parse(readFileSync(paths.identity, 'utf8')) as Record<string, unknown>;
  writeFileSync(paths.identity, JSON.stringify({ ...stored, journalId: 'other' }));
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'binding-mismatch');
  for (const invalid of [{ credentialGeneration: 0 }, { credentials: { controlPlane: '../identity', broker: 'credentials/b' } }, { credentials: null }]) {
    writeFileSync(paths.identity, JSON.stringify({ ...stored, ...invalid }));
    assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'corrupt');
  }
  writeFileSync(paths.identity, JSON.stringify({ format: 2 }));
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'newer-format');
  writeFileSync(paths.identity, '{');
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'corrupt');
});

test('after a flush failure the root stays stopped until the host restarts or a new incarnation', () => {
  const { paths } = enroll();
  opened.splice(0).forEach((root) => root.close());
  const bootId = value(hostBootId());
  const fault = failure('unavailable', 'injected', { reason: 'flush-failure' });
  value(recordJournalFault(paths.fault, fault, bootId));
  assert.equal(reasonOf(openWorkerRoot(rootOptions(dataRoot))), 'flush-failure');

  value(recordJournalFault(paths.fault, fault, 'an-earlier-boot'));
  opened.push(value(openWorkerRoot(rootOptions(dataRoot))));
  assert.equal(existsSync(paths.fault), false);
  opened.splice(0).forEach((root) => root.close());

  value(recordJournalFault(paths.fault, fault, bootId));
  opened.push(value(startNewIncarnation(rootOptions(dataRoot), id('JournalId', 'journal-2'), BINDING.recoveryEpoch)));
  assert.equal(existsSync(paths.fault), false);
});

test('a leftover temporary file is removed on start', () => {
  const { paths } = enroll();
  opened.splice(0).forEach((root) => root.close());
  const leftover = join(paths.worker, '.identity.tmp-0123456789abcdef');
  writeFileSync(leftover, 'partial', { mode: 0o600 });
  opened.push(value(openWorkerRoot(rootOptions(dataRoot))));
  assert.equal(existsSync(leftover), false);
});

test('only local APFS is accepted on macOS, and remote or volatile filesystems on Linux are refused', () => {
  const darwin = (filesystem: string, local = true): VolumeProbe => () => ({ ok: true, value: { platform: 'darwin', filesystem, local } });
  const linux = (magic: bigint): VolumeProbe => () => ({ ok: true, value: { platform: 'linux', magic } });
  value(checkVolume('/data', darwin('apfs')));
  assert.equal(reasonOf(checkVolume('/data', darwin('msdos'))), 'unsupported-volume');
  assert.equal(reasonOf(checkVolume('/data', darwin('apfs', false))), 'unsupported-volume');
  value(checkVolume('/data', linux(0xef53n)));
  for (const magic of [0x6969n, 0x794c7630n, 0x01021994n]) assert.equal(reasonOf(checkVolume('/data', linux(magic))), 'unsupported-volume');
  assert.equal(reasonOf(enrollWorkerRoot(rootOptions(dataRoot, { probe: darwin('hfs') }), ENROLLMENT)), 'unsupported-volume');
});

test('the real probe describes the test volume and parses df and mount output', () => {
  const described = value(probeVolume(dirname(dataRoot)));
  assert.equal(described.platform, process.platform);
  if (process.platform === 'darwin') value(checkVolume(dirname(dataRoot), probeVolume));
  assert.equal(parseDfMountPoint('Filesystem 512-blocks Used Available Capacity Mounted on\nmap auto_home 0 0 0 100% /System/Volumes/Data/home\n'), '/System/Volumes/Data/home');
  assert.equal(parseDfMountPoint('header only'), undefined);
  const mounts = '/dev/disk1 on / (apfs, local, journaled)\n/dev/disk5s1 on /Volumes/My Disk (msdos, local, nodev)';
  assert.deepEqual(parseMacMountOptions(mounts, '/Volumes/My Disk'), ['msdos', 'local', 'nodev']);
  assert.equal(parseMacMountOptions(mounts, '/missing'), undefined);
});

// The real startup check on a mounted FAT image: only local APFS passes.
test('on macOS a data root on a volume that is not local APFS is refused', { skip: process.platform !== 'darwin' }, () => {
  const image = join(dirname(dataRoot), 'fat.dmg');
  const mountPoint = join(dirname(dataRoot), 'fat');
  execFileSync('hdiutil', ['create', '-quiet', '-size', '16m', '-fs', 'MS-DOS FAT16', '-volname', 'TJFAT', image]);
  execFileSync('hdiutil', ['attach', '-quiet', '-nobrowse', '-mountpoint', mountPoint, image]);
  try {
    assert.equal(reasonOf(enrollWorkerRoot(rootOptions(join(mountPoint, 'data'), { probe: probeVolume }), ENROLLMENT)), 'unsupported-volume');
    assert.equal(existsSync(join(mountPoint, 'data')), false);
  } finally {
    execFileSync('hdiutil', ['detach', '-quiet', '-force', mountPoint]);
  }
});

function flipBits(content: Buffer, offset: number): Buffer {
  const copy = Buffer.from(content);
  for (let index = offset; index < offset + 64 && index < copy.length; index++) copy[index] = copy[index]! ^ 0xff;
  return copy;
}
