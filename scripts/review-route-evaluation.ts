import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { CHECKLIST_SCHEMA_PATH } from './checklist-record.ts';
import { ajvSchemaCheck, SCHEMA_PATH, type RunResult } from './findings.ts';
import { changeOfDirectory, contentLines, secretLikeStrings, type SchemaCheck, type Severity } from './review-findings.ts';
import {
  ROUTE_SCHEMA_PATH,
  SKIPPED_SHADOW,
  type ReviewRouter,
  type RouteFeatures,
  type RuleDecision,
  type ShadowDecision,
} from './review-route.ts';
import {
  formatOutcomeFigures,
  formatRoutingFigures,
  NO_FINDINGS,
  outcomeFigures,
  routingFigures,
  THIRD_PASS,
  type OutcomeFigures,
  type ReviewOutcome,
  type RoutedChange,
  type RoutingFigures,
  type SeverityCounts,
} from './review-route-effect.ts';
import { GIT_EVALUATION_ENVIRONMENT } from './review-route-environment.ts';
import {
  ARCHIVE_DIRECTORY,
  archivedReviews,
  changeDirectory,
  featuresAt,
  RouteRefusal,
  type ArchivedReview,
  type FeatureEnvironment,
  type FeatureRevision,
} from './review-route-features.ts';
import { CREDENTIAL_VARIABLE, Credential, JevRouter } from './review-route-jev.ts';
import { RuleRouter } from './review-route-rules.ts';

// The offline evaluation: routes every archived reviewed change by its
// features as of its own time and compares the tiers with its passes.

export const EVALUATION_FILE = 'evaluation.jsonl';
export const EVALUATION_SCHEMA_PATH = 'docs/review-findings/route-evaluation.schema.json';
export const EVALUATION_USAGE = 'Usage: route-evaluation [--at <revision>] [--rule-only] [--save <change>] [--json]';
export const EVALUATION_TIMEOUT_MS = 10_000;
export const RETRY_DELAY_MS = 5_000;
const DEV_BRANCH = 'origin/dev';
const PASS_ONE_SUBJECT = /\bpass 1\b/i;
const PULL_REQUEST_MERGE = /^Merge pull request #\d+ /;
const CHANGE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export interface CommitInfo {
  readonly sha: string;
  readonly parents: readonly string[];
  readonly subject: string;
}

// Git facts of the history; every method returns undefined when git fails.
export interface EvaluationEnvironment extends FeatureEnvironment {
  resolve(root: string, revision: string): string | undefined;
  mergeBase(root: string, first: string, second: string): string | undefined;
  // Newest first.
  firstParentHistory(root: string, at: string): readonly string[] | undefined;
  // The first-parent commit that added the directory; null for none.
  addingCommit(root: string, at: string, directory: string): CommitInfo | null | undefined;
  // The commits of base..tip, oldest first.
  branchCommits(root: string, base: string, tip: string): readonly CommitInfo[] | undefined;
}

export interface EvaluationDependencies {
  readonly environment: EvaluationEnvironment;
  readonly rule: ReviewRouter<RuleDecision>;
  // Undefined without a credential; then only --rule-only can run.
  readonly shadow: ReviewRouter<ShadowDecision> | undefined;
  readonly checkSchema: SchemaCheck;
}

export interface EvaluationLine {
  readonly change: string;
  readonly mergeCommit: string;
  readonly devCommit: string;
  readonly reviewedCommit: string;
  readonly approximate: boolean;
  readonly features: RouteFeatures;
  readonly rule: RuleDecision;
  readonly shadow: ShadowDecision;
  readonly outcome: ReviewOutcome;
}

export type ExclusionReason = 'several-artifacts' | 'no-pull-request-merge';

export interface Exclusion {
  readonly change: string;
  readonly reason: ExclusionReason;
}

export interface Evaluation {
  readonly at: string;
  readonly lines: readonly EvaluationLine[];
  readonly excluded: readonly Exclusion[];
}

interface RecordLine {
  readonly pass?: number;
  readonly severity?: Severity;
  readonly artifact?: string;
}

