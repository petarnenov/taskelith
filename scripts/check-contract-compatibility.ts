import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diff } from '@asyncapi/diff';
import { Parser } from '@asyncapi/parser';
import { CONTRACT_DOCUMENTS } from './generate-contracts.ts';

// Fails on a contract change since the origin/dev merge base that info.version
// does not declare (ADR 0004 principle 6), using oasdiff and @asyncapi/diff.

export const OASDIFF_IMAGE = 'tufin/oasdiff:v1.34.1@sha256:67a23cfea7d251e2ae34ee703ac8733c5d96bc2e7b90fd0f4d475ec99367b85f';
const BASE_BRANCH = 'dev';
const BASE_REF = `origin/${BASE_BRANCH}`;
// oasdiff levels: 1 INFO, 2 WARN, 3 ERR. ERR is a breaking change.
const OASDIFF_ERR = 3;
// The semantic versioning 2.0.0 grammar, with prerelease and build metadata.
const PRERELEASE_IDENTIFIER = '(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)';
const SEMANTIC_VERSION = new RegExp(
  '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)'
  + `(?:-${PRERELEASE_IDENTIFIER}(?:\\.${PRERELEASE_IDENTIFIER})*)?`
  + '(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?$',
);

interface Version {
  readonly major: number;
  readonly minor: number;
}

function parseVersion(text: string): Version | undefined {
  const match = SEMANTIC_VERSION.exec(text);
  return match === null ? undefined : { major: Number(match[1]), minor: Number(match[2]) };
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

async function asyncapiBreakingChanges(baseText: string, headText: string): Promise<string[]> {
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

async function checkDocuments(): Promise<string[]> {
  const base = mergeBase();
  const problems: string[] = [];
  for (const [kind, path] of Object.entries(CONTRACT_DOCUMENTS)) {
    const headText = readFileSync(path, 'utf8');
    const head = JSON.parse(headText);
    const invalid = [...versionProblems(path, head.info.version), ...(kind === 'asyncapi' ? reservedKeyProblems(path, head) : [])];
    problems.push(...invalid);
    const baseText = textAt(base, path);
    if (baseText === undefined) {
      console.log(`${path}: absent at the merge base ${base.slice(0, 12)}; nothing to compare.`);
      continue;
    }
    if (invalid.length > 0) continue;
    const breaking = kind === 'openapi' ? openapiBreakingChanges(baseText, headText) : await asyncapiBreakingChanges(baseText, headText);
    problems.push(...compatibilityProblems(path, JSON.parse(baseText).info.version, head.info.version, breaking));
    console.log(`${path}: ${breaking.length} breaking change(s) against ${base.slice(0, 12)}.`);
  }
  return problems;
}

if (import.meta.main) {
  const problems = await checkDocuments();
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  console.log('Contract documents have no undeclared breaking change.');
}
