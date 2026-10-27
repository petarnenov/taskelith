import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFindings } from './findings.ts';
import { reviewerKey, type Reviewer } from './review-findings.ts';
import {
  currentToolchain, gitIn, mergeBase, readStamp, stampDirectory, stampFields, stampKey, type Git, type Toolchain,
  type VerifyProfile,
} from './verify-stamp.ts';

// make record and make record-check: the mechanical part of a change's
// verification.md, generated between markers and checked against the tree.

export const BEGIN = '<!-- make record: begin -->';
export const END = '<!-- make record: end -->';
const CHANGES = 'openspec/changes';
const BASE_REF = 'origin/dev';
const VERIFIED = /^make verify: passed, profile (full|docs-only), tree ([0-9a-f]{40,64}); stamp written$/;
const RUN_START = /^make verify: profile (full|docs-only) \(/;
const VERIFY_LINE = /^- `make verify`: passed, profile (full|docs-only), tree `([0-9a-f]{40,64})`/;

export class RecordError extends Error {}

export interface Probes {
  readonly openspecValidate: (change: string, archived: boolean) => string;
  readonly findingsValidate: () => string;
}

export interface RecordContext {
  readonly root: string;
  readonly git: Git;
  readonly probes: Probes;
  readonly toolchain: () => Toolchain;
}

export interface ChangeLocation {
  readonly change: string;
  readonly directory: string;
  readonly archived: boolean;
}

export function locateChange(root: string, change: string): ChangeLocation {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(change)) throw new RecordError(`invalid change name: ${change}`);
  const active = posix.join(CHANGES, change);
  if (existsSync(join(root, active))) return { change, directory: active, archived: false };
  const archive = posix.join(CHANGES, 'archive');
  const archived = existsSync(join(root, archive))
    ? readdirSync(join(root, archive)).filter((name) => name.endsWith(`-${change}`) && /^\d{4}-\d{2}-\d{2}-/.test(name))
    : [];
  if (archived.length !== 1) throw new RecordError(`no single active or archived change named ${change}`);
  return { change, directory: posix.join(archive, archived[0]), archived: true };
}

export interface VerifyResult {
  readonly profile: VerifyProfile;
  readonly tree: string;
  readonly counts: string;
  readonly coverage: string;
}

const TOTALS = ['tests', 'pass', 'fail', 'skipped', 'cancelled', 'todo'] as const;
type Total = typeof TOTALS[number];

// The last run of the log: from its profile line to the stamp line, which
// must end the log, so that no later failure or second run is mixed in.
function lastRun(log: string): { readonly profile: VerifyProfile; readonly tree: string; readonly lines: string[] } {
  const lines = log.split('\n').map((line) => line.trimEnd()).filter((line) => line !== '');
  const result = VERIFIED.exec(lines.at(-1) ?? '');
  if (result === null) throw new RecordError('the log does not end with a passing make verify of a clean tree with a stamp');
  const start = lines.map((line) => RUN_START.test(line)).lastIndexOf(true);
  if (start === -1) throw new RecordError('the log has no make verify profile line before its result');
  const startProfile = RUN_START.exec(lines[start])?.[1];
  if (startProfile !== result[1]) throw new RecordError(`the run started with profile ${startProfile} but stamped ${result[1]}`);
  return { profile: result[1] as VerifyProfile, tree: result[2], lines: lines.slice(start) };
}

function single(lines: readonly string[], pattern: RegExp, what: string): RegExpExecArray | undefined {
  const matches = lines.map((line) => pattern.exec(line)).filter((match) => match !== null);
  if (matches.length > 1) throw new RecordError(`the run reports ${matches.length} ${what} lines`);
  return matches[0];
}

function testTotals(lines: readonly string[]): Partial<Record<Total, number>> {
  const totals: Partial<Record<Total, number>> = {};
  for (const name of TOTALS) {
    const match = single(lines, new RegExp(`^\\S* ?${name} (\\d+)$`), `"${name}" total`);
    if (match !== undefined) totals[name] = Number(match[1]);
  }
  return totals;
}

function countsText(totals: Partial<Record<Total, number>>, profile: VerifyProfile): string {
  const { tests, pass, fail, skipped, cancelled = 0, todo = 0 } = totals;
  if (tests === undefined || pass === undefined || fail === undefined || skipped === undefined) {
    if (profile === 'full') throw new RecordError('the full run reports no test totals');
    return 'no test totals in the log';
  }
  if (fail !== 0 || cancelled !== 0) throw new RecordError(`the run reports ${fail} failed and ${cancelled} cancelled tests`);
  if (tests !== pass + fail + skipped + cancelled + todo) throw new RecordError(`the run's totals contradict each other: tests ${tests}, pass ${pass}, skipped ${skipped}, todo ${todo}`);
  return `tests ${tests}, pass ${pass}, fail ${fail}, skipped ${skipped}`;
}

