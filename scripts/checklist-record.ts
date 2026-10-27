import { posix } from 'node:path';
import {
  checklist,
  isRecordFinding,
  recordChecklist,
  VOCABULARY_PATH,
  type Category,
  type ChecklistItem,
  type ChecklistQuery,
  type Finding,
  type Problem,
  type RecordSource,
  type SchemaCheck,
} from './review-findings.ts';

// Pure rules of a change's checklist.json, the review checklist of its
// brief. File and git access stay in scripts/findings.ts.

export const CHECKLIST_FILE = 'checklist.json';
export const CHECKLIST_SCHEMA_PATH = 'docs/review-findings/checklist.schema.json';
// Active changes opened after this change's archive record their checklist.
export const LANDING_CHANGE = 'measure-checklist-effect';

export const SIZE_POINTS = { S: 1, 'S-M': 1.5, M: 2, 'M-L': 2.5, L: 3 } as const;
export type Size = keyof typeof SIZE_POINTS;

export function isSize(value: string): value is Size {
  return Object.hasOwn(SIZE_POINTS, value);
}

export interface Share {
  readonly findings: number;
  readonly inChecklist: number;
}

export interface Baseline {
  readonly all: Share;
  readonly mediumOrWorse: Share;
}

export interface RankedCategory {
  readonly category: string;
  readonly count: number;
}

export interface ChecklistSection {
  readonly categories: readonly RankedCategory[];
  readonly baseline: Baseline;
}

export interface ChecklistRecord {
  readonly change: string;
  readonly generatedAt: string;
  readonly devCommit: string;
  readonly query: ChecklistQuery;
  readonly size?: Size;
  readonly review: ChecklistSection;
  readonly recordQuality: ChecklistSection;
}

export interface ChecklistSections {
  readonly review: readonly ChecklistItem[];
  readonly recordQuality: readonly ChecklistItem[];
}

// Record quality is ranked whatever the query, because record findings
// often name no capability and no file of the task.
export function checklistSections(archived: readonly Finding[], categories: readonly Category[], query: ChecklistQuery): ChecklistSections {
  return {
    review: checklist(archived, categories, query),
    recordQuality: recordChecklist(archived, categories, query.top),
  };
}

export function isMediumOrWorse({ severity }: Finding): boolean {
  return severity !== 'low';
}

export function shareOf(findings: readonly Finding[], listed: ReadonlySet<string>): Share {
  return { findings: findings.length, inChecklist: findings.filter(({ category }) => listed.has(category)).length };
}

export function baselineOf(findings: readonly Finding[], listed: ReadonlySet<string>): Baseline {
  return { all: shareOf(findings, listed), mediumOrWorse: shareOf(findings.filter(isMediumOrWorse), listed) };
}

export function listedCategories({ categories }: ChecklistSection): Set<string> {
  return new Set(categories.map(({ category }) => category));
}

export interface RecordContext {
  readonly change: string;
  readonly generatedAt: string;
  readonly devCommit: string;
  readonly query: ChecklistQuery;
  readonly size?: Size;
}

// The review baseline is every archived code finding, the record quality
// baseline every archived record finding, whatever the query.
export function checklistRecord(context: RecordContext, sections: ChecklistSections, archived: readonly Finding[]): ChecklistRecord {
  const section = (items: readonly ChecklistItem[], population: readonly Finding[]): ChecklistSection => {
    const categories = items.map(({ category, count }) => ({ category, count }));
    return { categories, baseline: baselineOf(population, new Set(categories.map(({ category }) => category))) };
  };
  const { size, ...rest } = context;
  return {
    ...rest,
    ...(size === undefined ? {} : { size }),
    review: section(sections.review, archived.filter((finding) => !isRecordFinding(finding))),
    recordQuality: section(sections.recordQuality, archived.filter(isRecordFinding)),
  };
}