export interface ArchivedRecords {
  readonly directory: string;
  readonly findings: readonly RecordLine[];
  // Undefined without passes.jsonl.
  readonly passes: readonly RecordLine[] | undefined;
}

export class RetryOnceRouter implements ReviewRouter<ShadowDecision> {
  readonly #inner: ReviewRouter<ShadowDecision>;
  readonly #delayMs: number;
  readonly #sleep: (delayMs: number) => Promise<unknown>;

  constructor(inner: ReviewRouter<ShadowDecision>, delayMs: number, wait: (delayMs: number) => Promise<unknown>) {
    this.#inner = inner;
    this.#delayMs = delayMs;
    this.#sleep = wait;
  }

  // The adapter drops response headers, so a fixed delay stands in for
  // retry-after.
  async route(features: RouteFeatures): Promise<ShadowDecision> {
    const first = await this.#inner.route(features);
    if (!isRetryable(first)) return first;
    await this.#sleep(this.#delayMs);
    return this.#inner.route(features);
  }
}

function isRetryable(decision: ShadowDecision): boolean {
  return decision.status === 'failed' && (decision.reason === 'rate-limited' || decision.reason === 'overloaded');
}

export function isPullRequestMerge({ parents, subject }: CommitInfo): boolean {
  return parents.length === 2 && PULL_REQUEST_MERGE.test(subject);
}

// The archived changes with findings.jsonl or passes.jsonl, by directory.
export function archivedRecordsOf(files: readonly string[], read: (path: string) => string): ArchivedRecords[] {
  const directories = [...new Set(files.map((path) => path.split('/').slice(0, 4).join('/')))].sort();
  const present = new Set(files);
  const linesOf = (path: string) => (present.has(path) ? parseRecordLines(path, read(path)) : undefined);
  return directories.flatMap((directory) => {
    const findings = linesOf(`${directory}/findings.jsonl`);
    const passes = linesOf(`${directory}/passes.jsonl`);
    if (findings === undefined && passes === undefined) return [];
    return [{ directory, findings: findings ?? [], passes }];
  });
}

function parseRecordLines(path: string, text: string): RecordLine[] {
  try {
    return contentLines(text).map((line) => JSON.parse(line) as RecordLine);
  } catch {
    throw new RouteRefusal(`${path} is not valid JSON lines`);
  }
}

export function reviewsSeveralArtifacts({ findings, passes }: ArchivedRecords): boolean {
  return [...findings, ...(passes ?? [])].some(({ artifact }) => artifact !== undefined);
}

// At least one pass ran, also when it recorded nothing.
export function reviewOutcome(records: ArchivedRecords): ReviewOutcome {
  const passNumbers = [...records.findings, ...(records.passes ?? [])].map(({ pass }) => pass ?? 0);
  const passesNeeded = Math.max(1, ...passNumbers);
  return {
    passesNeeded,
    thirdPass: passesNeeded >= THIRD_PASS,
    passSummaries: records.passes !== undefined,
    findings: { pass1: severityCounts(records.findings, 1), pass2: severityCounts(records.findings, 2) },
  };
}

function severityCounts(findings: readonly RecordLine[], pass: number): SeverityCounts {
  const counts: Record<Severity, number> = { ...NO_FINDINGS };
  for (const { severity } of findings.filter((finding) => finding.pass === pass)) {
    if (severity !== undefined && severity in counts) counts[severity] += 1;
  }
  return counts;
}

function required<Value>(value: Value | undefined, refusal: string): Value {
  if (value === undefined) throw new RouteRefusal(refusal);
  return value;
}

interface Subject {
  readonly change: string;
  readonly records: ArchivedRecords;
  readonly merge: CommitInfo;
}

export async function evaluateArchive(root: string, at: string, dependencies: EvaluationDependencies): Promise<Evaluation> {
  const { environment } = dependencies;
  const { subjects, excluded } = archivedSubjects(root, at, environment);
  const reviewsAt = memoized((commit: string) => archivedReviews(environment, root, commit));
  const lines: EvaluationLine[] = [];
  for (const subject of subjects) {
    lines.push(await evaluationLine(root, subject, dependencies, reviewsAt));
  }
  return { at, lines, excluded };
}

