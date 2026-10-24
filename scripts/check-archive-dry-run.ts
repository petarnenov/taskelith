import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Archives every active change in a temporary copy of openspec/ and validates
// the copy strictly, so that archive failures show before handoff.

const OPENSPEC_DIRECTORY = 'openspec';
const ARCHIVE_DIRECTORY = 'archive';
const OPENSPEC_BIN = join('node_modules', '.bin', 'openspec');
// Telemetry and the update check off keep the check offline.
const OFFLINE_ENVIRONMENT = { OPENSPEC_TELEMETRY: '0', DO_NOT_TRACK: '1', OPENSPEC_NO_UPDATE_CHECK: '1' };

interface DirectoryEntry {
  readonly name: string;
  isDirectory(): boolean;
}

export function directoryNames(entries: readonly DirectoryEntry[]): string[] {
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export function activeChanges(entries: readonly DirectoryEntry[]): string[] {
  return directoryNames(entries).filter((name) => name !== ARCHIVE_DIRECTORY);
}

interface ValidationIssue {
  readonly level: string;
  readonly path: string;
  readonly message: string;
}

interface ValidationItem {
  readonly id: string;
  readonly type: string;
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export interface ValidationReport {
  readonly items: readonly ValidationItem[];
}

function originOf(item: ValidationItem, capabilitiesByChange: ReadonlyMap<string, readonly string[]>): string {
  if (item.type === 'change') return item.id;
  const changes = [...capabilitiesByChange].filter(([, capabilities]) => capabilities.includes(item.id)).map(([change]) => change);
  return changes.length === 0 ? 'no active change' : changes.join(', ');
}

// Names each invalid item after the change itself or the changes whose
// deltas touch it; a change left active by a failed archive names itself.
export function validationProblems(report: ValidationReport, capabilitiesByChange: ReadonlyMap<string, readonly string[]>): string[] {
  return report.items
    .filter((item) => !item.valid)
    .flatMap((item) => {
      const origin = originOf(item, capabilitiesByChange);
      return item.issues.map((issue) => `${origin}: ${item.type} ${item.id}: [${issue.level}] ${issue.path}: ${issue.message}`);
    });
}

export function archiveProblem(change: string, output: string): string {
  return `${change}: openspec archive failed: ${output.trim()}`;
}

function subdirectories(directory: string): DirectoryEntry[] {
  return existsSync(directory) ? readdirSync(directory, { withFileTypes: true }) : [];
}

function capabilitiesOf(changesDirectory: string, change: string): string[] {
  return directoryNames(subdirectories(join(changesDirectory, change, 'specs')));
}

function openspec(copy: string, args: readonly string[]): string {
  return execFileSync(join(process.cwd(), OPENSPEC_BIN), args, {
    cwd: copy,
    encoding: 'utf8',
    env: { ...process.env, ...OFFLINE_ENVIRONMENT },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300_000,
  });
}

function commandOutput(error: unknown): string {
  const { stdout, stderr, message } = error as { stdout?: string; stderr?: string; message: string };
  return `${stdout ?? ''}${stderr ?? ''}` || message;
}

// A failed archive changes no file, so the remaining changes still archive.
function archiveAll(copy: string, changes: readonly string[]): string[] {
  return changes.flatMap((change) => {
    try {
      openspec(copy, ['archive', change, '--yes']);
      return [];
    } catch (error) {
      return [archiveProblem(change, commandOutput(error))];
    }
  });
}

// validate exits nonzero when an item fails but still prints its JSON report.
function validateAll(copy: string): ValidationReport {
  try {
    return JSON.parse(openspec(copy, ['validate', '--all', '--strict', '--json', '--no-interactive']));
  } catch (error) {
    const { stdout } = error as { stdout?: string };
    if (stdout === undefined || stdout === '') throw error;
    return JSON.parse(stdout);
  }
}

function checkArchives(): string[] {
  const changesDirectory = join(OPENSPEC_DIRECTORY, 'changes');
  const changes = activeChanges(subdirectories(changesDirectory));
  if (changes.length === 0) {
    console.log('No active OpenSpec change; nothing to archive.');
    return [];
  }
  const capabilitiesByChange = new Map(changes.map((change) => [change, capabilitiesOf(changesDirectory, change)]));
  const copy = mkdtempSync(join(tmpdir(), 'taskelith-archive-dry-run-'));
  try {
    cpSync(OPENSPEC_DIRECTORY, join(copy, OPENSPEC_DIRECTORY), { recursive: true });
    const archiveProblems = archiveAll(copy, changes);
    return [...archiveProblems, ...validationProblems(validateAll(copy), capabilitiesByChange)];
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const problems = checkArchives();
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  console.log('Every active OpenSpec change archives into strictly valid specs.');
}