export function formatChecklistRecord(record: ChecklistRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export interface ParsedChecklist {
  readonly record?: ChecklistRecord;
  readonly problems: readonly string[];
}

export function parseChecklistRecord(source: RecordSource, checkSchema: SchemaCheck, categories: ReadonlySet<string>): ParsedChecklist {
  const value = parseJson(source.text);
  if (value === undefined) return { problems: ['not a JSON value'] };
  const violations = checkSchema(value);
  if (violations.length > 0) return { problems: violations };
  const record = value as ChecklistRecord;
  const problems = recordProblems(record, source.change, categories);
  return problems.length > 0 ? { problems } : { record, problems };
}

// The parser's message quotes the input, so callers get no message.
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function recordProblems(record: ChecklistRecord, change: string, categories: ReadonlySet<string>): string[] {
  const named = [...record.review.categories, ...record.recordQuality.categories].map(({ category }) => category);
  const unknown = [...new Set(named.filter((category) => !categories.has(category)))];
  return [
    ...(record.change === change ? [] : [`change "${record.change}" is not this change "${change}"`]),
    ...unknown.map((category) => `unknown category "${category}"; categories are listed in ${VOCABULARY_PATH}`),
    ...timeProblems(record.generatedAt),
    ...sectionProblems('review', record.review, record.query.top),
    ...sectionProblems('recordQuality', record.recordQuality, record.query.top),
  ];
}

// The schema checks the form; this rejects dates such as month 99.
function timeProblems(generatedAt: string): string[] {
  const time = new Date(generatedAt);
  const real = !Number.isNaN(time.getTime()) && time.toISOString() === generatedAt;
  return real ? [] : [`generatedAt "${generatedAt}" is not a real time`];
}

// A section is what the checklist command ranks: unique categories, most
// frequent first, at most top of them, and a baseline that adds up.
function sectionProblems(name: string, { categories, baseline }: ChecklistSection, top: number): string[] {
  const problems: string[] = [];
  if (categories.length > top) problems.push(`${name} lists ${categories.length} categories, more than top ${top}`);
  categories.forEach(({ category, count }, index) => {
    if (categories.findIndex((other) => other.category === category) < index) problems.push(`${name} lists category "${category}" twice`);
    const previous = categories[index - 1];
    if (previous !== undefined && previous.count < count) {
      problems.push(`${name} is not ranked by count: "${category}" (${count}) follows "${previous.category}" (${previous.count})`);
    }
  });
  return [...problems, ...baselineProblems(name, baseline)];
}

function baselineProblems(name: string, { all, mediumOrWorse }: Baseline): string[] {
  const listedMore = (kind: string, { findings, inChecklist }: Share) =>
    (inChecklist > findings ? [`${name} baseline ${kind} lists ${inChecklist} of ${findings} findings`] : []);
  return [
    ...listedMore('all', all),
    ...listedMore('mediumOrWorse', mediumOrWorse),
    ...(mediumOrWorse.findings > all.findings ? [`${name} baseline has ${mediumOrWorse.findings} Medium or worse findings of ${all.findings}`] : []),
    ...(mediumOrWorse.inChecklist > all.inChecklist
      ? [`${name} baseline lists ${mediumOrWorse.inChecklist} Medium or worse findings of ${all.inChecklist} listed`]
      : []),
  ];
}

// A change directory and its checklist.json, if any.
export interface ChecklistLocation {
  readonly directory: string;
  readonly change: string;
  readonly archived: boolean;
  readonly file?: { readonly path: string; readonly text: string };
}

export interface LocatedChecklist {
  readonly location: ChecklistLocation;
  readonly record: ChecklistRecord;
}

// mustRecord says whether an active change was opened after the landing.
export function missingChecklists(locations: readonly ChecklistLocation[], mustRecord: (directory: string) => boolean): Problem[] {
  return locations
    .filter(({ archived, file, directory }) => !archived && file === undefined && mustRecord(directory))
    .map(({ directory, change }) => ({
      file: posix.join(directory, CHECKLIST_FILE),
      message: `missing; an active change opened after ${LANDING_CHANGE} was archived records its brief's checklist here `
        + `(checklist ... --save ${change} --at <dev commit of the brief>)`,
    }));
}

export function checkChecklists(locations: readonly ChecklistLocation[], checkSchema: SchemaCheck, categories: ReadonlySet<string>) {
  const located: LocatedChecklist[] = [];
  const problems: Problem[] = [];
  for (const location of locations) {
    if (location.file === undefined) continue;
    const parsed = parseChecklistRecord({ ...location.file, change: location.change }, checkSchema, categories);
    if (parsed.record !== undefined) located.push({ location, record: parsed.record });
    problems.push(...parsed.problems.map((message) => ({ file: location.file!.path, message })));
  }
  return { located, problems };
}
