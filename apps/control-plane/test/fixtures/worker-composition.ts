import { join } from 'node:path';
import { ok, type Result } from '@taskelith/kernel';
import { TRANSPORT_LIMITS } from '@taskelith/nats';
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
import { reachCrashPoint } from './crash-hook.ts';

// The real worker of a crash scenario: the production composition with
// test timings, seeded jitter, and crash points at the supervision port.
const ARMED_SUPERVISOR = new URL('./armed-supervisor.ts', import.meta.url).pathname;
const POLL_MILLISECONDS = 100;
const LIMITS = { ...TRANSPORT_LIMITS, ackWaitMilliseconds: 3_000, retryInitialMilliseconds: 100, retryMaxMilliseconds: 500, idlePollMilliseconds: 50 };
const random = new SeededRandom(seedFromEnvironment());
const draw = () => random.nextUint32() / 2 ** 32;

// The host's free space and the daemon's overhead are not under test; a
// busy test host must not refuse the offer.
function composedDependencies(settings: WorkerSettings): WorkerDependencies {
  const production = productionDependencies(settings);
  const launching = production.launching!;
  return {
    ...production, draw, limits: LIMITS,
    space: () => ok({ availableBytes: 2 ** 40, totalBytes: 2 ** 41 }),
    daemon: { residentBytes: () => ok(0), eventLoopLagMilliseconds: () => ok(0), watch: async () => undefined },
    launching: {
      ...launching, draw, pollMilliseconds: POLL_MILLISECONDS,
      host: (hostSettings, executions) => armedHost(launching.host(hostSettings, executions), executions),
    },
  };
}

function armedHost(host: Result<LaunchHost>, executions: string): Result<LaunchHost> {
  if (!host.ok) return host;
  const { supervision } = host.value;
  return ok({ ...host.value, supervision: (executionId) => armedSupervision(supervision(executionId), join(executions, executionId)) });
}

// CP1 to CP4 around the record and the supervisor's start, CP10 and CP12
// when the worker reads the handle and the exit (supervisor contract, 4).
function armedSupervision(supervision: ExecutionSupervision, directory: string): ExecutionSupervision {
  return {
    prepare: async (plan) => {
      reachCrashPoint('CP1');
      return reachedOn(await supervision.prepare(plan), 'CP2');
    },
    start: async () => {
      reachCrashPoint('CP3');
      return reachedOn(await startArmedSupervisor(directory), 'CP4');
    },
    read: async () => {
      const facts = await supervision.read();
      if (facts.ok && facts.value.process !== undefined) reachCrashPoint('CP10');
      if (facts.ok && facts.value.exit !== undefined) reachCrashPoint('CP12');
      return facts;
    },
    seal: () => supervision.seal(),
    cancel: (reason) => supervision.cancel(reason),
    recover: (round) => supervision.recover(round),
    remove: () => supervision.remove(),
  };
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
