import { mkdir, realpath } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runSourceControlConformance, type SourceControlConformanceFinding } from '@taskelith/integrations';
import { createGithubSourceControl } from '@taskelith/scm-github';
import { cleanUp, isClean, type CleanupReport } from './github-conformance-cleanup.ts';
import { GithubNativeClient } from './github-conformance-client.ts';
import { revealedKeyLines, saveEvidence } from './github-conformance-evidence.ts';
import { liveConformanceFixture } from './github-conformance-fixture.ts';
import { RequestGuard } from './github-conformance-guard.ts';
import { LONG_RUN_TIMING, runLongRefresh } from './github-conformance-long-run.ts';
import {
  CONFORMANCE_REPOSITORIES,
  loadSecrets,
  readSettings,
  type ConformanceSecrets,
  type ConformanceSettings,
} from './github-conformance-settings.ts';

// The SCM conformance suite against GitHub.com with the plugin's own App,
// on the disposable repositories only (`make conformance-github`).
// usage: github-conformance.ts --out DIR [--long-run] [--cleanup-only]

const USAGE = 'usage: github-conformance.ts --out DIR [--long-run] [--cleanup-only]';
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MERGE_METHODS = Object.freeze(['merge-commit', 'squash', 'rebase']);
const SYSTEM_CLOCK = Object.freeze({
  now: () => Date.now(),
  sleep: (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds)),
});

interface Options {
  readonly out: string;
  readonly longRun: boolean;
  readonly cleanupOnly: boolean;
}

interface Evidence {
  readonly mode: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly repositories: typeof CONFORMANCE_REPOSITORIES;
  readonly cases: number;
  readonly findings: readonly SourceControlConformanceFinding[];
  readonly longRun: 'not run' | 'run';
  readonly stopped: string | undefined;
  readonly cleanup: CleanupReport;
  readonly guardRefusals: readonly string[];
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv);
  if (options === undefined) return fail(USAGE, 2);
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
      options: { out: { type: 'string' }, 'long-run': { type: 'boolean' }, 'cleanup-only': { type: 'boolean' } },
      strict: true,
    });
    if (values.out === undefined || values.out.length === 0) return undefined;
    return { out: values.out, longRun: values['long-run'] === true, cleanupOnly: values['cleanup-only'] === true };
  } catch {
    return undefined;
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
  let cleanup: CleanupReport = { steps: [], unobserved: [] };
  try {
    if (!options.cleanupOnly) cases = await runSuite(options, { ...identity, ...secrets, fetch: guard.fetch }, client, findings);
  } catch (error) {
    stopped = error instanceof Error ? error.message : 'a non-error value';
  } finally {
    cleanup = await cleanUp(client);
    await client.close().catch(() => undefined);
  }
  const record: Evidence = {
    mode: options.cleanupOnly ? 'cleanup-only' : 'run',
    startedAt,
    finishedAt: new Date().toISOString(),
    repositories: CONFORMANCE_REPOSITORIES,
    cases,
    findings,
    longRun: options.longRun && !options.cleanupOnly ? 'run' : 'not run',
    stopped,
    cleanup,
    guardRefusals: guard.refusals,
  };
  return { record, revealed: guard.mintedTokens };
}

interface PluginConnection extends ConformanceSecrets {
  readonly appId: string;
  readonly installationId: string;
  readonly fetch: typeof fetch;
}

async function runSuite(
  options: Options,
  connection: PluginConnection,
  client: GithubNativeClient,
  findings: SourceControlConformanceFinding[],
): Promise<number> {
  const provider = createGithubSourceControl({ ...connection, mergeMethods: [...MERGE_METHODS] });
  if (!provider.ok) throw new Error(`the plugin refused its settings: ${provider.error.code}`);
  const fixture = liveConformanceFixture({ provider: provider.value, client, webhookSecret: connection.webhookSecret });
  const report = await runSourceControlConformance(fixture);
  findings.push(...report.findings);
  if (!options.longRun) return report.cases;
  findings.push(...(await runLongRefresh(fixture, LONG_RUN_TIMING, SYSTEM_CLOCK)));
  return report.cases + 1;
}

function passed(record: Evidence): boolean {
  return record.stopped === undefined && record.findings.length === 0 && isClean(record.cleanup) && record.guardRefusals.length === 0;
}

function summary(record: Evidence, path: string): string {
  const failedSteps = record.cleanup.steps.filter((step) => !step.done).length;
  return [
    `github-conformance: ${passed(record) ? 'PASS' : 'FAIL'} (${record.mode})`,
    `cases ${record.cases}; findings ${record.findings.length}; cleanup steps ${record.cleanup.steps.length}, failed ${failedSteps}`,
    `unobserved repositories ${record.cleanup.unobserved.length}; guard refusals ${record.guardRefusals.length}`,
    `evidence ${path}`,
  ].join('\n');
}

function fail(message: string, code: number): number {
  console.error(`github-conformance: ${message}`);
  return code;
}

process.exitCode = await main(process.argv.slice(2));
