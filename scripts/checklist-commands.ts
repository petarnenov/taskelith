import { existsSync, writeFileSync } from 'node:fs';
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
  readonly save?: SaveTarget;
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ChecklistContext {
  readonly root: string;
  readonly environment: ChecklistEnvironment;
  readonly archived: readonly Finding[];
  readonly categories: readonly Category[];
}

const ACTIVE_DIRECTORY = 'openspec/changes';

export function runChecklist({ query, json, save }: ChecklistCommand, context: ChecklistContext): CommandResult {
  const sections = checklistSections(context.archived, context.categories, query);
  if (json) return success(JSON.stringify({ query, ...sections }, null, 2));
  const text = `${formatChecklist(sections.review, query)}\n\n${formatRecordChecklist(sections.recordQuality)}`;
  return save === undefined ? success(text) : saveChecklist(save, query, sections, text, context);
}

function saveChecklist(target: SaveTarget, query: ChecklistQuery, sections: ChecklistSections, text: string, context: ChecklistContext): CommandResult {
  const directory = posix.join(ACTIVE_DIRECTORY, target.change);
  const path = posix.join(directory, CHECKLIST_FILE);
  if (!existsSync(posix.join(context.root, directory))) {
    return failure(`${directory} is not an active change; create the change first.`);
  }
  if (existsSync(posix.join(context.root, path))) {
    return failure(`${path} already exists; the checklist is recorded once, at plan time.`);
  }
  const { environment, root, archived } = context;
  const recordContext = {
    change: target.change,
    generatedAt: environment.now().toISOString(),
    devCommit: environment.devCommit(root),
    query,
    size: target.size,
  };
  writeFileSync(posix.join(root, path), formatChecklistRecord(checklistRecord(recordContext, sections, archived)), { flag: 'wx' });
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
