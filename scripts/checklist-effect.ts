import {
  baselineOf,
  CHECKLIST_FILE,
  isMediumOrWorse,
  listedCategories,
  SIZE_POINTS,
  type Baseline,
  type ChecklistRecord,
  type ChecklistSection,
  type Share,
  type Size,
} from './checklist-record.ts';
import { isRecordFinding, type Finding } from './review-findings.ts';

// Pure effect of the recorded checklists on the pass-1 findings of
// archived changes, per change and per archive date.

export interface ArchivedChecklist {
  readonly change: string;
  readonly archivedOn: string;
  readonly record: ChecklistRecord;
  readonly findings: readonly Finding[];
  // Asked only for a change without a recorded size.
  readonly linesChanged?: number;
}

export interface Observation extends Share {
  readonly observed: number | null;
  readonly expected: number | null;
}

export interface SectionEffect {
  readonly all: Observation;
  readonly mediumOrWorse: Observation;
}

interface Normalized {
  readonly passOneFindings: number;
  readonly perSizePoint: number | null;
  readonly per100Lines: number | null;
  readonly review: SectionEffect;
  readonly recordQuality: SectionEffect;
}

export interface ChangeEffect extends Normalized {
  readonly change: string;
  readonly archivedOn: string;
  readonly size: Size | null;
  readonly linesChanged: number | null;
}

export interface DateEffect extends Normalized {
  readonly archivedOn: string;
  readonly changes: readonly string[];
}

export interface ChecklistEffect {
  readonly changes: readonly ChangeEffect[];
  readonly byDate: readonly DateEffect[];
  readonly noChecklist: readonly string[];
}

const rounded = (value: number) => Math.round(value * 100) / 100;
const ratio = (part: number, whole: number) => (whole === 0 ? null : rounded(part / whole));

// Unrounded expected hits: findings times the baseline share, so that a
// day's expected share is the findings-weighted mean of its changes.
interface Tally extends Share {
  readonly expectedHits: number | null;
}

type SectionTally = Readonly<Record<keyof SectionEffect, Tally>>;

function tally(observed: Share, baseline: Share): Tally {
  const expectedShare = baseline.findings === 0 ? null : baseline.inChecklist / baseline.findings;
  return { ...observed, expectedHits: expectedShare === null ? null : observed.findings * expectedShare };
}

function sectionTally(findings: readonly Finding[], section: ChecklistSection): SectionTally {
  const observed: Baseline = baselineOf(findings, listedCategories(section));
  return {
    all: tally(observed.all, section.baseline.all),
    mediumOrWorse: tally(observed.mediumOrWorse, section.baseline.mediumOrWorse),
  };
}

function observation({ findings, inChecklist }: Share, expected: number | null): Observation {
  return { findings, inChecklist, observed: ratio(inChecklist, findings), expected };
}

function shareOfBaseline({ findings, inChecklist }: Share): number | null {
  return ratio(inChecklist, findings);
}

interface ChangeTally {
  readonly input: ArchivedChecklist;
  readonly passOne: readonly Finding[];
  readonly review: SectionTally;
  readonly recordQuality: SectionTally;
}

function changeTally(input: ArchivedChecklist): ChangeTally {
  const passOne = input.findings.filter(({ pass }) => pass === 1);
  return {
    input,
    passOne,
    review: sectionTally(passOne.filter((finding) => !isRecordFinding(finding)), input.record.review),
    recordQuality: sectionTally(passOne.filter(isRecordFinding), input.record.recordQuality),
  };
}

// A change's expected share is its baseline share, also without findings.
function changeEffect({ input, passOne, review, recordQuality }: ChangeTally): ChangeEffect {
  const { size } = input.record;
  const linesChanged = size === undefined ? input.linesChanged ?? null : null;
  const section = (tallies: SectionTally, { baseline }: ChecklistSection): SectionEffect => ({
    all: observation(tallies.all, shareOfBaseline(baseline.all)),
    mediumOrWorse: observation(tallies.mediumOrWorse, shareOfBaseline(baseline.mediumOrWorse)),
  });
  return {
    change: input.change,
    archivedOn: input.archivedOn,
    size: size ?? null,
    linesChanged,
    passOneFindings: passOne.length,
    perSizePoint: size === undefined ? null : rounded(passOne.length / SIZE_POINTS[size]),
    per100Lines: linesChanged === null ? null : ratio(passOne.length * 100, linesChanged),
    review: section(review, input.record.review),
    recordQuality: section(recordQuality, input.record.recordQuality),
  };
}

function sumTallies(tallies: readonly Tally[]): Tally {
  const counted = tallies.filter(({ findings }) => findings > 0);
  const unknown = counted.some(({ expectedHits }) => expectedHits === null);
  return {
    findings: counted.reduce((total, { findings }) => total + findings, 0),
    inChecklist: counted.reduce((total, { inChecklist }) => total + inChecklist, 0),
    expectedHits: unknown ? null : counted.reduce((total, { expectedHits }) => total + expectedHits!, 0),
  };
}

