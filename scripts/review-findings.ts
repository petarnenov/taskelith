import { posix } from 'node:path';

// Pure rules of the review findings record: parsing, validation, the index,
// and the checklist. File access stays in scripts/findings.ts.

export const MAX_LINE_BYTES = 4096;
export const VOCABULARY_PATH = 'docs/review-findings/categories.txt';
export const NO_CAPABILITY = '(none)';
export const RECORD_DIRECTORY = 'openspec/changes/';
export const SPECS_DIRECTORY = 'openspec/specs';
export const MAX_CATEGORY_LENGTH = 64;

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Outcome = 'fixed' | 'fixed-unreviewed' | 'declined' | 'deferred' | 'owner-accepted';

export interface Reviewer {
  readonly harness: string;
  readonly model: string;
  readonly variant?: string;
}

export interface Finding {
  readonly change: string;
  readonly pass: number;
  readonly reviewer: Reviewer;
  readonly session: string;
  readonly severity: Severity;
  readonly category: string;
  readonly title: string;
  readonly file: string;
  readonly line?: number;
  readonly capability?: string;
  readonly outcome: Outcome;
  readonly resolution: string;
  readonly commit?: string;
}

export interface Problem {
  readonly file: string;
  readonly line?: number;
  readonly message: string;
}

export interface Category {
  readonly id: string;
  readonly description: string;
}

// Schema violations of one parsed value, as readable messages; none if valid.
export type SchemaCheck = (value: unknown) => readonly string[];

export interface FindingsSource {
  readonly path: string;
  readonly change: string;
  readonly text: string;
}

export interface FindingRules {
  readonly checkSchema: SchemaCheck;
  readonly categories: ReadonlySet<string>;
  // Existing capabilities, given only for active changes: archived findings
  // predate the capability rule.
  readonly capabilities?: ReadonlySet<string>;
}

export interface ParsedFindings {
  readonly findings: readonly Finding[];
  readonly problems: readonly Problem[];
}

export function formatProblem({ file, line, message }: Problem): string {
  return line === undefined ? `${file}: ${message}` : `${file}:${line}: ${message}`;
}

const CATEGORY_LINE = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*) (\S.*)$/;

export function parseVocabulary(text: string): { categories: Category[]; problems: Problem[] } {
  const categories: Category[] = [];
  const problems: Problem[] = [];
  contentLines(text).forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const problem = (message: string) => problems.push({ file: VOCABULARY_PATH, line: index + 1, message });
    const match = CATEGORY_LINE.exec(line);
    if (!match) return problem('expected "<category-id> <description>"');
    if (match[1].length > MAX_CATEGORY_LENGTH) {
      return problem(`category id is ${match[1].length} characters (max ${MAX_CATEGORY_LENGTH})`);
    }
    if (categories.some((category) => category.id === match[1])) return problem(`duplicate category "${match[1]}"`);
    categories.push({ id: match[1], description: match[2] });
  });
  return { categories, problems };
}

// The text's lines, without the empty one after a final newline.
function contentLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  return lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}

export function parseFindings(source: FindingsSource, rules: FindingRules): ParsedFindings {
  const findings: Finding[] = [];
  const problems: Problem[] = [];
  contentLines(source.text).forEach((text, index) => {
    const parsed = parseLine(text, source.change, rules);
    if (parsed.finding) findings.push(parsed.finding);
    problems.push(...parsed.problems.map((message) => ({ file: source.path, line: index + 1, message })));
  });
  return { findings, problems };
}

function parseLine(text: string, change: string, rules: FindingRules): { finding?: Finding; problems: string[] } {
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_LINE_BYTES) return { problems: [`line is ${bytes} bytes (max ${MAX_LINE_BYTES})`] };
  if (text.trim() === '') return { problems: ['empty line; a change without findings has an empty file'] };
  const parsed = parseJson(text);
  if (!parsed.ok) return { problems: ['not a JSON value'] };
  // Schema diagnostics could echo the secret, so only this one is reported.
  if (secretLikeStrings(parsed.value).length > 0) return { problems: ['holds a secret-like value; describe it instead'] };
  const violations = rules.checkSchema(parsed.value);
  if (violations.length > 0) return { problems: [...violations] };
  const finding = parsed.value as Finding;
  const problems = [...recordProblems(finding, change, rules.categories), ...capabilityProblems(finding, rules.capabilities)];
  return problems.length > 0 ? { problems } : { finding, problems };
}

