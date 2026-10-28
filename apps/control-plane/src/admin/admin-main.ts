import { parseArgs } from 'node:util';
import { resolveDataRoot } from '@taskelith/data-root';
import type { HostArchitecture, HostConstraints, HostPlatform, WorkerAdmissionSnapshot } from '@taskelith/fleet';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { redactFailure, redactSecrets } from '@taskelith/secrets';
import { readBrokerTls } from '../broker-tls.js';
import { readServiceEndpoints, type Environment } from '../service-endpoints.js';
import { Administration } from './administration.js';
import { readServerHosts } from './server-hosts.js';

export const ADMIN_USAGE = [
  'usage: control-plane-admin COMMAND [options]',
  '  init --actor WHO --reason WHY',
  '  reset-operator-credential --actor WHO --reason WHY',
  '  issue-installation-certificates',
  '  issue-enrollment-token [--platform linux|darwin] [--architecture x64|arm64] [--hostname NAME]',
  '  rotate-worker WORKER_ID --actor WHO --reason WHY',
  '  revoke-worker WORKER_ID | expire-grace-windows',
  '  worker-admission',
  'The last five read the operator credential from TASKELITH_OPERATOR_TOKEN.',
].join('\n');

export interface AdminIo {
  readonly environment: Environment;
  readonly platform: NodeJS.Platform;
  readonly ownerUid: number;
  write(line: string): void;
}

// Runs one administrative command and returns the exit status: 0, 1 for a
// failed command, 2 for a usage error. Secrets in failures are redacted.
export async function adminMain(argv: readonly string[], io: AdminIo): Promise<number> {
  const parsed = parse(argv);
  if (!parsed.ok) {
    io.write(`${redactSecrets(parsed.error.message)}\n${ADMIN_USAGE}`);
    return 2;
  }
  try {
    return await runCommand(parsed.value, io);
  } catch (error) {
    return fail(io, failure('internal', error instanceof Error ? error.message : String(error)));
  }
}

async function runCommand(command: Command, io: AdminIo): Promise<number> {
  const opened = openAdministration(io, command.name);
  if (!opened.ok) return fail(io, opened.error);
  try {
    const outcome = await run(opened.value, command, io.environment);
    if (!outcome.ok) return fail(io, outcome.error);
    io.write(JSON.stringify(outcome.value));
    return 0;
  } finally {
    await opened.value.close();
  }
}

interface Command {
  readonly name: string;
  readonly worker?: string;
  readonly values: Readonly<Record<string, string | undefined>>;
}

const OPTIONS = {
  actor: { type: 'string' }, reason: { type: 'string' },
  platform: { type: 'string' }, architecture: { type: 'string' }, hostname: { type: 'string' },
} as const;
const WORKER_COMMANDS = new Set(['rotate-worker', 'revoke-worker']);
// It restores a lost installation-ca.pem, so it must not need the broker CA.
const BROKERLESS_COMMANDS = new Set(['issue-installation-certificates']);
const PLATFORMS = new Set<string>(['linux', 'darwin']);
const ARCHITECTURES = new Set<string>(['x64', 'arm64']);
const COMMANDS = new Set([
  'init', 'reset-operator-credential', 'issue-installation-certificates', 'issue-enrollment-token', 'expire-grace-windows',
  'worker-admission', ...WORKER_COMMANDS,
]);

function parse(argv: readonly string[]): Result<Command> {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true; args: string[] }>>;
  try {
    parsed = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true });
  } catch (error) {
    return err(failure('invalid', (error as Error).message));
  }
  const [name, worker, ...extra] = parsed.positionals;
  if (name === undefined || !COMMANDS.has(name)) return err(failure('invalid', `unknown command ${name ?? '(none)'}`));
  const arity = WORKER_COMMANDS.has(name) ? 1 : 0;
  if ((worker === undefined ? 0 : 1) !== arity || extra.length > 0) return err(failure('invalid', `wrong arguments for ${name}`));
  const { platform, architecture } = parsed.values;
  if (platform !== undefined && !PLATFORMS.has(platform)) return err(failure('invalid', `unknown platform ${platform}`));
  if (architecture !== undefined && !ARCHITECTURES.has(architecture)) return err(failure('invalid', `unknown architecture ${architecture}`));
  return ok({ name, ...(worker === undefined ? {} : { worker }), values: parsed.values });
}