function archivedSubjects(root: string, at: string, environment: EvaluationEnvironment): { subjects: Subject[]; excluded: Exclusion[] } {
  const files = required(environment.listFiles(root, at, ARCHIVE_DIRECTORY), 'cannot list the archive');
  const read = (path: string) => required(environment.readFile(root, at, path), `cannot read ${path}`);
  const history = required(environment.firstParentHistory(root, at), `cannot read the history of ${at}`);
  const subjects: Subject[] = [];
  const excluded: Exclusion[] = [];
  for (const records of archivedRecordsOf(files, read)) {
    const change = changeOfDirectory(posix.basename(records.directory));
    const merge = required(environment.addingCommit(root, at, records.directory), `cannot read the history of ${records.directory}`);
    if (reviewsSeveralArtifacts(records)) excluded.push({ change, reason: 'several-artifacts' });
    else if (merge === null || !isPullRequestMerge(merge)) excluded.push({ change, reason: 'no-pull-request-merge' });
    else subjects.push({ change, records, merge });
  }
  const order = (subject: Subject) => -history.indexOf(subject.merge.sha);
  return { subjects: subjects.sort((first, second) => order(first) - order(second)), excluded };
}

function memoized<Value>(compute: (key: string) => Value): (key: string) => Value {
  const cache = new Map<string, Value>();
  return (key) => {
    if (!cache.has(key)) cache.set(key, compute(key));
    return cache.get(key)!;
  };
}

async function evaluationLine(
  root: string,
  subject: Subject,
  { environment, rule, shadow }: EvaluationDependencies,
  reviewsAt: (commit: string) => readonly ArchivedReview[],
): Promise<EvaluationLine> {
  const { revision, features, approximate } = featuresOfItsTime(root, subject, environment, reviewsAt);
  return {
    change: subject.change,
    mergeCommit: subject.merge.sha,
    devCommit: revision.devCommit,
    reviewedCommit: revision.revision,
    approximate,
    features,
    rule: await rule.route(features),
    shadow: shadow === undefined ? SKIPPED_SHADOW : await shadow.route(features),
    outcome: reviewOutcome(subject.records),
  };
}

interface TimedFeatures {
  readonly revision: FeatureRevision;
  readonly features: RouteFeatures;
  readonly approximate: boolean;
}

// The revision that pass 1 reviewed where the branch names it; otherwise
// the merged diff, which review fixes enlarge, flagged approximate.
function featuresOfItsTime(
  root: string,
  { change, records, merge }: Subject,
  environment: EvaluationEnvironment,
  reviewsAt: (commit: string) => readonly ArchivedReview[],
): TimedFeatures {
  const reviewed = reviewedRevision(root, change, merge, environment);
  const reviewedFeatures = reviewed === undefined ? undefined : featuresAt(root, environment, reviewed, reviewsAt);
  if (reviewed !== undefined && reviewedFeatures !== undefined) return { revision: reviewed, features: reviewedFeatures, approximate: false };
  const merged = { devCommit: merge.parents[0]!, revision: merge.sha, directory: records.directory };
  const features = required(featuresAt(root, environment, merged, reviewsAt), `no files under ${records.directory}`);
  return { revision: merged, features, approximate: true };
}

// The parent of the earliest branch commit whose subject names pass 1:
// the revision that pass 1 reviewed, before its fixes.
function reviewedRevision(root: string, change: string, merge: CommitInfo, environment: EvaluationEnvironment): FeatureRevision | undefined {
  const [devTip, branchTip] = merge.parents as [string, string];
  const commits = required(environment.branchCommits(root, devTip, branchTip), `cannot read the branch of ${change}`);
  const revision = commits.find(({ subject }) => PASS_ONE_SUBJECT.test(subject))?.parents[0];
  if (revision === undefined) return undefined;
  const devCommit = required(environment.mergeBase(root, revision, devTip), `no merge base of ${change}'s pass 1 and dev`);
  return { devCommit, revision, directory: changeDirectory(change) };
}