// The parser's message quotes the input, so callers get no message.
function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function recordProblems(finding: Finding, change: string, categories: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (finding.change !== change) problems.push(`change "${finding.change}" is not this file's change "${change}"`);
  if (!categories.has(finding.category)) {
    problems.push(`unknown category "${finding.category}"; categories are listed in ${VOCABULARY_PATH}`);
  }
  return problems;
}

// A finding about a change's own records, for example its verification.md.
export function isRecordFinding(finding: Finding): boolean {
  return finding.file.startsWith(RECORD_DIRECTORY);
}

function capabilityProblems(finding: Finding, capabilities: ReadonlySet<string> | undefined): string[] {
  if (capabilities === undefined) return [];
  const { capability } = finding;
  if (capability !== undefined) {
    return capabilities.has(capability) ? [] : [`unknown capability "${capability}"; capabilities are the directories under ${SPECS_DIRECTORY}`];
  }
  return isRecordFinding(finding) ? [] : [`capability is required outside ${RECORD_DIRECTORY}; name the closest one under ${SPECS_DIRECTORY}`];
}

// Common token shapes: Taskelith and GitHub tokens, JWTs, private keys, NATS
// seeds, AWS and Slack keys, API keys, and URL user information.
const SECRET_PATTERNS: readonly RegExp[] = [
  /\btk(?:op|en|wk)_[A-Za-z0-9_-]{20,}/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /-----BEGIN [A-Z ]*(?:PRIVATE KEY|NKEY SEED|USER JWT)-----/,
  /\bS[OAUNCX][A-Z2-7]{56}\b/,
  /\b(?:A(?:KIA|SIA)[0-9A-Z]{16}|xox[abpr]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{20,})/,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/?#@]+@/i,
];

export function secretLikeStrings(value: unknown): string[] {
  return stringsOf(value).filter((text) => SECRET_PATTERNS.some((pattern) => pattern.test(text)));
}

function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => [key, ...stringsOf(item)]);
}