function openAdministration(io: AdminIo, commandName: string): Result<Administration> {
  const endpoints = readServiceEndpoints(io.environment);
  if (!endpoints.ok) return endpoints;
  const dataRoot = resolveDataRoot({ environment: io.environment, platform: io.platform });
  if (!dataRoot.ok) return dataRoot;
  const natsTls = BROKERLESS_COMMANDS.has(commandName) ? ok(undefined) : readBrokerTls(io.environment, dataRoot.value, io.ownerUid);
  if (!natsTls.ok) return natsTls;
  const serverHosts = readServerHosts(io.environment);
  if (!serverHosts.ok) return serverHosts;
  return Administration.open({
    dataRoot: dataRoot.value, ownerUid: io.ownerUid, postgres: endpoints.value.postgres, nats: endpoints.value.nats,
    serverHosts: serverHosts.value,
    ...(natsTls.value === undefined ? {} : { natsTls: natsTls.value }),
  });
}

async function run(admin: Administration, command: Command, environment: Environment): Promise<Result<unknown>> {
  const invocation = { actor: command.values.actor ?? '', reason: command.values.reason ?? '' };
  const operator = environment.TASKELITH_OPERATOR_TOKEN ?? '';
  switch (command.name) {
    case 'init':
      return admin.initialize(invocation);
    case 'reset-operator-credential':
      return mapped(await admin.resetOperatorCredential(invocation), (operatorSecret) => ({ operatorSecret }));
    case 'issue-installation-certificates':
      return admin.issueInstallationCertificates();
    case 'issue-enrollment-token':
      return admin.issueEnrollmentToken(operator, constraints(command.values));
    case 'rotate-worker':
      return admin.rotateWorker(operator, command.worker!, invocation);
    case 'revoke-worker':
      return mapped(await admin.revokeWorker(operator, command.worker!), (revocation) => revocation.commandConsumerRemoved
        ? { revoked: command.worker }
        : { revoked: command.worker, commandConsumerRemoved: false, retry: 'a control-plane start retries the removal while the worker is among the latest revoked' });
    case 'worker-admission':
      return mapped(await admin.workerAdmission(operator), printableWorkerAdmission);
    default:
      return mapped(await admin.expireGraceWindows(operator), (expired) => ({ expired }));
  }
}

// The workers view with each detail redacted again, since a worker wrote
// it (worker admission contract section 3).
export function printableWorkerAdmission(snapshot: WorkerAdmissionSnapshot): WorkerAdmissionSnapshot {
  return {
    ...snapshot,
    workers: snapshot.workers.map((worker) => ({
      ...worker,
      results: worker.results.map((result) => ({ ...result, details: result.details.map((detail) => redactSecrets(detail)) })),
    })),
  };
}

function constraints(values: Command['values']): HostConstraints {
  return {
    ...(values.platform === undefined ? {} : { platform: values.platform as HostPlatform }),
    ...(values.architecture === undefined ? {} : { architecture: values.architecture as HostArchitecture }),
    ...(values.hostname === undefined ? {} : { hostname: values.hostname }),
  };
}

function mapped<T, U>(result: Result<T>, map: (value: T) => U): Result<U> {
  return result.ok ? ok(map(result.value)) : result;
}

function fail(io: AdminIo, error: Parameters<typeof redactFailure>[0]): number {
  io.write(JSON.stringify({ error: redactFailure(error) }));
  return 1;
}

// The administrative entry the `make` targets of item 23 run on the host.
if (import.meta.main) {
  process.exitCode = await adminMain(process.argv.slice(2), {
    environment: process.env,
    platform: process.platform,
    ownerUid: process.getuid?.() ?? 0,
    write: (line) => process.stdout.write(`${line}\n`),
  });
}
