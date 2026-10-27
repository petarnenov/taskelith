import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import { runChecklist, runEffect, type SaveTarget } from './checklist-commands.ts';
import { GIT_ENVIRONMENT, type ChecklistEnvironment } from './checklist-environment.ts';
import {
  CHECKLIST_FILE,
  CHECKLIST_SCHEMA_PATH,
  checkChecklists,
  createdDate,
  isSize,
  missingChecklists,
  type ChecklistLocation,
} from './checklist-record.ts';
import {
  changeOfDirectory,
  findingsIndex,
  formatIndex,
  formatProblem,
  parseLocatedFindings,
  parseVocabulary,
  SPECS_DIRECTORY,
  VOCABULARY_PATH,
  type ChecklistQuery,
  type Finding,
  type FindingRules,
  type Problem,
  type SchemaCheck,
} from './review-findings.ts';
import { consistencyProblems, parsePassSummaries, PASSES_FILE, type PassSummary } from './review-passes.ts';
import { formatReviewerStatistics, reviewerStatistics, type ReviewedChange } from './reviewer-statistics.ts';

// npm run findings: validates the review records of OpenSpec changes and
// reports on archived ones: index, checklist, reviewers, checklist effect.

const CHANGES_DIRECTORY = 'openspec/changes';
const ARCHIVE_DIRECTORY = 'archive';
const FINDINGS_FILE = 'findings.jsonl';
const OPENSPEC_METADATA = '.openspec.yaml';
export const SCHEMA_PATH = 'docs/review-findings/finding.schema.json';
export const PASS_SCHEMA_PATH = 'docs/review-findings/pass.schema.json';
export const DEFAULT_TOP = 7;
export const MAX_TOP = 10;

export const USAGE = [
  'Usage: make findings ARGS="<command>", or npm run findings -- <command>',
  '  validate                 check every findings.jsonl and passes.jsonl under openspec/changes',
  '  index [--json]           aggregate the findings of archived changes',
  '  reviewers [--json]       statistics of archived review passes per reviewer and role',
  `  checklist [--capability <a,b>] [--files <glob,glob>] [--top <1-${MAX_TOP}>]`,
  `                           most frequent archived categories (top ${DEFAULT_TOP})`,
  '            [--json | --save <change> [--size <S|S-M|M|M-L|L>]]',
  `                           as JSON, or saved as the change's ${CHECKLIST_FILE}`,
  '  effect [--json]          pass-1 findings of archived changes against their checklist',
].join('\n');

export type Command =
  | { readonly name: 'validate' }
  | { readonly name: 'index' | 'reviewers'; readonly json: boolean }
  | { readonly name: 'effect'; readonly json: boolean }
  | { readonly name: 'checklist'; readonly query: ChecklistQuery; readonly json: boolean; readonly save?: SaveTarget };

export class UsageError extends Error {}

const OPTIONS = {
  json: { type: 'boolean' },
  capability: { type: 'string', multiple: true },
  files: { type: 'string', multiple: true },
  top: { type: 'string' },
  save: { type: 'string' },
  size: { type: 'string' },
} as const;

const COMMAND_OPTIONS: Readonly<Record<Command['name'], readonly string[]>> = {
  validate: [],
  index: ['json'],
  reviewers: ['json'],
  checklist: ['capability', 'files', 'top', 'json', 'save', 'size'],
  effect: ['json'],
};

export function parseCommand(args: readonly string[]): Command {
  const { values, positionals } = parseOrThrow(args);
  const [name, ...extra] = positionals;
  if (!isCommandName(name)) throw new UsageError(name === undefined ? 'missing command' : `unknown command "${name}"`);
  if (extra.length > 0) throw new UsageError(`unexpected argument "${extra[0]}"`);
  const misplaced = Object.keys(values).find((option) => !COMMAND_OPTIONS[name].includes(option));
  if (misplaced !== undefined) throw new UsageError(`--${misplaced} does not apply to ${name}`);
  if (name === 'validate') return { name };
  if (name !== 'checklist') return { name, json: values.json === true };
  const query = checklistQuery(values.capability ?? [], values.files ?? [], values.top);
  const json = values.json === true;
  const save = saveTarget(values.save, values.size, json);
  return save === undefined ? { name, query, json } : { name, query, json, save };
}

