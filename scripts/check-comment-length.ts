import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Enforces the comment rule of AGENTS.md: a comment spans at most two
// physical lines, and each of them is at most 80 characters long.

export const MAX_COMMENT_LINES = 2;
export const MAX_LINE_LENGTH = 80;

export type CommentSyntax = 'slash' | 'hash';

export interface Comment {
  firstLine: number;
  lastLine: number;
}

export interface Violation {
  file: string;
  line: number;
  reason: string;
}

const SLASH_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs']);
const HASH_EXTENSIONS = new Set(['.sh', '.yml', '.yaml']);
const HASH_BASENAMES = new Set(['Makefile', 'Dockerfile']);
const LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock']);
// The SpecKit fixture scaffold is a byte-for-byte copy of the qualification
// capture, so both are third-party artifacts.
const EXEMPT_DIRS = [
  'docs/qualification/',
  'packages/plugins/sdlc-speckit/fixtures/working-copy/.agent/',
  'packages/plugins/sdlc-speckit/fixtures/working-copy/.specify/',
];

export function commentSyntax(path: string, firstLine: string): CommentSyntax | undefined {
  const name = posix.basename(path);
  const extension = posix.extname(name);
  if (LOCKFILES.has(name) || EXEMPT_DIRS.some((dir) => path.startsWith(dir))) return undefined;
  if (SLASH_EXTENSIONS.has(extension)) return 'slash';
  if (HASH_EXTENSIONS.has(extension) || HASH_BASENAMES.has(name)) return 'hash';
  if (extension === '' && firstLine.startsWith('#!')) return 'hash';
  return undefined;
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

function lineOf(starts: number[], position: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle] <= position) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

function commentRanges(text: string): ts.CommentRange[] {
  const file = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true);
  const ranges = new Map<number, ts.CommentRange>();
  const collect = (found: ts.CommentRange[] | undefined) => {
    for (const range of found ?? []) ranges.set(range.pos, range);
  };
  const visit = (node: ts.Node) => {
    collect(ts.getLeadingCommentRanges(text, node.getFullStart()));
    collect(ts.getTrailingCommentRanges(text, node.getEnd()));
    for (const child of node.getChildren(file)) visit(child);
  };
  visit(file);
  return [...ranges.values()].sort((left, right) => left.pos - right.pos);
}

interface CommentPiece extends Comment {
  // Own-line single-line comments on adjacent lines join into one comment.
  joinable: boolean;
}

function joinPieces(pieces: CommentPiece[]): Comment[] {
  const comments: CommentPiece[] = [];
  for (const piece of pieces) {
    const previous = comments.at(-1);
    if (previous?.joinable && piece.joinable && previous.lastLine === piece.firstLine - 1) {
      previous.lastLine = piece.lastLine;
    } else {
      comments.push({ ...piece });
    }
  }
  return comments.map(({ firstLine, lastLine }) => ({ firstLine, lastLine }));
}

export function slashComments(text: string): Comment[] {
  const starts = lineStarts(text);
  return joinPieces(commentRanges(text).map((range) => {
    const firstLine = lineOf(starts, range.pos);
    const ownLine = text.slice(starts[firstLine - 1], range.pos).trim() === '';
    const block = range.kind === ts.SyntaxKind.MultiLineCommentTrivia;
    return { firstLine, lastLine: lineOf(starts, range.end - 1), joinable: ownLine && !block };
  }));
}

// The start of a `#` comment: outside quotes, at a word start, so that `$#`,
// `${x#y}`, `a\ #b`, and quoted `#` are not comments.
function hashCommentStart(line: string): number | undefined {
  let quote: string | undefined;
  let wordStart = true;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '\\' && quote !== "'") index += 1;
    else if (quote) quote = char === quote ? undefined : quote;
    else if (char === '"' || char === "'") quote = char;
    else if (char === '#' && wordStart) return index;
    wordStart = !quote && /\s/.test(char);
  }
  return undefined;
}

export function hashComments(text: string): Comment[] {
  const pieces = text.split('\n').flatMap((content, index) => {
    if (index === 0 && content.startsWith('#!')) return [];
    const start = hashCommentStart(content);
    if (start === undefined) return [];
    const line = index + 1;
    return [{ firstLine: line, lastLine: line, joinable: content.slice(0, start).trim() === '' }];
  });
  return joinPieces(pieces);
}

export function commentViolations(file: string, text: string, comments: Comment[]): Violation[] {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  return comments.flatMap(({ firstLine, lastLine }) => {
    const span = lastLine - firstLine + 1;
    const violations: Violation[] = [];
    if (span > MAX_COMMENT_LINES) {
      violations.push({ file, line: firstLine, reason: `comment spans ${span} lines (max ${MAX_COMMENT_LINES})` });
    }
    for (let line = firstLine; line <= lastLine; line += 1) {
      const length = [...lines[line - 1]].length;
      if (length > MAX_LINE_LENGTH) {
        violations.push({ file, line, reason: `comment line is ${length} characters (max ${MAX_LINE_LENGTH})` });
      }
    }
    return violations;
  });
}

export function fileViolations(file: string, text: string): Violation[] {
  const syntax = commentSyntax(file, text.split('\n', 1)[0]);
  if (!syntax) return [];
  return commentViolations(file, text, syntax === 'slash' ? slashComments(text) : hashComments(text));
}

function trackedFiles(root: string): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const violations = trackedFiles(root).flatMap((file) => fileViolations(file, readFileSync(posix.join(root, file), 'utf8')));
  for (const { file, line, reason } of violations) console.error(`${file}:${line}: ${reason}`);
  if (violations.length > 0) {
    console.error(`Comment length violations: ${violations.length}; see the rule in AGENTS.md.`);
    process.exit(1);
  }
  console.log('Every comment is within the comment length rule.');
}
