import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { diff } from '@asyncapi/diff';
import { Parser } from '@asyncapi/parser';
import { ajvSchemaCheck } from './findings-common.ts';
import type { SchemaCheck } from './review-findings.ts';
import { CONTRACT_DOCUMENTS } from './generate-contracts.ts';

// Fails on a breaking contract change since the origin/dev merge base that
// info.version or the declarations file does not declare (ADR 0004 item 6).

export const OASDIFF_IMAGE = 'tufin/oasdiff:v1.34.1@sha256:67a23cfea7d251e2ae34ee703ac8733c5d96bc2e7b90fd0f4d475ec99367b85f';
const BASE_BRANCH = 'dev';
const BASE_REF = `origin/${BASE_BRANCH}`;
// oasdiff levels: 1 INFO, 2 WARN, 3 ERR. ERR is a breaking change.
const OASDIFF_ERR = 3;
export const BREAKING_CHANGES_PATH = 'packages/contracts/breaking-changes.json';
const BREAKING_CHANGES_SCHEMA_PATH = 'packages/contracts/breaking-changes.schema.json';
// The semantic versioning 2.0.0 grammar, with prerelease and build metadata.
const PRERELEASE_IDENTIFIER = '(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)';
const SEMANTIC_VERSION = new RegExp(
  '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)'
  + `(?:-(${PRERELEASE_IDENTIFIER}(?:\\.${PRERELEASE_IDENTIFIER})*))?`
  + '(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?$',
);

interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
}

function parseVersion(text: string): Version | undefined {
  const match = SEMANTIC_VERSION.exec(text);
  if (match === null) return undefined;
  const prerelease = match[4]?.split('.') ?? [];
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease };
}

// Code-unit order, never localeCompare, so no locale changes a result.
function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareIdentifiers(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return Math.sign(Number(left) - Number(right));
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return compareText(left, right);
}

function comparePrereleases(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return Math.sign(right.length - left.length);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const order = compareIdentifiers(left[index], right[index]);
    if (order !== 0) return order;
  }
  return Math.sign(left.length - right.length);
}

// Semantic versioning precedence (item 11); build metadata does not count.
function compareVersions(left: Version, right: Version): number {
  return Math.sign(left.major - right.major) || Math.sign(left.minor - right.minor)
    || Math.sign(left.patch - right.patch) || comparePrereleases(left.prerelease, right.prerelease);
}

// A breaking change is declared by a higher major version, or, while the major
// version is 0, by a higher minor version (semantic versioning item 4).
export function declaresBreakingChange(baseVersion: string, headVersion: string): boolean {
  const base = parseVersion(baseVersion);
  const head = parseVersion(headVersion);
  if (base === undefined || head === undefined) return false;
  if (head.major !== base.major) return head.major > base.major;
  return head.major === 0 && head.minor > base.minor;
}

export function versionProblems(path: string, version: unknown): string[] {
  if (typeof version === 'string' && parseVersion(version) !== undefined) return [];
  return [`${path}: info.version ${String(version)} is not a semantic version`];
}

export function compatibilityProblems(path: string, baseVersion: string, headVersion: string, breakingChanges: readonly string[]): string[] {
  const invalid = versionProblems(path, headVersion);
  if (invalid.length > 0) return invalid;
  if (breakingChanges.length === 0 || declaresBreakingChange(baseVersion, headVersion)) return [];
  return breakingChanges.map((change) => `${path}: breaking change without a new major version (or minor while 0.x) over ${baseVersion}: ${change}`);
}

export interface BreakingChangeDeclaration {
  readonly path: string;
  readonly version: string;
  readonly reason: string;
  readonly breakingChanges: readonly string[];
}

export interface DocumentComparison {
  readonly path: string;
  readonly baseVersion: string;
  readonly headVersion: string;
  readonly breakingChanges: readonly string[];
}

export interface DeclarationsReading {
  readonly declarations: readonly BreakingChangeDeclaration[];
  readonly problems: readonly string[];
}

export function sortedChanges(changes: readonly string[]): string[] {
  return [...new Set(changes)].sort(compareText);
}

