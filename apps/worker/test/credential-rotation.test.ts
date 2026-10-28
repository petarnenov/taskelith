import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import type { CredentialRenewalClient, CredentialRenewalRequest, RenewedCredentials } from '@taskelith/fleet';
import { err, failure, ok, parseInstant, type Failure, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { id, value } from '@taskelith/testing';
import { CredentialRotation, type CredentialRotationOptions } from '@taskelith/worker';
import {
  enrollWorkerRoot,
  readIdentity,
  readPendingGeneration,
  type WorkerEnrollment,
  type WorkerRoot,
} from '@taskelith/worker-journal';

const T0 = value(parseInstant('2026-10-25T09:00:00.000Z'));
const DEADLINE = value(parseInstant('2026-11-01T09:00:00.000Z'));
const BEARER_1 = `tkwk_${'A'.repeat(43)}`;
const ENROLLMENT: WorkerEnrollment = {
  installationId: id('InstallationId', 'a'.repeat(32)), workerId: id('WorkerId', `w${'b'.repeat(32)}`), journalId: id('JournalId', 'c'.repeat(32)),
  recoveryEpoch: 1 as WorkerEnrollment['recoveryEpoch'], credentialGeneration: 1,
  credentials: { controlPlane: BEARER_1, broker: 'creds of generation 1' }, installationCa: 'installation CA PEM',
};
const VOLUME = () => ({ ok: true as const, value: { platform: 'darwin' as const, filesystem: 'apfs', local: true } });

// A promise with its resolver, so a test waits for an event, not a time.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

// Answers each call from its queue and announces it to the waiting test.
class FakeRenewal implements CredentialRenewalClient {
  readonly renewals: Array<{ bearer: string; request: CredentialRenewalRequest }> = [];
  readonly confirmations: Array<{ bearer: string; generation: number }> = [];
  renewAnswers: Array<Result<RenewedCredentials>> = [];
  confirmAnswers: Array<Result<void>> = [];
  #renewed = deferred<void>();
  #confirmed = deferred<void>();

  async renew(bearer: string, request: CredentialRenewalRequest): Promise<Result<RenewedCredentials>> {
    this.renewals.push({ bearer, request });
    const { credentialGeneration } = request;
    const answer = this.renewAnswers.shift() ?? ok({ credentialGeneration, brokerUserJwt: `jwt-${credentialGeneration}`, deadline: DEADLINE });
    this.#renewed.resolve();
    return answer;
  }

  async confirm(bearer: string, generation: number): Promise<Result<void>> {
    this.confirmations.push({ bearer, generation });
    const answer = this.confirmAnswers.shift() ?? ok(undefined);
    this.#confirmed.resolve();
    return answer;
  }

  async renewed(count: number): Promise<void> {
    while (this.renewals.length < count) await this.#next('renew');
  }

  async confirmed(count: number): Promise<void> {
    while (this.confirmations.length < count) await this.#next('confirm');
  }

  async #next(kind: 'renew' | 'confirm'): Promise<void> {
    const waiting = kind === 'renew' ? this.#renewed : this.#confirmed;
    await waiting.promise;
    if (kind === 'renew') this.#renewed = deferred<void>();
    else this.#confirmed = deferred<void>();
  }
}

let base: string;
let root: WorkerRoot;
let renewal: FakeRenewal;
let sink: InMemoryLogSink;
let redials: number;
let sleeps: number[];
const stops: AbortController[] = [];

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'taskelith-rotation-')));
  root = value(enrollWorkerRoot({ dataRoot: join(base, 'data'), clock: { now: () => T0 }, probe: VOLUME }, ENROLLMENT));
  renewal = new FakeRenewal();
  sink = new InMemoryLogSink();
  redials = 0;
  sleeps = [];
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop.abort();
  root.close();
  rmSync(base, { recursive: true, force: true });
});

// Resolved by the re-dial of the driver that `options` made last.
let onRedial = deferred<void>();