const CHANGE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function saveTarget(change: string | undefined, size: string | undefined, json: boolean): SaveTarget | undefined {
  if (change === undefined) {
    if (size !== undefined) throw new UsageError('--size applies only with --save');
    return undefined;
  }
  if (json) throw new UsageError('--json and --save exclude each other');
  if (!CHANGE_NAME.test(change)) throw new UsageError('--save takes an OpenSpec change name');
  if (size === undefined) return { change };
  if (!isSize(size)) throw new UsageError('--size must be S, S-M, M, M-L, or L');
  return { change, size };
}

function parseOrThrow(args: readonly string[]) {
  try {
    return parseArgs({ args: [...args], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}

function isCommandName(name: string | undefined): name is Command['name'] {
  return name !== undefined && Object.hasOwn(COMMAND_OPTIONS, name);
}

function checklistQuery(capabilities: readonly string[], files: readonly string[], top: string | undefined): ChecklistQuery {
  return { capabilities: capabilities.flatMap(splitList), files: files.flatMap(splitList), top: topCount(top) };
}

// Splits at commas outside braces, nested ones included, and outside
// character classes, so `src/{a,{b,c}}.ts` and `[a,b]*.ts` stay whole.
export function splitList(value: string): string[] {
  const items = [''];
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const classEnd = characterClassEnd(value, index);
    if (classEnd !== undefined) {
      items[items.length - 1] += value.slice(index, classEnd + 1);
      index = classEnd;
      continue;
    }
    const character = value[index];
    if (character === ',' && depth === 0) {
      items.push('');
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') depth = Math.max(0, depth - 1);
    items[items.length - 1] += character;
  }
  return items.map((item) => item.trim()).filter((item) => item !== '');
}

// The index of the `]` closing a class that opens at `start`; a `]` right
// after `[`, `[!`, or `[^` is a member, and an unclosed `[` is literal.
function characterClassEnd(value: string, start: number): number | undefined {
  if (value[start] !== '[') return undefined;
  let first = start + 1;
  if (value[first] === '!' || value[first] === '^') first += 1;
  const end = value.indexOf(']', first + 1);
  return end === -1 ? undefined : end;
}

function topCount(value: string | undefined): number {
  if (value === undefined) return DEFAULT_TOP;
  const top = Number(value);
  if (!Number.isInteger(top) || top < 1 || top > MAX_TOP) throw new UsageError(`--top must be 1 to ${MAX_TOP}`);
  return top;
}

// Adapter over ajv: callers see readable violations, never ajv's own types.
export function ajvSchemaCheck(schema: object, references: readonly object[] = []): SchemaCheck {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const reference of references) ajv.addSchema(reference);
  const validate = ajv.compile(schema);
  return (value) => (validate(value) ? [] : validate.errors!.map(describeError));
}

// An unknown property's name is untrusted input, so it is never printed.
function describeError(error: ErrorObject): string {
  return `${error.instancePath || '/'} ${error.message}`;
}

export interface RecordFile {
  readonly path: string;
  readonly text: string;
}

export interface ChangeRecords {
  readonly change: string;
  readonly archived: boolean;
  readonly findings?: RecordFile;
  readonly passes?: RecordFile;
}

interface Repository {
  readonly changes: readonly ChangeRecords[];
  // Archived changes with neither file, which predate the records.
  readonly unrecordedArchived: number;
  readonly missing: readonly Problem[];
  readonly vocabularyText: string;
  readonly schema: object;
  readonly passSchema: object;
  readonly checklistSchema: object;
  readonly capabilities: readonly string[];
  readonly checklists: readonly ChecklistLocation[];
}

interface ChangeLocation {
  readonly directory: string;
  readonly change: string;
  readonly archived: boolean;
}

function changeLocations(root: string): ChangeLocation[] {
  const archive = posix.join(CHANGES_DIRECTORY, ARCHIVE_DIRECTORY);
  const active = directories(root, CHANGES_DIRECTORY).filter((name) => name !== ARCHIVE_DIRECTORY)
    .map((name) => ({ directory: posix.join(CHANGES_DIRECTORY, name), change: name, archived: false }));
  const archived = directories(root, archive)
    .map((name) => ({ directory: posix.join(archive, name), change: changeOfDirectory(name), archived: true }));
  return [...active, ...archived];
}

const MISSING: Readonly<Record<string, string>> = {
  [FINDINGS_FILE]: 'missing; an active change records its findings here, empty if none',
  [PASSES_FILE]: 'missing; an active change records a summary of each review pass here, empty if none',
};

// Archived changes predate the records and need no files; an active change
// must have both, empty before its first review pass.
function loadRepository(root: string): Repository {
  const read = (path: string) => readFileSync(posix.join(root, path), 'utf8');
  const file = (directory: string, name: string): RecordFile | undefined => {
    const path = posix.join(directory, name);
    return existsSync(posix.join(root, path)) ? { path, text: read(path) } : undefined;
  };
  const locations = changeLocations(root);
  const located = locations.map(({ directory, change, archived }) =>
    ({ directory, records: { change, archived, findings: file(directory, FINDINGS_FILE), passes: file(directory, PASSES_FILE) } }));
  const changes: ChangeRecords[] = located.map(({ records }) => records);
  const missing = located.filter(({ records }) => !records.archived).flatMap(({ directory, records }) =>
    ([[FINDINGS_FILE, records.findings], [PASSES_FILE, records.passes]] as const)
      .filter(([, present]) => present === undefined)
      .map(([name]) => ({ file: posix.join(directory, name), message: MISSING[name] })));
  const recorded = changes.filter(({ findings, passes }) => findings !== undefined || passes !== undefined);
  return {
    changes: recorded,
    unrecordedArchived: changes.filter(({ archived }) => archived).length - recorded.filter(({ archived }) => archived).length,
    missing,
    vocabularyText: read(VOCABULARY_PATH),
    schema: JSON.parse(read(SCHEMA_PATH)) as object,
    passSchema: JSON.parse(read(PASS_SCHEMA_PATH)) as object,
    checklistSchema: JSON.parse(read(CHECKLIST_SCHEMA_PATH)) as object,
    capabilities: directories(root, SPECS_DIRECTORY),
    checklists: locations.map((location) => ({
      ...location,
      created: createdDate(file(location.directory, OPENSPEC_METADATA)?.text),
      file: file(location.directory, CHECKLIST_FILE),
    })),
  };
}

function directories(root: string, path: string): string[] {
  const full = posix.join(root, path);
  if (!existsSync(full)) return [];
  return readdirSync(full, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export interface RunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function runFindings(args: readonly string[], root: string, environment: ChecklistEnvironment = GIT_ENVIRONMENT): RunResult {
  let command: Command;
  try {
    command = parseCommand(args);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    return { exitCode: 2, stdout: '', stderr: `${error.message}\n${USAGE}` };
  }
  return runCommand(command, loadRepository(root), { root, environment });
}

interface Workspace {
  readonly root: string;
  readonly environment: ChecklistEnvironment;
}

interface CheckedChange extends ReviewedChange {
  readonly archived: boolean;
  readonly problems: readonly Problem[];
}

interface ChangeRules {
  readonly archived: FindingRules;
  readonly active: FindingRules;
  readonly passSchema: SchemaCheck;
}

// Cross-file checks need passes.jsonl, take a missing findings.jsonl as
// empty, and skip files with broken lines, which are reported once.
function checkChange(records: ChangeRecords, rules: ChangeRules): CheckedChange {
  const { change, archived } = records;
  const findings = records.findings && parseLocatedFindings({ ...records.findings, change }, archived ? rules.archived : rules.active);
  const passes = records.passes && parsePassSummaries({ ...records.passes, change }, rules.passSchema);
  const consistency = passes !== undefined && passes.problems.length + (findings?.problems.length ?? 0) === 0
    ? consistencyProblems({
      findingsPath: records.findings?.path ?? posix.join(posix.dirname(records.passes!.path), FINDINGS_FILE),
      passesPath: records.passes!.path,
      findings: findings?.located ?? [],
      summaries: passes.located,
    })
    : [];
  return {
    change,
    archived,
    findings: findings?.located.map(({ finding }) => finding) ?? [],
    summaries: passes?.located.map(({ summary }): PassSummary => summary),
    problems: [...(findings?.problems ?? []), ...(passes?.problems ?? []), ...consistency],
  };
}

function runCommand(command: Command, repository: Repository, workspace: Workspace): RunResult {
  const vocabulary = parseVocabulary(repository.vocabularyText);
  const categoryIds = new Set(vocabulary.categories.map(({ id }) => id));
  const archivedRules = { checkSchema: ajvSchemaCheck(repository.schema), categories: categoryIds };
  const rules = {
    archived: archivedRules,
    active: { ...archivedRules, capabilities: new Set(repository.capabilities) },
    passSchema: ajvSchemaCheck(repository.passSchema, [repository.schema]),
  };
  const checked = repository.changes.map((records) => checkChange(records, rules));
  const checklists = checkChecklists(repository.checklists, ajvSchemaCheck(repository.checklistSchema, [repository.schema]), categoryIds);
  const validating = command.name === 'validate';
  const problems = [
    ...vocabulary.problems,
    ...(validating ? repository.missing : []),
    ...checked.flatMap((change) => change.problems),
    ...(validating ? missingChecklists(repository.checklists) : []),
    ...checklists.problems,
  ];
  if (problems.length > 0) return { exitCode: 1, stdout: '', stderr: [...problems.map(formatProblem), problemSummary(problems)].join('\n') };
  const archivedChanges = checked.filter(({ archived }) => archived);
  const archived: Finding[] = archivedChanges.flatMap(({ findings }) => findings);
  if (command.name === 'checklist') return runChecklist(command, { ...workspace, archived, categories: vocabulary.categories });
  if (command.name === 'effect') {
    const changes = repository.checklists.filter(({ archived: isArchived }) => isArchived).map(({ directory, change }) =>
      ({ directory, change, findings: archivedChanges.find((records) => records.change === change)?.findings ?? [] }));
    return runEffect(command.json, { ...workspace, archivedChanges: changes, checklists: checklists.located });
  }
  return { exitCode: 0, stdout: commandOutput(command, repository, archivedChanges, archived), stderr: '' };
}

function problemSummary(problems: readonly Problem[]): string {
  const formats = problems.some(({ file }) => posix.basename(file) === CHECKLIST_FILE)
    ? `${SCHEMA_PATH}, ${PASS_SCHEMA_PATH}, and ${CHECKLIST_SCHEMA_PATH}`
    : `${SCHEMA_PATH} and ${PASS_SCHEMA_PATH}`;
  return `Review findings: ${problems.length} problem(s); the formats are ${formats}.`;
}

type ReportCommand = Extract<Command, { name: 'validate' | 'index' | 'reviewers' }>;

function commandOutput(command: ReportCommand, repository: Repository, archivedChanges: readonly CheckedChange[], archived: readonly Finding[]): string {
  if (command.name === 'validate') return validOutput(repository.changes);
  if (command.name === 'reviewers') {
    const statistics = reviewerStatistics(archivedChanges, repository.unrecordedArchived);
    return command.json ? JSON.stringify(statistics, null, 2) : formatReviewerStatistics(statistics);
  }
  const index = findingsIndex(archived);
  return command.json ? JSON.stringify(index, null, 2) : formatIndex(index);
}

function validOutput(changes: readonly ChangeRecords[]): string {
  const findings = changes.filter((records) => records.findings !== undefined).length;
  const passes = changes.filter((records) => records.passes !== undefined).length;
  return `Every findings file is valid: ${findings} file(s); every pass summary file is valid: ${passes} file(s).`;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { exitCode, stdout, stderr } = runFindings(process.argv.slice(2), process.cwd());
  if (stdout !== '') console.log(stdout);
  if (stderr !== '') console.error(stderr);
  process.exitCode = exitCode;
}