// Entries above the merge-base version must be the head version, and that
// version must declare a breaking change; lower entries are history.
export function declarationProblems(document: DocumentComparison, declarations: readonly BreakingChangeDeclaration[]): string[] {
  const { path, baseVersion, headVersion } = document;
  const base = parseVersion(baseVersion);
  if (base === undefined) return [];
  const headDeclares = declaresBreakingChange(baseVersion, headVersion);
  const newer = declarations.filter((entry) => entry.path === path && isAbove(entry.version, base));
  const stale = newer.filter((entry) => !headDeclares || entry.version !== headVersion)
    .map((entry) => `${path}: stale entry ${entry.version} in ${BREAKING_CHANGES_PATH}: ${headVersion} over ${baseVersion} declares no breaking change of that version`);
  if (!headDeclares) return stale;
  const listed = newer.find((entry) => entry.version === headVersion)?.breakingChanges ?? [];
  return [...listedChangeProblems(document, listed), ...stale];
}

function isAbove(version: string, base: Version): boolean {
  const parsed = parseVersion(version);
  return parsed !== undefined && compareVersions(parsed, base) > 0;
}

function listedChangeProblems(document: DocumentComparison, listed: readonly string[]): string[] {
  const { path, baseVersion, headVersion } = document;
  const found = new Set(document.breakingChanges);
  const declared = new Set(listed);
  const undeclared = sortedChanges(document.breakingChanges).filter((change) => !declared.has(change))
    .map((change) => `${path}: breaking change of ${headVersion} over ${baseVersion} not listed in ${BREAKING_CHANGES_PATH}: ${change}`);
  const notFound = sortedChanges(listed).filter((change) => !found.has(change))
    .map((change) => `${path}: ${BREAKING_CHANGES_PATH} lists for ${headVersion} a change not found over ${baseVersion}: ${change}`);
  return [...undeclared, ...notFound];
}

let declarationsSchemaCheck: SchemaCheck | undefined;

function declarationsSchemaProblems(value: unknown): string[] {
  declarationsSchemaCheck ??= ajvSchemaCheck(JSON.parse(readFileSync(BREAKING_CHANGES_SCHEMA_PATH, 'utf8')));
  return declarationsSchemaCheck(value).map((problem) => `${BREAKING_CHANGES_PATH}: ${problem}`);
}

export function readDeclarations(text: string, documentPaths: readonly string[]): DeclarationsReading {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { declarations: [], problems: [`${BREAKING_CHANGES_PATH}: is not valid JSON`] };
  }
  const schemaProblems = declarationsSchemaProblems(value);
  if (schemaProblems.length > 0) return { declarations: [], problems: schemaProblems };
  const { declarations } = value as { declarations: BreakingChangeDeclaration[] };
  const problems = declarations.flatMap((_, index) => entryProblems(declarations, index, documentPaths)
    .map((problem) => `${BREAKING_CHANGES_PATH}: declarations/${index}: ${problem}`));
  return problems.length > 0 ? { declarations: [], problems } : { declarations, problems: [] };
}

function entryProblems(declarations: readonly BreakingChangeDeclaration[], index: number, documentPaths: readonly string[]): string[] {
  const entry = declarations[index];
  if (!documentPaths.includes(entry.path)) return [`${entry.path} is not a contract document`];
  if (parseVersion(entry.version) === undefined) return [`version ${entry.version} is not a semantic version`];
  const changes = entry.breakingChanges;
  const unsortedChanges = changes.some((change, at) => at > 0 && compareText(changes[at - 1], change) >= 0);
  return [...orderProblems(declarations[index - 1], entry), ...(unsortedChanges ? ['breakingChanges are not sorted and unique'] : [])];
}

// An invalid previous entry reports its own problem and orders nothing.
function orderProblems(previous: BreakingChangeDeclaration | undefined, entry: BreakingChangeDeclaration): string[] {
  if (previous === undefined || parseVersion(previous.version) === undefined) return [];
  const order = compareDeclarations(previous, entry);
  if (order === 0) return [`repeats ${entry.path} ${entry.version}`];
  return order > 0 ? ['is not sorted by path and version'] : [];
}

