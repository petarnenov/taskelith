import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diff } from '@asyncapi/diff';
import { Parser } from '@asyncapi/parser';
import { CONTRACT_DOCUMENTS } from './generate-contracts.ts';

// Fails when a contract document has a breaking change against its version at
// the merge base with origin/dev and its info.version does not declare it
// (ADR 0004 principle 6). OpenAPI documents are compared by oasdiff, run only
// as its digest-pinned container without network access; AsyncAPI documents
// by @asyncapi/diff. A document absent at the merge base passes.

export const OASDIFF_IMAGE = 'tufin/oasdiff:v1.34.1@sha256:67a23cfea7d251e2ae34ee703ac8733c5d96bc2e7b90fd0f4d475ec99367b85f';
const BASE_BRANCH = 'dev';
const BASE_REF = `origin/${BASE_BRANCH}`;
// oasdiff levels: 1 INFO, 2 WARN, 3 ERR. ERR is a breaking change.
const OASDIFF_ERR = 3;
const SEMANTIC_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+].*)?$/;

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

export function compatibilityProblems(path: string, baseVersion: string, headVersion: string, breakingChanges: readonly string[]): string[] {
  if (parseVersion(headVersion) === undefined) return [`${path}: info.version ${headVersion} is not a semantic version`];
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

// @asyncapi/diff leaves changes its standard does not classify, such as most
// changes inside a payload schema, unclassified; they are treated as breaking.
// The parser's own x-parser-* annotations are not part of the contract.
export function asyncapiContractChanges(breaking: readonly AsyncapiChange[], unclassified: readonly AsyncapiChange[]): string[] {
  return [...breaking, ...unclassified]
    .filter((change) => !change.path.split('/').some((segment) => segment.startsWith('x-parser-')))
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
    const baseText = textAt(base, path);
    if (baseText === undefined) {
      console.log(`${path}: absent at the merge base ${base.slice(0, 12)}; nothing to compare.`);
      continue;
    }
    const headText = readFileSync(path, 'utf8');
    const breaking = kind === 'openapi' ? openapiBreakingChanges(baseText, headText) : await asyncapiBreakingChanges(baseText, headText);
    const versions = [JSON.parse(baseText).info.version, JSON.parse(headText).info.version];
    problems.push(...compatibilityProblems(path, versions[0], versions[1], breaking));
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
