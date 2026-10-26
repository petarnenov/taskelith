import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { LaunchAuthorityClient } from '@taskelith/execution';
import { ok, type Result } from '@taskelith/kernel';
import { TRANSPORT_LIMITS, type TransportConnection } from '@taskelith/nats';
import { SeededRandom, seedFromEnvironment } from '@taskelith/testing';
import {
  productionDependencies,
  serveUntilStopped,
  workerMain,
  type ExecutionSupervision,
  type LaunchHost,
  type WorkerDependencies,
  type WorkerSettings,
} from '@taskelith/worker';
import { startDetachedProcess } from '@taskelith/worker-supervisor';
import { armedPoint, HOLD_NOT_STARTED_VARIABLE, noteOrder, reachCrashPoint } from './crash-hook.ts';

// The real worker of a crash scenario: the production composition with
// test timings, seeded jitter, and crash points at the supervision port.
const ARMED_SUPERVISOR = new URL('./armed-supervisor.ts', import.meta.url).pathname;
const POLL_MILLISECONDS = 100;
const LIMITS = { ...TRANSPORT_LIMITS, ackWaitMilliseconds: 3_000, retryInitialMilliseconds: 100, retryMaxMilliseconds: 500, idlePollMilliseconds: 50 };
const random = new SeededRandom(seedFromEnvironment());
const draw = () => random.nextUint32() / 2 ** 32;
const BARRIER_MILLISECONDS = 20_000;

// The host's free space and the daemon's overhead are not under test; a
// busy test host must not refuse the offer.
function composedDependencies(settings: WorkerSettings): WorkerDependencies {
  const production = productionDependencies(settings);
  const launching = production.launching!;
  const hold = process.env[HOLD_NOT_STARTED_VARIABLE] === '1' ? new NotStartedHold() : undefined;
  return {
    ...production, draw, limits: LIMITS,
    space: () => ok({ availableBytes: 2 ** 40, totalBytes: 2 ** 41 }),
    daemon: { residentBytes: () => ok(0), eventLoopLagMilliseconds: () => ok(0), watch: async () => undefined },
    ...(hold === undefined ? {} : { connect: async (endpoint) => hold.connection(await production.connect(endpoint)) }),
    launching: {
      ...launching, draw, pollMilliseconds: POLL_MILLISECONDS,
      host: (hostSettings, executions) => armedHost(launching.host(hostSettings, executions), executions),
      ...(hold === undefined ? {} : { authority: (credential) => hold.authority(launching.authority(credential)) }),
    },
  };
}

// D1 needs the relaunch's answer before the control plane processes the
// sealed execution's `not-started`; the hold makes that order certain.
class NotStartedHold {
  readonly #answered = new Set<string>();

  authority(client: LaunchAuthorityClient): LaunchAuthorityClient {
    return {
      authorize: async (request) => {
        const outcome = await client.authorize(request);
        if (outcome.ok) {
          const { value } = outcome;
          noteOrder(`answered ${request.executionId} ${value.kind}${value.kind === 'rejected' ? ` ${value.rejection.reason}` : ''}`);
          this.#answered.add(request.executionId);
        }
        return outcome;
      },
    };
  }

  connection(connected: Result<TransportConnection>): Result<TransportConnection> {
    if (!connected.ok) return connected;
    const { js } = connected.value;
    const publish: typeof js.publish = async (subject, data, options) => {
      const notStarted = notStartedExecution(data);
      if (notStarted !== undefined) await this.#heldUntilAnotherAnswer(notStarted);
      return js.publish(subject, data, options);
    };
    return ok({ ...connected.value, js: new Proxy(js, { get: (target, key) => (key === 'publish' ? publish : bound(target, key)) }) });
  }

  async #heldUntilAnotherAnswer(executionId: string): Promise<void> {
    const deadline = Date.now() + BARRIER_MILLISECONDS;
    const answered = () => [...this.#answered].some((other) => other !== executionId);
    while (!answered() && Date.now() < deadline) await delay(POLL_MILLISECONDS);
    noteOrder(`${answered() ? 'published' : 'released by the bound'} not-started ${executionId}`);
  }
}

function bound(target: object, key: string | symbol): unknown {
  const member: unknown = Reflect.get(target, key);
  return typeof member === 'function' ? member.bind(target) : member;
}

function notStartedExecution(data: unknown): string | undefined {
  if (!(data instanceof Uint8Array)) return undefined;
  try {
    const { metadata, payload } = JSON.parse(new TextDecoder().decode(data));
    return metadata?.observationType === 'execution.not-started' ? payload?.executionId : undefined;
  } catch {
    return undefined;
  }
}

function armedHost(host: Result<LaunchHost>, executions: string): Result<LaunchHost> {
  if (!host.ok) return host;
  const { supervision } = host.value;
  return ok({ ...host.value, supervision: (executionId) => armedSupervision(supervision(executionId), join(executions, executionId)) });
}

// CP1 to CP4 around the record and the supervisor's start; the journal
// wrapper reaches CP10 and CP12 (supervisor contract, section 4).
function armedSupervision(supervision: ExecutionSupervision, directory: string): ExecutionSupervision {
  return {
    prepare: async (plan) => {
      reachCrashPoint('CP1');
      return reachedOn(await supervision.prepare(plan), 'CP2');
    },
    start: async () => {
      reachCrashPoint('CP3');
      const started = await startArmedSupervisor(directory);
      if (started.ok && armedPoint === 'CP4') await awaitClaim(directory);
      return reachedOn(started, 'CP4');
    },
    read: () => supervision.read(),
    seal: () => supervision.seal(),
    cancel: (reason) => supervision.cancel(reason),
    recover: (round) => supervision.recover(round),
    remove: () => supervision.remove(),
  };
}

// A crash at CP4 may come before or after the supervisor's claim; the
// scenario takes the claim first, so recovery adopts a claimed record.
async function awaitClaim(directory: string): Promise<void> {
  const deadline = Date.now() + BARRIER_MILLISECONDS;
  while (!claimed(directory) && Date.now() < deadline) await delay(POLL_MILLISECONDS / 10);
  noteOrder(claimed(directory) ? 'CP4 after the claim' : 'CP4 without a claim within the bound');
}

function claimed(directory: string): boolean {
  try {
    return JSON.parse(readFileSync(join(directory, 'launch'), 'utf8')).kind === 'claim';
  } catch {
    return false;
  }
}

function reachedOn<T>(result: Result<T>, point: string): Result<T> {
  if (result.ok) reachCrashPoint(point);
  return result;
}

// The launch supervisor is the real program with armed crash points; an
// adopting one stays the product's, so recovery runs unchanged.
function startArmedSupervisor(directory: string): Promise<Result<void>> {
  return startDetachedProcess({ executable: process.execPath, arguments: ['--experimental-strip-types', ARMED_SUPERVISOR, 'launch', directory] });
}

const writeLine = (line: string) => void process.stderr.write(`${line}\n`);
const worker = await workerMain(process.env, writeLine, composedDependencies);
if (worker === undefined) process.exitCode = 1;
else await serveUntilStopped(worker, process, writeLine);