export interface EvaluationGroups {
  readonly all: RoutingFigures;
  readonly withPassSummaries: RoutingFigures;
  readonly lowerBounds: RoutingFigures;
}

export const LINE_BANDS = [
  { label: 'under 100 lines', below: 100 },
  { label: '100 to 399 lines', below: 400 },
  { label: '400 lines and more', below: Number.POSITIVE_INFINITY },
] as const;

export interface EvaluationSummary {
  readonly at: string;
  readonly changes: number;
  readonly approximate: number;
  readonly excluded: readonly Exclusion[];
  readonly groups: EvaluationGroups;
  readonly byLines: readonly (OutcomeFigures & { readonly band: string })[];
}

export function evaluationSummary({ at, lines, excluded }: Evaluation): EvaluationSummary {
  const routed = (selected: readonly EvaluationLine[]) => routingFigures(selected.map(routedChange));
  let floor = 0;
  const byLines = LINE_BANDS.map(({ label, below }) => {
    const inBand = lines.filter(({ features }) => features.linesChanged >= floor && features.linesChanged < below);
    floor = below;
    return { band: label, ...outcomeFigures(inBand.map(({ outcome }) => outcome)) };
  });
  return {
    at,
    changes: lines.length,
    approximate: lines.filter(({ approximate }) => approximate).length,
    excluded,
    groups: {
      all: routed(lines),
      withPassSummaries: routed(lines.filter(({ outcome }) => outcome.passSummaries)),
      lowerBounds: routed(lines.filter(({ outcome }) => !outcome.passSummaries)),
    },
    byLines,
  };
}

function routedChange({ change, rule, shadow, outcome }: EvaluationLine): RoutedChange {
  return { change, rule: rule.tier, shadow, outcome };
}

export function formatEvaluationSummary(summary: EvaluationSummary): string {
  const { groups } = summary;
  const excluded = summary.excluded.map(({ change, reason }) => `${change} (${reason})`).join(', ');
  return [
    `Route evaluation of ${summary.changes} archived change(s) as of ${summary.at}, in merge order.`,
    `Features of the revision that pass 1 reviewed; ${summary.approximate} approximate from the merged diff.`,
    `Excluded: ${excluded === '' ? 'none' : excluded}.`,
    formatOutcomeFigures('All', groups.all.all),
    ...formatRoutingFigures(groups.all),
    ...summary.byLines.map((band) => `  ${formatOutcomeFigures(band.band, band)}`),
    formatOutcomeFigures('With pass summaries', groups.withPassSummaries.all),
    ...formatRoutingFigures(groups.withPassSummaries),
    formatOutcomeFigures('Without pass summaries, lower bounds', groups.lowerBounds.all),
    ...formatRoutingFigures(groups.lowerBounds),
  ].join('\n');
}

interface EvaluationOptions {
  readonly at: string | undefined;
  readonly ruleOnly: boolean;
  readonly save: string | undefined;
  readonly json: boolean;
}

class EvaluationUsageError extends Error {}

export async function runRouteEvaluation(args: readonly string[], root: string, dependencies: EvaluationDependencies): Promise<RunResult> {
  let options: EvaluationOptions;
  try {
    options = parseEvaluationOptions(args);
  } catch (error) {
    if (!(error instanceof EvaluationUsageError || isParseArgsError(error))) throw error;
    return { exitCode: 2, stdout: '', stderr: `${(error as Error).message}\n${EVALUATION_USAGE}\n` };
  }
  try {
    return await evaluate(options, root, dependencies);
  } catch (error) {
    if (!(error instanceof RouteRefusal)) throw error;
    return { exitCode: 1, stdout: '', stderr: `route-evaluation: ${error.message}; nothing written\n` };
  }
}

