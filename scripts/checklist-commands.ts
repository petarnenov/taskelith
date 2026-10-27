import { existsSync, statSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { checklistEffect, formatChecklistEffect, type ArchivedChecklist } from './checklist-effect.ts';
import type { ChecklistEnvironment } from './checklist-environment.ts';
import {
  CHECKLIST_FILE,
  checklistRecord,
  checklistSections,
  formatChecklistRecord,
  type ChecklistSections,
  type LocatedChecklist,
  type Size,
} from './checklist-record.ts';
import {
  formatChecklist,
  formatRecordChecklist,
  type Category,
  type ChecklistQuery,
  type Finding,
} from './review-findings.ts';

// The checklist and effect commands of npm run findings, over records that
// scripts/findings.ts has loaded and validated.

export interface SaveTarget {
  readonly change: string;
  readonly size?: Size;
}

export interface ChecklistCommand {
  readonly query: ChecklistQuery;
  readonly json: boolean;
  // The brief's dev commit, whose archive is ranked instead of the tree's.
  readonly at?: string;
  readonly save?: SaveTarget;
}

// Archived findings and the dev commit they are as of, when known.
export interface ArchiveSource {
  readonly commit?: string;
  readonly findings: readonly Finding[];
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ChecklistContext {
  readonly root: string;
  readonly environment: ChecklistEnvironment;
  readonly categories: readonly Category[];
  readonly current: ArchiveSource;
  // The archive as of a commit, or a message why it cannot be read.
  archiveAt(commit: string): ArchiveSource | string;
}

const ACTIVE_DIRECTORY = 'openspec/changes';
const RESERVED_DIRECTORY = 'archive';

export function runChecklist({ query, json, at, save }: ChecklistCommand, context: ChecklistContext): CommandResult {
  const source = at === undefined ? context.current : context.archiveAt(at);
  if (typeof source === 'string') return failure(source);
  const sections = checklistSections(source.findings, context.categories, query);
  if (json) return success(JSON.stringify({ query, devCommit: source.commit ?? null, ...sections }, null, 2));
  const text = [
    formatChecklist(sections.review, query),
    formatRecordChecklist(sections.recordQuality),
    ...(source.commit === undefined ? [] : [`Dev commit: ${source.commit}.`]),
  ].join('\n\n');
  if (save === undefined) return success(text);
  if (source.commit === undefined) return failure('--save needs --at <dev commit of the brief>.');
  return saveChecklist({ target: save, query, sections, text, devCommit: source.commit, findings: source.findings }, context);
}

interface Saving {
  readonly target: SaveTarget;
  readonly query: ChecklistQuery;
  readonly sections: ChecklistSections;
  readonly text: string;
  readonly devCommit: string;
  readonly findings: readonly Finding[];
}

function isActiveChange(root: string, change: string): boolean {
  const directory = posix.join(root, ACTIVE_DIRECTORY, change);
  return change !== RESERVED_DIRECTORY && existsSync(directory) && statSync(directory).isDirectory();
}

function saveChecklist({ target, query, sections, text, devCommit, findings }: Saving, { root, environment }: ChecklistContext): CommandResult {
  const directory = posix.join(ACTIVE_DIRECTORY, target.change);
  const path = posix.join(directory, CHECKLIST_FILE);
  if (!isActiveChange(root, target.change)) return failure(`${directory} is not an active change; create the change first.`);
  if (existsSync(posix.join(root, path))) {
    return failure(`${path} already exists; the checklist is recorded once, at plan time.`);
  }
  const recordContext = {
    change: target.change,
    generatedAt: environment.now().toISOString(),
    devCommit,
    query,
    size: target.size,
  };
  writeFileSync(posix.join(root, path), formatChecklistRecord(checklistRecord(recordContext, sections, findings)), { flag: 'wx' });
  return success(`${text}\n\nSaved the checklist to ${path}.`);
}

export interface ArchivedChange {
  readonly directory: string;
  readonly change: string;
  readonly findings: readonly Finding[];
}

export interface EffectContext {
  readonly root: string;
  readonly environment: ChecklistEnvironment;
  readonly archivedChanges: readonly ArchivedChange[];
  readonly checklists: readonly LocatedChecklist[];
}

// `<date>-<change>`: the archive directory starts with the archive date.
export function runEffect(json: boolean, { root, environment, archivedChanges, checklists }: EffectContext): CommandResult {
  const recorded = new Map(checklists.map(({ location, record }) => [location.directory, record]));
  const measured: ArchivedChecklist[] = [];
  for (const { directory, change, findings } of archivedChanges) {
    const record = recorded.get(directory);
    if (record === undefined) continue;
    const archiveDirectory = posix.basename(directory);
    const linesChanged = record.size === undefined
      ? environment.linesChanged(root, archiveDirectory, record.devCommit)
      : undefined;
    measured.push({ change, archivedOn: archiveDirectory.slice(0, 10), record, findings, linesChanged });
  }
  const noChecklist = archivedChanges.filter(({ directory }) => !recorded.has(directory)).map(({ change }) => change);
  const effect = checklistEffect(measured, noChecklist);
  return success(json ? JSON.stringify(effect, null, 2) : formatChecklistEffect(effect));
}

function success(stdout: string): CommandResult {
  return { exitCode: 0, stdout, stderr: '' };
}

function failure(stderr: string): CommandResult {
  return { exitCode: 1, stdout: '', stderr };
}