// Reads the last run of a make verify log: its stamped result line, the
// test runner's totals, and its coverage totals; rejects a mixed log.
export function parseVerifyLog(log: string): VerifyResult {
  const run = lastRun(log);
  const counts = countsText(testTotals(run.lines), run.profile);
  const coverage = single(run.lines, /all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/, 'coverage total');
  if (coverage === undefined && run.profile === 'full') throw new RecordError('the full run reports no coverage totals');
  return {
    profile: run.profile,
    tree: run.tree,
    counts,
    coverage: coverage === undefined ? 'no coverage totals' : `all files ${coverage[1]}% lines, ${coverage[2]}% branches, ${coverage[3]}% functions`,
  };
}

export function verifyLine(result: VerifyResult): string {
  return `- \`make verify\`: passed, profile ${result.profile}, tree \`${result.tree}\`; ${result.counts}; ${result.coverage}.`;
}

function attempt(git: Git, args: readonly string[]): string | undefined {
  try {
    return git(args).trim();
  } catch {
    return undefined;
  }
}

export function specDiffLine(git: Git): string {
  const base = attempt(git, ['merge-base', 'HEAD', BASE_REF]);
  if (base === undefined || base === '') return `- Spec diff: no merge base with \`${BASE_REF}\`.`;
  const stat = git(['diff', '--stat', base, '--', 'openspec/specs']).trim().split('\n').filter((line) => line !== '');
  const summary = stat.length === 0 ? 'no change under `openspec/specs`' : stat.map((line) => `\`${line.trim().replace(/\s+/g, ' ')}\``).join(', ');
  return `- Spec diff against the merge base \`${base.slice(0, 12)}\` with \`${BASE_REF}\`: ${summary}.`;
}

interface PassLine {
  readonly artifact?: string;
  readonly pass: number;
  readonly role: string;
  readonly reviewer: Reviewer;
  readonly session: string;
  readonly counts: Readonly<Record<'critical' | 'high' | 'medium' | 'low', number>>;
}

export function passesLines(text: string): string[] {
  const passes = text.split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as PassLine);
  if (passes.length === 0) return ['- Review passes in `passes.jsonl`: none yet.'];
  return [
    '- Review passes in `passes.jsonl`:',
    '',
    '| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...passes.map(({ artifact, pass, role, reviewer, session, counts }) =>
      `| ${artifact === undefined ? pass : `${artifact} ${pass}`} | ${role} | \`${reviewerKey(reviewer)}\` | \`${session}\` | ${counts.critical} | ${counts.high} | ${counts.medium} | ${counts.low} |`),
  ];
}

function readText(root: string, path: string): string {
  return existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : '';
}

// Every part but the make verify line is recomputed from the tree.
export function derivedLines(context: RecordContext, location: ChangeLocation): string[] {
  const { change, directory, archived } = location;
  const validate = archived ? 'npm run openspec -- validate --all --strict --no-interactive' : `npm run openspec -- validate ${change} --strict`;
  return [
    `- \`${validate}\`: ${context.probes.openspecValidate(change, archived)}.`,
    `- \`make findings ARGS="validate"\`: ${context.probes.findingsValidate()}.`,
    specDiffLine(context.git),
    ...passesLines(readText(context.root, posix.join(directory, 'passes.jsonl'))),
  ];
}

export function renderBlock(verify: string, derived: readonly string[]): string {
  return [
    BEGIN,
    '## Generated checks',
    '',
    'Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.',
    '',
    verify,
    ...derived,
    END,
  ].join('\n');
}

interface Split {
  readonly before: string;
  readonly block: string | undefined;
  readonly after: string;
}

export function splitRecord(text: string): Split {
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (begin === -1 && end === -1) return { before: text, block: undefined, after: '' };
  if (begin === -1 || end < begin || text.indexOf(BEGIN, begin + 1) !== -1) throw new RecordError('verification.md has unmatched or repeated make record markers');
  return { before: text.slice(0, begin), block: text.slice(begin, end + END.length), after: text.slice(end + END.length) };
}

// The first time, the block goes before the review or the limitations, so
// that the remaining gates stay last.
export function insertBlock(text: string, block: string): string {
  const split = splitRecord(text);
  if (split.block !== undefined) return `${split.before}${block}${split.after}`;
  for (const heading of ['\n## Independent review', '\n## Limitations', '\n## Remaining gates']) {
    const index = text.indexOf(heading);
    if (index !== -1) return `${text.slice(0, index + 1)}${block}\n${text.slice(index)}`;
  }
  return `${text.replace(/\n*$/, '\n\n')}${block}\n`;
}

// make record stores the line it generated next to the run's stamp, so
// that record-check can tell it from a hand edit; both stay in this clone.
function stampRecordPath(context: RecordContext, tree: string, profile: VerifyProfile): string | undefined {
  const fields = stampFields(context.root, { tree, base: mergeBase(context.git) }, profile, context.toolchain());
  const directory = stampDirectory(context.git);
  return readStamp(directory, fields) === undefined ? undefined : join(directory, `${stampKey(fields)}.record`);
}