function compareDeclarations(left: BreakingChangeDeclaration, right: BreakingChangeDeclaration): number {
  return compareText(left.path, right.path) || compareVersions(parseVersion(left.version)!, parseVersion(right.version)!);
}

// The entries an author copies into the file, with a reason to fill.
export function listedDeclarations(documents: readonly DocumentComparison[]): BreakingChangeDeclaration[] {
  return documents.filter((document) => document.breakingChanges.length > 0)
    .map((document) => ({ path: document.path, version: document.headVersion, reason: '', breakingChanges: sortedChanges(document.breakingChanges) }))
    .sort(compareDeclarations);
}

export function formatDeclarations(declarations: readonly BreakingChangeDeclaration[]): string {
  return `${JSON.stringify({ declarations }, null, 2)}\n`;
}

interface OasdiffChange {
  readonly id: string;
  readonly text: string;
  readonly level: number;
  readonly operationId?: string;
}

export function oasdiffBreakingChanges(output: string): string[] {
  const changes: OasdiffChange[] = JSON.parse(output) ?? [];
  return changes
    .filter((change) => change.level >= OASDIFF_ERR)
    .map((change) => `${change.id}${change.operationId === undefined ? '' : ` (${change.operationId})`}: ${change.text}`);
}

function openapiBreakingChanges(baseText: string, headText: string): string[] {
  const directory = mkdtempSync(join(tmpdir(), 'taskelith-oasdiff-'));
  try {
    writeFileSync(join(directory, 'base.json'), baseText);
    writeFileSync(join(directory, 'head.json'), headText);
    const output = execFileSync('docker', [
      'run', '--rm', '--network', 'none', '--volume', `${directory}:/contracts:ro`, OASDIFF_IMAGE,
      'breaking', '/contracts/base.json', '/contracts/head.json', '--format', 'json', '--allow-external-refs=false',
    ], { encoding: 'utf8', timeout: 300_000 });
    return oasdiffBreakingChanges(output);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function parsedAsyncapi(text: string, label: string): Promise<unknown> {
  const { document } = await new Parser().parse(text);
  if (document === undefined) throw new Error(`${label} is not a valid AsyncAPI document`);
  return document.json();
}

interface AsyncapiChange {
  readonly action: string;
  readonly path: string;
}

// The parser's own annotations; documents may not use the prefix, so that
// every path through such a key is an annotation.
const PARSER_PREFIX = 'x-parser-';

export function reservedParserKeys(value: unknown, path = ''): string[] {
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}/${key}`;
    return [...(key.startsWith(PARSER_PREFIX) ? [childPath] : []), ...reservedParserKeys(child, childPath)];
  });
}

function reservedKeyProblems(path: string, document: unknown): string[] {
  return reservedParserKeys(document).map((key) => `${path}: the key ${key} uses the prefix ${PARSER_PREFIX}, which the AsyncAPI parser reserves`);
}

function isParserAnnotation(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith(PARSER_PREFIX));
}

// Unclassified changes, such as most payload schema changes, count as breaking;
// a new info.version declares changes, so it is checked separately.
export function asyncapiContractChanges(breaking: readonly AsyncapiChange[], unclassified: readonly AsyncapiChange[]): string[] {
  return [...breaking, ...unclassified]
    .filter((change) => change.path !== '/info/version' && !isParserAnnotation(change.path))
    .map((change) => `${change.action} ${change.path}`);
}

export async function asyncapiBreakingChanges(baseText: string, headText: string): Promise<string[]> {
  const output = diff(await parsedAsyncapi(baseText, 'base'), await parsedAsyncapi(headText, 'head'));
  return asyncapiContractChanges(output.breaking() as AsyncapiChange[], output.unclassified() as AsyncapiChange[]);
}

function git(args: readonly string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function succeeds(args: readonly string[]): boolean {
  try {
    git(args);
    return true;
  } catch {
    return false;
  }
}

// Fetches origin/dev when the clone lacks it, and the full history when a
// shallow clone, as in CI, cannot reach the merge base.
function mergeBase(): string {
  const refspec = `+refs/heads/${BASE_BRANCH}:refs/remotes/${BASE_REF}`;
  if (!succeeds(['rev-parse', '--verify', '--quiet', BASE_REF])) git(['fetch', '--no-tags', 'origin', refspec]);
  if (!succeeds(['merge-base', 'HEAD', BASE_REF]) && git(['rev-parse', '--is-shallow-repository']) === 'true') {
    git(['fetch', '--no-tags', '--unshallow', 'origin', refspec]);
  }
  return git(['merge-base', 'HEAD', BASE_REF]);
}

function textAt(revision: string, path: string): string | undefined {
  return succeeds(['cat-file', '-e', `${revision}:${path}`]) ? git(['show', `${revision}:${path}`]) : undefined;
}

interface DocumentsComparison {
  readonly comparisons: readonly DocumentComparison[];
  readonly problems: readonly string[];
}

async function compareDocuments(base: string, log: (line: string) => void): Promise<DocumentsComparison> {
  const comparisons: DocumentComparison[] = [];
  const problems: string[] = [];
  for (const { kind, path } of CONTRACT_DOCUMENTS) {
    const headText = readFileSync(path, 'utf8');
    const head = JSON.parse(headText);
    const invalid = [...versionProblems(path, head.info.version), ...(kind === 'asyncapi' ? reservedKeyProblems(path, head) : [])];
    problems.push(...invalid);
    const baseText = textAt(base, path);
    if (baseText === undefined) {
      log(`${path}: absent at the merge base ${base.slice(0, 12)}; nothing to compare.`);
      continue;
    }
    if (invalid.length > 0) continue;
    const breaking = kind === 'openapi' ? openapiBreakingChanges(baseText, headText) : await asyncapiBreakingChanges(baseText, headText);
    const breakingChanges = sortedChanges(breaking);
    comparisons.push({ path, baseVersion: JSON.parse(baseText).info.version, headVersion: head.info.version, breakingChanges });
    log(`${path}: ${breakingChanges.length} breaking change(s) against ${base.slice(0, 12)}.`);
  }
  return { comparisons, problems };
}

// A malformed file reports its own problems instead of every declaration.
async function checkDocuments(): Promise<string[]> {
  const reading = readDeclarations(readFileSync(BREAKING_CHANGES_PATH, 'utf8'), CONTRACT_DOCUMENTS.map(({ path }) => path));
  const { comparisons, problems } = await compareDocuments(mergeBase(), console.log);
  const documentProblems = comparisons.flatMap((document) => [
    ...compatibilityProblems(document.path, document.baseVersion, document.headVersion, document.breakingChanges),
    ...(reading.problems.length > 0 ? [] : declarationProblems(document, reading.declarations)),
  ]);
  return [...reading.problems, ...problems, ...documentProblems];
}

// Resolves BASE to a commit; --end-of-options keeps it from being an option.
function commitOf(revision: string): string {
  return git(['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`]);
}

async function printDeclarations(revision: string | undefined): Promise<string[]> {
  const base = revision === undefined ? mergeBase() : commitOf(revision);
  const { comparisons, problems } = await compareDocuments(base, console.error);
  process.stdout.write(formatDeclarations(listedDeclarations(comparisons)));
  return [...problems];
}

const USAGE = 'usage: check-contract-compatibility.ts [--print [--base <revision>]]';

export interface Mode {
  readonly print: boolean;
  readonly base?: string;
}

export function parseMode(args: readonly string[]): Mode | undefined {
  try {
    const { values } = parseArgs({ args: [...args], strict: true, options: { print: { type: 'boolean' }, base: { type: 'string' } } });
    if (values.base !== undefined && values.print !== true) return undefined;
    return { print: values.print === true, base: values.base };
  } catch {
    return undefined;
  }
}

if (import.meta.main) {
  const selected = parseMode(process.argv.slice(2));
  if (selected === undefined) {
    console.error(USAGE);
    process.exit(2);
  }
  const problems = selected.print ? await printDeclarations(selected.base) : await checkDocuments();
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  if (!selected.print) console.log('Contract documents have no undeclared breaking change.');
}