function options(overrides: Partial<CredentialRotationOptions> = {}): CredentialRotationOptions {
  onRedial = deferred<void>();
  const announce = onRedial;
  return {
    paths: root.paths, identity: value(readIdentity(root.paths.identity)), renewal,
    redial: () => {
      redials += 1;
      announce.resolve();
    },
    // A retry waits for the stop or a wake, never for time.
    sleep: (milliseconds, signal) => {
      sleeps.push(milliseconds);
      if (signal.aborted) return Promise.resolve();
      return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    },
    draw: () => 0,
    logger: new Logger(sink, { now: () => T0 }),
    ...overrides,
  };
}

function started(rotationOptions = options()): { rotation: CredentialRotation; running: Promise<void>; stop: AbortController } {
  const rotation = value(CredentialRotation.open(rotationOptions));
  const stop = new AbortController();
  stops.push(stop);
  return { rotation, running: rotation.run(stop.signal), stop };
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

test('a notice for the next generation renews it, adopts it, re-dials, and confirms after the new link', async () => {
  const { rotation } = started();
  const announced = onRedial;
  assert.deepEqual(rotation.requested({ credentialGeneration: 2 }), ok(undefined));
  const pending = value(readPendingGeneration(root.paths, 2))!;
  assert.equal(pending.controlPlane.startsWith('tkwk_'), true, 'the generator the control plane uses');

  await renewal.renewed(1);
  const [{ bearer, request }] = renewal.renewals;
  assert.equal(bearer, BEARER_1, 'renewed with the confirmed generation');
  assert.equal(request.credentialGeneration, 2);
  assert.match(request.brokerUserPublicKey, /^U[A-Z2-7]{55}$/);
  assert.equal(request.controlPlaneSecretSha256, sha256(pending.controlPlane), 'only the hash leaves the worker');

  await announced.promise;
  const adopted = value(readIdentity(root.paths.identity));
  assert.equal(adopted.credentialGeneration, 2);
  assert.equal(adopted.previous?.credentialGeneration, 1);
  assert.equal(rotation.bearer(), pending.controlPlane);
  assert.deepEqual(rotation.brokerCandidates().map(({ generation }) => generation), [2, 1]);
  assert.match(rotation.brokerCandidates()[0]!.creds, /jwt-2/);
  assert.deepEqual(renewal.confirmations, [], 'no confirmation before a link with generation 2');

  rotation.linked(2);
  await renewal.confirmed(1);
  assert.deepEqual(renewal.confirmations, [{ bearer: pending.controlPlane, generation: 2 }]);
  await waitUntil(() => value(readIdentity(root.paths.identity)).previous === undefined);
  assert.deepEqual(rotation.brokerCandidates().map(({ generation }) => generation), [2]);
  for (const name of ['control-plane.1', 'broker.1.creds', 'pending.2']) assert.equal(existsSync(join(root.paths.credentials, name)), false, name);
  const logged = JSON.stringify(sink.records);
  for (const secret of [BEARER_1, pending.controlPlane, pending.brokerSeed]) assert.equal(logged.includes(secret), false, 'no secret is logged');
});

test('a worker restarted between the adoption and the confirmation continues on N+1 and confirms it', async () => {
  const first = started();
  const announced = onRedial;
  value(first.rotation.requested({ credentialGeneration: 2 }));
  await announced.promise;
  first.stop.abort();
  await first.running;
  const bearer2 = value(readPendingGeneration(root.paths, 2))!.controlPlane;

  const restarted = started();
  assert.deepEqual(restarted.rotation.brokerCandidates().map(({ generation }) => generation), [2, 1], 'N+1 first, N kept');
  assert.equal(restarted.rotation.bearer(), bearer2);
  restarted.rotation.linked(2);
  await renewal.confirmed(1);
  assert.deepEqual(renewal.confirmations, [{ bearer: bearer2, generation: 2 }]);
  assert.equal(renewal.renewals.length, 1, 'no second renewal');
  await waitUntil(() => value(readIdentity(root.paths.identity)).previous === undefined);
});

test('a worker restarted after storing the pending generation renews it with the same material', async () => {
  const first = started();
  renewal.renewAnswers = [err(failure('unavailable', 'the control plane did not answer'))];
  value(first.rotation.requested({ credentialGeneration: 2 }));
  await renewal.renewed(1);
  first.stop.abort();
  await first.running;

  started();
  await renewal.renewed(2);
  assert.deepEqual(renewal.renewals[1]!.request, renewal.renewals[0]!.request, 'the stored key and secret are renewed again');
});

test('a start after a crash in the removal of the confirmed predecessor removes its files', async () => {
  const first = started();
  value(first.rotation.requested({ credentialGeneration: 2 }));
  const pending = readFileSync(join(root.paths.credentials, 'pending.2'), 'utf8');
  await renewal.renewed(1);
  first.rotation.linked(2);
  await renewal.confirmed(1);
  await waitUntil(() => !existsSync(join(root.paths.credentials, 'pending.2')));
  first.stop.abort();
  await first.running;
  const superseded = { 'control-plane.1': BEARER_1, 'broker.1.creds': ENROLLMENT.credentials.broker, 'pending.2': pending };
  const crashes = [['control-plane.1', 'broker.1.creds', 'pending.2'], ['broker.1.creds', 'pending.2'], ['pending.2']] as const;
  for (const left of crashes) {
    for (const name of left) writeFileSync(join(root.paths.credentials, name), superseded[name], { mode: 0o600 });
    started();
    for (const name of left) assert.equal(existsSync(join(root.paths.credentials, name)), false, `${name} after ${left.join(', ')}`);
  }
  assert.equal(value(readIdentity(root.paths.identity)).credentialGeneration, 2);
  assert.equal(existsSync(join(root.paths.credentials, 'control-plane.2')), true, 'the confirmed generation stays');
});

test('a refused renewal ends the round with a log line; no answer is retried after the delay', async () => {
  renewal.renewAnswers = [err(failure('conflict', 'renewWorkerCredentials answered 409', { reason: 'rotation-not-requested' }))];
  const { rotation } = started();
  value(rotation.requested({ credentialGeneration: 2 }));
  await renewal.renewed(1);
  await waitUntil(() => sink.records.some(({ event }) => event === 'worker.credentials.renewal-refused'));
  assert.deepEqual(sleeps, [], 'a refusal waits for the next notice or start');
  assert.equal(value(readIdentity(root.paths.identity)).credentialGeneration, 1);

  renewal.renewAnswers = [err(failure('unavailable', 'the control plane did not answer'))];
  value(rotation.requested({ credentialGeneration: 2 }));
  await renewal.renewed(2);
  await waitUntil(() => sleeps.length === 1);
  assert.equal(sleeps[0], 5000, 'the first launch retry delay at no jitter');
});

test('a renewal or confirmation that the control plane failed with 500 is retried after the delay', async () => {
  const answered500 = (operation: string) => err(failure('internal', `${operation} answered 500`, { status: '500' }));
  renewal.renewAnswers = [answered500('renewWorkerCredentials')];
  renewal.confirmAnswers = [answered500('confirmWorkerCredentials')];
  // Each retry delay ends at once, so the retried call follows it.
  const { rotation } = started(options({ sleep: async (milliseconds) => {
    sleeps.push(milliseconds);
  } }));
  const ended = (operation: string, delays: number) =>
    sleeps.length === delays || sink.records.some(({ event }) => event === `worker.credentials.${operation}-refused`);
  value(rotation.requested({ credentialGeneration: 2 }));
  await waitUntil(() => ended('renewal', 1));
  assert.deepEqual(sleeps, [5000], 'a 500 decided nothing, so the renewal is retried');
  await renewal.renewed(2);
  rotation.linked(2);
  await waitUntil(() => ended('confirmation', 2));
  assert.deepEqual(sleeps, [5000, 5000], 'a 500 decided nothing, so the confirmation is retried');
  await renewal.confirmed(2);
  await waitUntil(() => value(readIdentity(root.paths.identity)).previous === undefined);
});

test('a notice for another generation stores nothing', async () => {
  const { rotation } = started();
  assert.deepEqual(rotation.requested({ credentialGeneration: 3 }), ok(undefined));
  assert.deepEqual(rotation.requested({ credentialGeneration: 1 }), ok(undefined));
  assert.equal(value(readPendingGeneration(root.paths, 3)), undefined);
  assert.equal(value(readPendingGeneration(root.paths, 2)), undefined);
  assert.equal(sink.records.filter(({ event }) => event === 'worker.credentials.notice-ignored').length, 2);
});

test('a next notice while a confirmation answer was lost is stored, then renewed after that confirmation', async () => {
  renewal.confirmAnswers = [err(failure('unavailable', 'the confirmation answer was lost'))];
  const { rotation } = started();
  value(rotation.requested({ credentialGeneration: 2 }));
  const bearer2 = value(readPendingGeneration(root.paths, 2))!.controlPlane;
  await renewal.renewed(1);
  rotation.linked(2);
  await renewal.confirmed(1);
  await waitUntil(() => sleeps.length === 1);

  assert.deepEqual(rotation.requested({ credentialGeneration: 3 }), ok(undefined));
  assert.notEqual(value(readPendingGeneration(root.paths, 3)), undefined, 'durable before the acknowledgement');
  await renewal.renewed(2);
  assert.deepEqual(renewal.confirmations.map(({ generation }) => generation), [2, 2], 'generation 2 is confirmed first');
  assert.equal(renewal.renewals[1]!.bearer, bearer2);
  assert.equal(renewal.renewals[1]!.request.credentialGeneration, 3);
  await waitUntil(() => value(readIdentity(root.paths.identity)).credentialGeneration === 3);
});

test('a link that stays on the predecessor after the re-dial is retried after the delay', async () => {
  const { rotation } = started();
  const announced = onRedial;
  value(rotation.requested({ credentialGeneration: 2 }));
  await announced.promise;
  rotation.linked(1);
  await waitUntil(() => sleeps.length === 1);
  assert.deepEqual(renewal.confirmations, []);
  assert.equal(redials, 1);
});

test('a refused confirmation keeps both generations for the next start', async () => {
  renewal.confirmAnswers = [err(failure('conflict', 'confirmWorkerCredentials answered 409', { reason: 'confirmation-mismatch' }))];
  const { rotation } = started();
  value(rotation.requested({ credentialGeneration: 2 }));
  await renewal.renewed(1);
  rotation.linked(2);
  await renewal.confirmed(1);
  await waitUntil(() => sink.records.some(({ event }) => event === 'worker.credentials.confirmation-refused'));
  assert.equal(value(readIdentity(root.paths.identity)).previous?.credentialGeneration, 1);
  assert.equal(readFileSync(join(root.paths.credentials, 'control-plane.1'), 'utf8'), BEARER_1);
});

test('a pending file whose seed is not an NKey user seed fails the driver', async () => {
  const { rotation, running } = started();
  const stored = { format: 1, credentialGeneration: 2, controlPlane: 'tkwk_x', brokerSeed: 'not-a-seed' };
  writeFileSync(join(root.paths.credentials, 'pending.2'), JSON.stringify(stored), { mode: 0o600 });
  value(rotation.requested({ credentialGeneration: 2 }));
  const thrown = await running.then(() => undefined, (error: unknown) => error as Failure);
  assert.equal(thrown?.code, 'internal');
});

// Polls a condition the driver reaches through file writes; it yields to
// the event loop between checks and gives up after many turns.
async function waitUntil(condition: () => boolean): Promise<void> {
  for (let turn = 0; turn < 10_000; turn += 1) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('the condition was never reached');
}
