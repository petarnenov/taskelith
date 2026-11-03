import { mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import {
  runSourceControlConformance,
  type ConformanceClock,
  type SourceControlConformanceEnding,
  type SourceControlConformanceFinding,
} from '@taskelith/integrations';
import { createGithubSourceControl } from '@taskelith/scm-github';
import { cleanUp, isClean, type CleanupReport } from './github-conformance-cleanup.ts';
import { GithubNativeClient } from './github-conformance-client.ts';
import { discoverInstallation } from './github-conformance-discovery.ts';
import { revealedKeyLines, saveEvidence } from './github-conformance-evidence.ts';
import { liveConformanceFixture } from './github-conformance-fixture.ts';
import { RequestGuard } from './github-conformance-guard.ts';
import { isRevocationClean, revokeTokens, type RevocationReport } from './github-conformance-revocation.ts';
import { LONG_RUN_TIMING, runLongRefresh } from './github-conformance-long-run.ts';
import {
  CONFORMANCE_REPOSITORIES,
  loadPrivateKey,
  loadSecrets,
  readAppSettings,
  readSettings,
  type ConformanceSecrets,
  type ConformanceSettings,
} from './github-conformance-settings.ts';

// The SCM conformance suite against GitHub.com with the plugin's own App,
// on the disposable repositories only (`make conformance-github`).

const USAGE = 'usage: github-conformance.ts --out DIR [--long-run | --cleanup-only | --discover]';
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MERGE_METHODS = Object.freeze(['merge-commit', 'squash', 'rebase']);
const SYSTEM_CLOCK: ConformanceClock = Object.freeze({
  now: () => Date.now(),
  sleep: (milliseconds: number) => delay(milliseconds),
  timeout: (milliseconds: number, signal: AbortSignal) => delay(milliseconds, undefined, { signal }).catch(() => undefined),
});

interface Options {
  readonly out: string;
  readonly longRun: boolean;
  readonly cleanupOnly: boolean;
  readonly discover: boolean;
}

interface Evidence {
  readonly mode: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly repositories: typeof CONFORMANCE_REPOSITORIES;
  readonly cases: number;
  readonly findings: readonly SourceControlConformanceFinding[];
  readonly endings: readonly SourceControlConformanceEnding[];
  readonly longRun: 'not run' | 'run';
  readonly stopped: string | undefined;
  readonly cleanup: CleanupReport;
  readonly revocation: RevocationReport;
  readonly guardRefusals: readonly string[];
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv);
  if (options === undefined) return fail(USAGE, 2);
  if (options.discover) return discover(options);
  const settings = readSettings(process.env);
  if (!settings.ok) return fail(settings.error, 2);
  const secrets = await loadSecrets(settings.value);
  if (!secrets.ok) return fail(secrets.error, 2);
  const out = await outputDirectory(options.out);
  if (out === undefined) return fail('--out must be a directory outside the worktree', 2);
  const evidence = await run(options, settings.value, secrets.value);
  const revealed = [secrets.value.webhookSecret, ...revealedKeyLines(secrets.value.privateKey), ...evidence.revealed];
  const saved = await saveEvidence(out, 'report.json', `${JSON.stringify(evidence.record, null, 2)}\n`, revealed);
  if (!saved.ok) return fail(saved.error, 1);
  console.log(summary(evidence.record, saved.value));
  return passed(evidence.record) ? 0 : 1;
}

function parseOptions(argv: readonly string[]): Options | undefined {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: {
        out: { type: 'string' },
        'long-run': { type: 'boolean' },
        'cleanup-only': { type: 'boolean' },
        discover: { type: 'boolean' },
      },
      strict: true,
    });
    if (values.out === undefined || values.out.length === 0) return undefined;
    const options = {
      out: values.out,
      longRun: values['long-run'] === true,
      cleanupOnly: values['cleanup-only'] === true,
      discover: values.discover === true,
    };
    const modes = [options.longRun, options.cleanupOnly, options.discover].filter(Boolean).length;
    return modes > 1 ? undefined : options;
  } catch {
    return undefined;
  }
}

// Needs only the App ID and key; prints IDs and repository names only.
async function discover(options: Options): Promise<number> {
  const settings = readAppSettings(process.env);
  if (!settings.ok) return fail(settings.error, 2);
  const privateKey = await loadPrivateKey(settings.value);
  if (!privateKey.ok) return fail(privateKey.error, 2);
  const out = await outputDirectory(options.out);
  if (out === undefined) return fail('--out must be a directory outside the worktree', 2);
  const guard = new RequestGuard(globalThis.fetch);
  const identity = (installationId: string) => ({ appId: settings.value.appId, installationId, privateKey: privateKey.value });
  const app = new GithubNativeClient(identity(''), guard.fetch);
  const asInstallation = (installationId: string) => {
    const client = new GithubNativeClient(identity(installationId), guard.fetch);
    return (method: string, path: string) => client.request(method, path);
  };
  try {
    const found = await discoverInstallation((method, path) => app.requestAsApp(method, path), asInstallation);
    const record = { ...found, guardRefusals: guard.refusals };
    const revealed = [...revealedKeyLines(privateKey.value), ...guard.mintedTokens];
    const text = `${JSON.stringify(record, null, 2)}\n`;
    const saved = await saveEvidence(out, 'discovery.json', text, revealed);
    if (!saved.ok) return fail(saved.error, 1);
    console.log(await readFile(saved.value, 'utf8'));
    return found.problems.length === 0 && guard.refusals.length === 0 ? 0 : 1;
  } finally {
    await revokeTokens(guard.mintedTokens, revokerOf(app));
  }
}