function parseEvaluationOptions(args: readonly string[]): EvaluationOptions {
  const { values } = parseArgs({
    args: [...args],
    options: {
      at: { type: 'string' },
      'rule-only': { type: 'boolean', default: false },
      save: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const { save } = values;
  if (save !== undefined && (!CHANGE_NAME.test(save) || save === 'archive')) throw new EvaluationUsageError('--save must name an active change');
  return { at: values.at, ruleOnly: values['rule-only'], save, json: values.json };
}

function isParseArgsError(error: unknown): boolean {
  return error instanceof TypeError && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS_');
}

async function evaluate(options: EvaluationOptions, root: string, dependencies: EvaluationDependencies): Promise<RunResult> {
  if (!options.ruleOnly && dependencies.shadow === undefined) {
    throw new RouteRefusal(`set ${CREDENTIAL_VARIABLE} to consult the shadow router, or pass --rule-only`);
  }
  if (options.save !== undefined) refuseSaveTarget(root, options.save);
  const at = resolveAt(root, options.at, dependencies.environment);
  const shadow = options.ruleOnly ? undefined : dependencies.shadow;
  const evaluation = await evaluateArchive(root, at, { ...dependencies, shadow });
  const text = evaluationText(evaluation.lines, dependencies.checkSchema);
  if (options.save !== undefined) writeEvaluation(root, options.save, text);
  const summary = evaluationSummary(evaluation);
  const saved = options.save === undefined ? '' : `Saved the evaluation to ${evaluationPath(options.save)}.\n`;
  const stdout = options.json ? `${JSON.stringify(summary, null, 2)}\n` : `${formatEvaluationSummary(summary)}\n${saved}`;
  return { exitCode: 0, stdout, stderr: '' };
}

function resolveAt(root: string, at: string | undefined, environment: EvaluationEnvironment): string {
  if (at === undefined) return required(environment.mergeBase(root, 'HEAD', DEV_BRANCH), `no merge base of HEAD and ${DEV_BRANCH}`);
  return required(environment.resolve(root, at), `--at ${at} does not name a commit`);
}

function evaluationPath(change: string): string {
  return `${changeDirectory(change)}/${EVALUATION_FILE}`;
}

// Checked before any router runs, so a refused save costs no request.
function refuseSaveTarget(root: string, change: string): void {
  if (!existsSync(join(root, changeDirectory(change)))) throw new RouteRefusal(`no active change "${change}"`);
  if (existsSync(join(root, evaluationPath(change)))) throw new RouteRefusal(`${evaluationPath(change)} exists; delete it to evaluate again`);
}

// Every line is checked before anything is written; secret-like values
// are counted, never printed.
export function evaluationText(lines: readonly EvaluationLine[], checkSchema: SchemaCheck): string {
  const problems = lines.flatMap((line) => {
    const secrets = secretLikeStrings(line).length;
    const found = [...checkSchema(line), ...(secrets === 0 ? [] : [`${secrets} value(s) look like a secret`])];
    return found.map((problem) => `${line.change}: ${problem}`);
  });
  if (problems.length > 0) throw new RouteRefusal(`the evaluation is invalid: ${problems.join('; ')}`);
  return lines.map((line) => `${JSON.stringify(line)}\n`).join('');
}

function writeEvaluation(root: string, change: string, text: string): void {
  try {
    writeFileSync(join(root, evaluationPath(change)), text, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new RouteRefusal(`${evaluationPath(change)} exists; delete it to evaluate again`);
    throw error;
  }
}

// The composition root: the only place that reads the credential. A
// live run waits for the owner's confirmation (design.md "Decisions" 6).
export function routeEvaluationDependencies(root: string, variables: NodeJS.ProcessEnv): EvaluationDependencies {
  const credential = Credential.fromEnvironment(variables);
  const jev = credential && new JevRouter({ credential, timeoutMs: EVALUATION_TIMEOUT_MS });
  return {
    environment: GIT_EVALUATION_ENVIRONMENT,
    rule: new RuleRouter(),
    shadow: jev && new RetryOnceRouter(jev, RETRY_DELAY_MS, (delayMs) => sleep(delayMs)),
    checkSchema: evaluationSchemaCheck(root),
  };
}

export function evaluationSchemaCheck(root: string): SchemaCheck {
  const read = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as object;
  const references = [SCHEMA_PATH, CHECKLIST_SCHEMA_PATH, ROUTE_SCHEMA_PATH].map(read);
  return ajvSchemaCheck(read(EVALUATION_SCHEMA_PATH), references);
}
