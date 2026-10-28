import { existsSync, statSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { checklistEffect, formatChecklistEffect, type ArchivedChecklist } from './checklist-effect.ts';
import type { ChecklistEnvironment } from './checklist-environment.ts';
import {
  CHECKLIST_FILE,
  checklistRecord,
  checklistSections,
  formatChecklistRecord,
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
import { formatRoutingEffect, type RoutingEffect } from './review-route-report.ts';

// The checklist and effect commands of npm run findings, over records that
// scripts/findings.ts has loaded and validated.

export interface SaveTarget {
  readonly change: string;
  readonly size?: Size;
}

// --at names the brief's dev commit, whose archive is ranked; --save
// needs it, so a saved record always names the commit it ranked.
export type ChecklistCommand =
  | { readonly query: ChecklistQuery; readonly json: boolean; readonly at?: string; readonly save?: undefined }
  | { readonly query: ChecklistQuery; readonly json: false; readonly at: string; readonly save: SaveTarget };

// Archived findings and the dev commit they are as of, when known.
export interface ArchiveSource {
  readonly commit?: string;
  readonly findings: readonly Finding[];
}

export interface CommittedArchive extends ArchiveSource {
  readonly commit: string;
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
  // The archive of the dev commit when git can read it, else the tree's.
  readonly current: ArchiveSource;
  // The archive as of a commit, or a message why it cannot be read.
  archiveAt(commit: string): CommittedArchive | string;
}

const ACTIVE_DIRECTORY = 'openspec/changes';
const RESERVED_DIRECTORY = 'archive';

type SaveCommand = Extract<ChecklistCommand, { readonly save: SaveTarget }>;

export function runChecklist(command: ChecklistCommand, context: ChecklistContext): CommandResult {
  if (command.save !== undefined) return saveChecklist(command, context);
  const source = command.at === undefined ? context.current : context.archiveAt(command.at);
  if (typeof source === 'string') return failure(source);
  const { sections, text } = renderChecklist(command.query, source, context.categories);
  if (!command.json) return success(text);
  return success(JSON.stringify({ query: command.query, devCommit: source.commit ?? null, ...sections }, null, 2));
}

function renderChecklist(query: ChecklistQuery, source: ArchiveSource, categories: readonly Category[]) {
  const sections = checklistSections(source.findings, categories, query);
  const text = [
    formatChecklist(sections.review, query),
    formatRecordChecklist(sections.recordQuality),
    ...(source.commit === undefined ? [] : [`Dev commit: ${source.commit}.`]),
  ].join('\n\n');
  return { sections, text };
}

function isActiveChange(root: string, change: string): boolean {
  const directory = posix.join(root, ACTIVE_DIRECTORY, change);
  return change !== RESERVED_DIRECTORY && existsSync(directory) && statSync(directory).isDirectory();
}

function saveChecklist({ query, at, save }: SaveCommand, { root, environment, categories, archiveAt }: ChecklistContext): CommandResult {
  const archive = archiveAt(at);
  if (typeof archive === 'string') return failure(archive);
  const directory = posix.join(ACTIVE_DIRECTORY, save.change);
  const path = posix.join(directory, CHECKLIST_FILE);
  if (!isActiveChange(root, save.change)) return failure(`${directory} is not an active change; create the change first.`);
  if (existsSync(posix.join(root, path))) {
    return failure(`${path} already exists; the checklist is recorded once, at plan time.`);
  }
  const { sections, text } = renderChecklist(query, archive, categories);
  const recordContext = { change: save.change, generatedAt: environment.now().toISOString(), devCommit: archive.commit, query, size: save.size };
  writeFileSync(posix.join(root, path), formatChecklistRecord(checklistRecord(recordContext, sections, archive.findings)), { flag: 'wx' });
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
  readonly routing: RoutingEffect;
}

// `<date>-<change>`: the archive directory starts with the archive date.
export function runEffect(json: boolean, { root, environment, archivedChanges, checklists, routing }: EffectContext): CommandResult {
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
  if (json) return success(JSON.stringify({ ...effect, routing }, null, 2));
  return success(`${formatChecklistEffect(effect)}\n\n${formatRoutingEffect(routing)}`);
}

function success(stdout: string): CommandResult {
  return { exitCode: 0, stdout, stderr: '' };
}

function failure(stderr: string): CommandResult {
  return { exitCode: 1, stdout: '', stderr };
}