function summedObservation(tallies: readonly Tally[]): Observation {
  const sum = sumTallies(tallies);
  return observation(sum, sum.expectedHits === null ? null : ratio(sum.expectedHits, sum.findings));
}

function dateEffect(archivedOn: string, changes: readonly ChangeTally[]): DateEffect {
  const sized = changes.filter(({ input }) => input.record.size !== undefined);
  const counted = changes.filter(({ input }) => input.record.size === undefined && input.linesChanged !== undefined);
  const findingsOf = (group: readonly ChangeTally[]) => group.reduce((total, { passOne }) => total + passOne.length, 0);
  const points = sized.reduce((total, { input }) => total + SIZE_POINTS[input.record.size!], 0);
  const lines = counted.reduce((total, { input }) => total + input.linesChanged!, 0);
  const section = (pick: (change: ChangeTally) => SectionTally): SectionEffect => ({
    all: summedObservation(changes.map((change) => pick(change).all)),
    mediumOrWorse: summedObservation(changes.map((change) => pick(change).mediumOrWorse)),
  });
  return {
    archivedOn,
    changes: changes.map(({ input }) => input.change),
    passOneFindings: findingsOf(changes),
    perSizePoint: sized.length === 0 ? null : ratio(findingsOf(sized), points),
    per100Lines: counted.length === 0 ? null : ratio(findingsOf(counted) * 100, lines),
    review: section(({ review }) => review),
    recordQuality: section(({ recordQuality }) => recordQuality),
  };
}

export function checklistEffect(archived: readonly ArchivedChecklist[], noChecklist: readonly string[]): ChecklistEffect {
  const tallies = archived.map(changeTally);
  const dates = [...new Set(archived.map(({ archivedOn }) => archivedOn))].sort();
  return {
    changes: tallies.map(changeEffect),
    byDate: dates.map((date) => dateEffect(date, tallies.filter(({ input }) => input.archivedOn === date))),
    noChecklist,
  };
}

const LEGEND = [
  'Observed is the share of pass-1 findings whose category the checklist lists; expected is the share of those',
  'categories in the archived findings it was ranked from (its baseline). Review counts findings outside',
  'openspec/changes/, record quality those under it. Size points: S 1, S-M 1.5, M 2, M-L 2.5, L 3; a change',
  'without a size is normalized per 100 changed lines. An observed share below the expected one suggests',
  'that the checklist prevented findings it warns about.',
].join(' ');

const percent = (share: number) => `${Math.round(share * 100)}%`;

function observationLine(label: string, { findings, inChecklist, observed, expected }: Observation): string {
  const seen = observed === null ? 'no findings' : `${percent(observed)} observed`;
  const baseline = expected === null ? 'no expected share' : `${percent(expected)} expected`;
  return `  ${label}: ${inChecklist} of ${findings} listed, ${seen}, ${baseline}`;
}

function sectionLines({ review, recordQuality }: Normalized): string[] {
  return [
    observationLine('review, all', review.all),
    observationLine('review, >=medium', review.mediumOrWorse),
    observationLine('record quality, all', recordQuality.all),
    observationLine('record quality, >=medium', recordQuality.mediumOrWorse),
  ];
}

function changeSize({ size, linesChanged, perSizePoint, per100Lines }: ChangeEffect): string {
  if (size !== null) return `size ${size}, ${perSizePoint!.toFixed(2)} per size point`;
  if (linesChanged === null) return 'size and changed lines unknown';
  return `${linesChanged} changed lines, ${per100Lines === null ? 'no' : per100Lines.toFixed(2)} per 100 changed lines`;
}

function dateSize({ perSizePoint, per100Lines }: DateEffect): string {
  const parts = [
    perSizePoint === null ? '' : `${perSizePoint.toFixed(2)} per size point`,
    per100Lines === null ? '' : `${per100Lines.toFixed(2)} per 100 changed lines`,
  ].filter((part) => part !== '');
  return parts.length === 0 ? 'size unknown' : parts.join(', ');
}

export function formatChecklistEffect({ changes, byDate, noChecklist }: ChecklistEffect): string {
  const summary = `Checklist effect over archived changes with ${CHECKLIST_FILE}: ${changes.length} change(s); `
    + `${noChecklist.length} archived change(s) without one are excluded.`;
  const perChange = changes.flatMap((change) => [
    `${change.archivedOn} ${change.change}: ${change.passOneFindings} pass-1 finding(s), ${changeSize(change)}`,
    ...sectionLines(change),
  ]);
  const perDate = byDate.flatMap((date) => [
    `${date.archivedOn}: ${date.changes.length} change(s), ${date.passOneFindings} pass-1 finding(s), ${dateSize(date)}`,
    ...sectionLines(date),
  ]);
  const excluded = noChecklist.length === 0 ? 'No checklist: none' : `No checklist: ${noChecklist.join(', ')}`;
  return [summary, LEGEND, ['By change', ...perChange].join('\n'), ['By archive date', ...perDate].join('\n'), excluded].join('\n\n');
}
