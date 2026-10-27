import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import {
  changeOfDirectory,
  checklist,
  findingsIndex,
  formatChecklist,
  formatIndex,
  formatProblem,
  formatRecordChecklist,
  parseFindings,
  parseVocabulary,
  recordChecklist,
  SPECS_DIRECTORY,
  VOCABULARY_PATH,
  type Category,
  type ChecklistQuery,
  type Finding,
  type FindingsSource,
  type Problem,
  type SchemaCheck,
} from './review-findings.ts';

// npm run findings: validates the findings.jsonl files of OpenSpec changes,
// indexes archived findings, and prints a review checklist for a brief.

const CHANGES_DIRECTORY = 'openspec/changes';
const ARCHIVE_DIRECTORY = 'archive';
const FINDINGS_FILE = 'findings.jsonl';
export const SCHEMA_PATH = 'docs/review-findings/finding.schema.json';
export const DEFAULT_TOP = 7;
export const MAX_TOP = 10;

export const USAGE = [
  'Usage: make findings ARGS="<command>", or npm run findings -- <command>',
  '  validate                 check every findings.jsonl under openspec/changes',
  '  index [--json]           aggregate the findings of archived changes',
  `  checklist [--capability <a,b>] [--files <glob,glob>] [--top <1-${MAX_TOP}>]`,
  `                           most frequent archived categories (top ${DEFAULT_TOP})`,
].join('\n');

export type Command =
  | { readonly name: 'validate' }
  | { readonly name: 'index'; readonly json: boolean }
  | { readonly name: 'checklist'; readonly query: ChecklistQuery };

export class UsageError extends Error {}

const OPTIONS = {
  json: { type: 'boolean' },
  capability: { type: 'string', multiple: true },
  files: { type: 'string', multiple: true },
  top: { type: 'string' },
} as const;

const COMMAND_OPTIONS: Readonly<Record<Command['name'], readonly string[]>> = {
  validate: [],
  index: ['json'],
  checklist: ['capability', 'files', 'top'],
};

export function parseCommand(args: readonly string[]): Command {
  const { values, positionals } = parseOrThrow(args);
  const [name, ...extra] = positionals;
  if (!isCommandName(name)) throw new UsageError(name === undefined ? 'missing command' : `unknown command "${name}"`);
  if (extra.length > 0) throw new UsageError(`unexpected argument "${extra[0]}"`);
  const misplaced = Object.keys(values).find((option) => !COMMAND_OPTIONS[name].includes(option));
  if (misplaced !== undefined) throw new UsageError(`--${misplaced} does not apply to ${name}`);
  if (name === 'validate') return { name };
  if (name === 'index') return { name, json: values.json === true };
  return { name, query: checklistQuery(values.capability ?? [], values.files ?? [], values.top) };
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
export function ajvSchemaCheck(schema: object): SchemaCheck {
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  return (value) => (validate(value) ? [] : validate.errors!.map(describeError));
}

// An unknown property's name is untrusted input, so it is never printed.
function describeError(error: ErrorObject): string {
  return `${error.instancePath || '/'} ${error.message}`;
}

export interface ChangeFindings extends FindingsSource {
  readonly archived: boolean;
}

interface Repository {
  readonly sources: readonly ChangeFindings[];
  readonly missing: readonly Problem[];
  readonly vocabularyText: string;
  readonly schema: object;
  readonly capabilities: readonly string[];
}

interface ChangeLocation {
  readonly path: string;
  readonly change: string;
  readonly archived: boolean;
}

function changeLocations(root: string): ChangeLocation[] {
  const archive = posix.join(CHANGES_DIRECTORY, ARCHIVE_DIRECTORY);
  const active = directories(root, CHANGES_DIRECTORY).filter((name) => name !== ARCHIVE_DIRECTORY)
    .map((name) => ({ path: posix.join(CHANGES_DIRECTORY, name, FINDINGS_FILE), change: name, archived: false }));
  const archived = directories(root, archive)
    .map((name) => ({ path: posix.join(archive, name, FINDINGS_FILE), change: changeOfDirectory(name), archived: true }));
  return [...active, ...archived];
}

// Archived changes predate the record and need no file; an active change
// must have one, empty when it has no findings.
function loadRepository(root: string): Repository {
  const read = (path: string) => readFileSync(posix.join(root, path), 'utf8');
  const locations = changeLocations(root);
  const present = locations.filter(({ path }) => existsSync(posix.join(root, path)));
  const missing = locations.filter((location) => !location.archived && !present.includes(location));
  return {
    sources: present.map((location) => ({ ...location, text: read(location.path) })),
    missing: missing.map(({ path }) => ({ file: path, message: 'missing; an active change records its findings here, empty if none' })),
    vocabularyText: read(VOCABULARY_PATH),
    schema: JSON.parse(read(SCHEMA_PATH)) as object,
    capabilities: directories(root, SPECS_DIRECTORY),
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

export function runFindings(args: readonly string[], root: string): RunResult {
  let command: Command;
  try {
    command = parseCommand(args);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    return { exitCode: 2, stdout: '', stderr: `${error.message}\n${USAGE}` };
  }
  return runCommand(command, loadRepository(root));
}

function runCommand(command: Command, repository: Repository): RunResult {
  const vocabulary = parseVocabulary(repository.vocabularyText);
  const rules = { checkSchema: ajvSchemaCheck(repository.schema), categories: new Set(vocabulary.categories.map(({ id }) => id)) };
  const activeRules = { ...rules, capabilities: new Set(repository.capabilities) };
  const parsed = repository.sources.map((source) =>
    ({ source, ...parseFindings(source, source.archived ? rules : activeRules) }));
  const problems = [
    ...vocabulary.problems,
    ...(command.name === 'validate' ? repository.missing : []),
    ...parsed.flatMap((result) => result.problems),
  ];
  if (problems.length > 0) {
    const summary = `Review findings: ${problems.length} problem(s); the format is ${SCHEMA_PATH}.`;
    return { exitCode: 1, stdout: '', stderr: [...problems.map(formatProblem), summary].join('\n') };
  }
  const archived: Finding[] = parsed.filter(({ source }) => source.archived).flatMap(({ findings }) => findings);
  return { exitCode: 0, stdout: commandOutput(command, archived, parsed.length, vocabulary.categories), stderr: '' };
}

function commandOutput(command: Command, archived: readonly Finding[], files: number, categories: readonly Category[]): string {
  if (command.name === 'validate') return `Every findings file is valid: ${files} file(s).`;
  if (command.name === 'checklist') return checklistOutput(command.query, archived, categories);
  const index = findingsIndex(archived);
  return command.json ? JSON.stringify(index, null, 2) : formatIndex(index);
}

// Record quality is listed whatever the query, because record findings
// often name no capability and no file of the task.
function checklistOutput(query: ChecklistQuery, archived: readonly Finding[], categories: readonly Category[]): string {
  const forQuery = formatChecklist(checklist(archived, categories, query), query);
  const forRecords = formatRecordChecklist(recordChecklist(archived, categories, query.top));
  return `${forQuery}\n\n${forRecords}`;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { exitCode, stdout, stderr } = runFindings(process.argv.slice(2), process.cwd());
  if (stdout !== '') console.log(stdout);
  if (stderr !== '') console.error(stderr);
  process.exitCode = exitCode;
}