function recordedVerifyLine(context: RecordContext, log: string): string {
  const result = parseVerifyLog(log);
  const line = verifyLine(result);
  const path = stampRecordPath(context, result.tree, result.profile);
  if (path === undefined) throw new RecordError(`no ${result.profile} make verify stamp of tree ${result.tree.slice(0, 12)} in this clone`);
  writeFileSync(path, `${line}\n`);
  return line;
}

export function writeRecord(context: RecordContext, change: string, log: string | undefined): string {
  const location = locateChange(context.root, change);
  const path = posix.join(location.directory, 'verification.md');
  const verify = log === undefined
    ? '- `make verify`: not recorded; run `make record` with `LOG=<make verify log>`.'
    : recordedVerifyLine(context, log);
  const block = renderBlock(verify, derivedLines(context, location));
  writeFileSync(join(context.root, path), insertBlock(readText(context.root, path), block));
  return `make record: wrote the generated part of ${path}`;
}

function changedSince(git: Git, tree: string): string[] {
  const tracked = git(['diff', '--name-only', '--no-renames', tree]).split('\n');
  const untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n');
  return [...tracked, ...untracked].filter((line) => line !== '');
}

function storedLine(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : undefined;
}

function verifyProblems(context: RecordContext, verify: string, recordPath: string): string[] {
  const recorded = VERIFY_LINE.exec(verify);
  if (recorded === null) return ['the make verify line records no passing run; run make record with LOG'];
  const profile = recorded[1] as VerifyProfile;
  const tree = recorded[2];
  const problems: string[] = [];
  const changed = attempt(context.git, ['cat-file', '-e', `${tree}^{tree}`]) === undefined
    ? undefined
    : changedSince(context.git, tree).filter((path) => path !== recordPath);
  if (changed === undefined) problems.push(`the verified tree ${tree.slice(0, 12)} is not in this clone`);
  else if (changed.length > 0) problems.push(`the working tree differs from the verified tree ${tree.slice(0, 12)}: ${changed.join(', ')}`);
  const stored = stampRecordPath(context, tree, profile);
  if (stored === undefined) problems.push(`no ${profile} make verify stamp of tree ${tree.slice(0, 12)} in this clone`);
  else if (storedLine(stored) !== verify) problems.push('the make verify line differs from the one make record wrote from the log');
  return problems;
}

export function checkRecord(context: RecordContext, change: string): string[] {
  const location = locateChange(context.root, change);
  const path = posix.join(location.directory, 'verification.md');
  const { block } = splitRecord(readText(context.root, path));
  if (block === undefined) return [`${path}: no generated part; run make record`];
  const lines = block.split('\n');
  const verify = lines.find((line) => line.startsWith('- `make verify`:')) ?? '';
  const expected = renderBlock(verify, derivedLines(context, location)).split('\n');
  const stale = expected.filter((line, index) => lines[index] !== line).map((line) => `stale or missing: ${line}`);
  if (lines.length !== expected.length) stale.push(`the generated part has ${lines.length} lines, expected ${expected.length}`);
  return [...stale, ...verifyProblems(context, verify, path)].map((problem) => `${path}: ${problem}`);
}

function output(command: string, args: readonly string[], root: string): { readonly ok: boolean; readonly text: string } {
  try {
    return { ok: true, text: execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, text: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

function lastLine(text: string): string {
  return text.trim().split('\n').at(-1)?.trim() ?? '';
}

export function systemProbes(root: string): Probes {
  return {
    openspecValidate(change, archived) {
      const args = archived ? ['validate', '--all', '--strict', '--no-interactive'] : ['validate', change, '--strict'];
      const result = output('npm', ['run', '--silent', 'openspec', '--', ...args], root);
      return `${result.ok ? 'passed' : 'failed'}, \`${lastLine(result.text)}\``;
    },
    findingsValidate() {
      const result = runFindings(['validate'], root);
      return result.exitCode === 0 ? `passed, \`${lastLine(result.stdout)}\`` : `failed, \`${lastLine(result.stderr)}\``;
    },
  };
}

export const USAGE = 'usage: verification-record.ts write <change> [<make verify log>] | check <change>';

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function runCommand(args: readonly string[], context: RecordContext): CommandResult {
  const [command, change, log, ...rest] = args;
  try {
    if (command === 'write' && change !== undefined && rest.length === 0) {
      const logText = log === undefined || log === '' ? undefined : readFileSync(log, 'utf8');
      return { status: 0, stdout: `${writeRecord(context, change, logText)}\n`, stderr: '' };
    }
    if (command === 'check' && change !== undefined && log === undefined) {
      const problems = checkRecord(context, change);
      if (problems.length === 0) return { status: 0, stdout: 'make record-check: the generated part matches the tree\n', stderr: '' };
      return { status: 1, stdout: '', stderr: `${problems.join('\n')}\nmake record-check: ${problems.length} problem(s)\n` };
    }
    throw new RecordError(USAGE);
  } catch (error) {
    if (error instanceof RecordError) return { status: 2, stdout: '', stderr: `${error.message}\n` };
    throw error;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const result = runCommand(process.argv.slice(2), { root, git: gitIn(root), probes: systemProbes(root), toolchain: currentToolchain });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.status;
}