async function outputDirectory(out: string): Promise<string | undefined> {
  const path = resolve(out);
  const root = await realpath(REPOSITORY_ROOT);
  if (`${path}${sep}`.startsWith(`${root}${sep}`)) return undefined;
  await mkdir(path, { recursive: true, mode: 0o700 });
  const real = await realpath(path);
  return `${real}${sep}`.startsWith(`${root}${sep}`) ? undefined : real;
}

// The cleanup runs after every run, also when the suite stops early.
async function run(options: Options, settings: ConformanceSettings, secrets: ConformanceSecrets) {
  const startedAt = new Date().toISOString();
  const guard = new RequestGuard(globalThis.fetch);
  const identity = { appId: settings.appId, installationId: settings.installationId, privateKey: secrets.privateKey };
  const client = new GithubNativeClient(identity, guard.fetch);
  let cases = 0;
  let stopped: string | undefined;
  const findings: SourceControlConformanceFinding[] = [];
  const endings: SourceControlConformanceEnding[] = [];
  let cleanup: CleanupReport = { steps: [], unobserved: [] };
  let revocation: RevocationReport = { revoked: 0, alreadyEnded: 0, failedStatuses: [] };
  try {
    if (!options.cleanupOnly) cases = await runSuite(options, { ...identity, ...secrets, fetch: guard.fetch }, client, { findings, endings });
  } catch (error) {
    stopped = error instanceof Error ? error.message : 'a non-error value';
  } finally {
    cleanup = await cleanUp(client);
    revocation = await revokeTokens(guard.mintedTokens, revokerOf(client));
  }
  const record: Evidence = {
    mode: options.cleanupOnly ? 'cleanup-only' : 'run',
    startedAt,
    finishedAt: new Date().toISOString(),
    repositories: CONFORMANCE_REPOSITORIES,
    cases,
    findings,
    endings,
    longRun: options.longRun && !options.cleanupOnly ? 'run' : 'not run',
    stopped,
    cleanup,
    revocation,
    guardRefusals: guard.refusals,
  };
  return { record, revealed: guard.mintedTokens };
}

interface PluginConnection extends ConformanceSecrets {
  readonly appId: string;
  readonly installationId: string;
  readonly fetch: typeof fetch;
}

interface SuiteOutcome {
  readonly findings: SourceControlConformanceFinding[];
  readonly endings: SourceControlConformanceEnding[];
}

async function runSuite(
  options: Options,
  connection: PluginConnection,
  client: GithubNativeClient,
  outcome: SuiteOutcome,
): Promise<number> {
  const provider = createGithubSourceControl({ ...connection, mergeMethods: [...MERGE_METHODS] });
  if (!provider.ok) throw new Error(`the plugin refused its settings: ${provider.error.code}`);
  const fixture = liveConformanceFixture({
    provider: provider.value,
    client,
    webhookSecret: connection.webhookSecret,
    clock: SYSTEM_CLOCK,
  });
  const report = await runSourceControlConformance(fixture);
  outcome.findings.push(...report.findings);
  outcome.endings.push(...report.endings);
  if (!options.longRun) return report.cases;
  const longRun = await runLongRefresh(fixture, LONG_RUN_TIMING);
  outcome.findings.push(...longRun.findings);
  outcome.endings.push(...longRun.endings);
  return report.cases + 1;
}

function passed(record: Evidence): boolean {
  const reset = isClean(record.cleanup) && isRevocationClean(record.revocation);
  return record.stopped === undefined && record.findings.length === 0 && reset && record.guardRefusals.length === 0;
}

// Every minted token, the fixture's own included, as its own holder.
function revokerOf(client: GithubNativeClient) {
  return async (token: string) => (await client.requestWithToken(token, 'DELETE', '/installation/token')).status;
}

function summary(record: Evidence, path: string): string {
  const failedSteps = record.cleanup.steps.filter((step) => !step.done).length;
  return [
    `github-conformance: ${passed(record) ? 'PASS' : 'FAIL'} (${record.mode})`,
    `cases ${record.cases}; findings ${record.findings.length}; slowest ending ${slowestEnding(record)} ms; cleanup steps ${record.cleanup.steps.length}, failed ${failedSteps}`,
    `unobserved repositories ${record.cleanup.unobserved.length}; guard refusals ${record.guardRefusals.length}`,
    `tokens revoked ${record.revocation.revoked}, already ended ${record.revocation.alreadyEnded}, failed ${record.revocation.failedStatuses.length}`,
    `evidence ${path}`,
  ].join('\n');
}

function slowestEnding(record: Evidence): number {
  return Math.max(0, ...record.endings.map((ending) => ending.latencyMs));
}

function fail(message: string, code: number): number {
  console.error(`github-conformance: ${message}`);
  return code;
}

process.exitCode = await main(process.argv.slice(2));