// `<date>-<change>` under the archive directory names an archived change.
export function changeOfDirectory(directory: string): string {
  return directory.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

export interface Tally {
  readonly key: string;
  readonly total: number;
  readonly fixed: number;
  readonly declined: number;
  readonly other: number;
}

export type Dimension = 'category' | 'capability' | 'file' | 'reviewer';

export type FindingsIndex = Readonly<Record<Dimension | 'all', readonly Tally[]>>;

// fixed counts fixed and fixed-unreviewed; other counts deferred and
// owner-accepted.
function outcomeGroup(outcome: Outcome): 'fixed' | 'declined' | 'other' {
  if (outcome === 'fixed' || outcome === 'fixed-unreviewed') return 'fixed';
  return outcome === 'declined' ? 'declined' : 'other';
}

export function reviewerKey({ harness, model, variant }: Reviewer): string {
  return variant === undefined ? `${harness} ${model}` : `${harness} ${model}#${variant}`;
}

const DIMENSION_KEYS: Readonly<Record<Dimension, (finding: Finding) => string>> = {
  category: (finding) => finding.category,
  capability: (finding) => finding.capability ?? NO_CAPABILITY,
  file: (finding) => finding.file,
  reviewer: (finding) => reviewerKey(finding.reviewer),
};

export function tallyBy(findings: readonly Finding[], keyOf: (finding: Finding) => string): Tally[] {
  const tallies = new Map<string, { key: string; total: number; fixed: number; declined: number; other: number }>();
  for (const finding of findings) {
    const key = keyOf(finding);
    const tally = tallies.get(key) ?? { key, total: 0, fixed: 0, declined: 0, other: 0 };
    tally.total += 1;
    tally[outcomeGroup(finding.outcome)] += 1;
    tallies.set(key, tally);
  }
  return [...tallies.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

export function findingsIndex(findings: readonly Finding[]): FindingsIndex {
  return {
    all: tallyBy(findings, () => 'all'),
    category: tallyBy(findings, DIMENSION_KEYS.category),
    capability: tallyBy(findings, DIMENSION_KEYS.capability),
    file: tallyBy(findings, DIMENSION_KEYS.file),
    reviewer: tallyBy(findings, DIMENSION_KEYS.reviewer),
  };
}

function share(part: number, total: number): string {
  return `${Math.round((part / total) * 100)}%`;
}

const COLUMN_WIDTH = 10;

function row(cells: readonly string[], key: string): string {
  return `${cells.map((cell) => cell.padStart(COLUMN_WIDTH)).join('')}  ${key}`;
}

function tallyRow({ key, total, fixed, declined, other }: Tally): string {
  return row([String(total), share(fixed, total), share(declined, total), share(other, total)], key);
}

const DIMENSION_TITLES: Readonly<Record<Dimension, string>> = {
  category: 'By category',
  capability: 'By capability',
  file: 'By file',
  reviewer: 'By reviewer',
};

export function formatIndex(index: FindingsIndex): string {
  const [all] = index.all;
  if (all === undefined) return 'Archived review findings: 0.';
  const header = row(['count', 'fixed', 'declined', 'other'], 'key');
  const summary = `Archived review findings: ${all.total} (fixed ${all.fixed}, declined ${all.declined}, other ${all.other}).`;
  const legend = 'fixed includes fixed-unreviewed; other is deferred or owner-accepted.';
  const sections = (Object.keys(DIMENSION_TITLES) as Dimension[]).map((dimension) =>
    [DIMENSION_TITLES[dimension], header, ...index[dimension].map(tallyRow)].join('\n'));
  return [summary, legend, ...sections].join('\n\n');
}

export interface ChecklistQuery {
  readonly capabilities: readonly string[];
  readonly files: readonly string[];
  readonly top: number;
}

export interface ChecklistItem {
  readonly category: string;
  readonly description: string;
  readonly count: number;
  readonly example: string;
}

// With neither capabilities nor file globs every finding matches; otherwise
// a finding matches its capability or any glob.
export function matchesQuery(finding: Finding, query: ChecklistQuery): boolean {
  if (query.capabilities.length === 0 && query.files.length === 0) return true;
  const capability = finding.capability !== undefined && query.capabilities.includes(finding.capability);
  return capability || query.files.some((glob) => posix.matchesGlob(finding.file, glob));
}

export function checklist(findings: readonly Finding[], categories: readonly Category[], query: ChecklistQuery): ChecklistItem[] {
  return rankCategories(findings.filter((finding) => matchesQuery(finding, query)), categories, query.top);
}

export function recordChecklist(findings: readonly Finding[], categories: readonly Category[], top: number): ChecklistItem[] {
  return rankCategories(findings.filter(isRecordFinding), categories, top);
}

// Findings are in archive order, so the last one of a category is the newest.
function rankCategories(matched: readonly Finding[], categories: readonly Category[], top: number): ChecklistItem[] {
  return tallyBy(matched, DIMENSION_KEYS.category).slice(0, top).map(({ key, total }) => ({
    category: key,
    description: categories.find((category) => category.id === key)?.description ?? '',
    count: total,
    example: matched.filter((finding) => finding.category === key).at(-1)!.title,
  }));
}

function describeQuery({ capabilities, files }: ChecklistQuery): string {
  const parts = [
    capabilities.length > 0 ? `capabilities ${capabilities.join(', ')}` : '',
    files.length > 0 ? `files ${files.join(', ')}` : '',
  ].filter((part) => part !== '');
  return parts.length > 0 ? parts.join('; ') : 'all archived findings';
}

export function formatChecklist(items: readonly ChecklistItem[], query: ChecklistQuery): string {
  return formatRanking(`Review checklist (${describeQuery(query)})`, items);
}

export function formatRecordChecklist(items: readonly ChecklistItem[]): string {
  return formatRanking(`Record quality (archived findings under ${RECORD_DIRECTORY})`, items);
}

function formatRanking(title: string, items: readonly ChecklistItem[]): string {
  if (items.length === 0) return `${title}: no archived findings match.`;
  const lines = items.map(({ category, description, count, example }, index) =>
    `${index + 1}. ${category} (${count}): ${description} Example: "${example}"`);
  return [`${title}, most frequent finding categories first:`, ...lines].join('\n');
}
