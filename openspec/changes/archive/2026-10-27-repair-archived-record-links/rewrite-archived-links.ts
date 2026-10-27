import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';

// Rewrites each failing archived link destination as a root-relative link.
// Run from the repository root; see design.md, "Rewrite".

const ARCHIVE_DIR = 'openspec/changes/archive';
const CHANGES_DIR = 'openspec/changes';

interface Problem {
  file: string;
  line: number;
  target: string;
}

interface Rewrite extends Problem {
  replacement: string;
  category: string;
}

function splitTarget(target: string): { path: string; fragment: string } {
  const hashAt = target.indexOf('#');
  if (hashAt === -1) return { path: target, fragment: '' };
  return { path: target.slice(0, hashAt), fragment: target.slice(hashAt) };
}

// A change that a link named while active, found under its archived name.
function archivedChange(path: string): string | undefined {
  const [name, ...rest] = path.slice(CHANGES_DIR.length + 1).split('/');
  const matches = readdirSync(ARCHIVE_DIR).filter((dir) => dir.endsWith(`-${name}`));
  return matches.length === 1 ? [ARCHIVE_DIR, matches[0], ...rest].join('/') : undefined;
}

function resolved(problem: Problem): { path: string; category: string } {
  const { path } = splitTarget(problem.target);
  const fromArchive = posix.join(posix.dirname(problem.file), path);
  if (existsSync(fromArchive)) return { path: fromArchive, category: 'leaves the change directory' };
  const fromActive = posix.join(posix.dirname(problem.file), '..', path);
  if (existsSync(fromActive)) return { path: fromActive, category: 'one level too shallow' };
  const archived = fromActive.startsWith(`${CHANGES_DIR}/`) ? archivedChange(fromActive) : undefined;
  if (archived && existsSync(archived)) return { path: archived, category: 'active change since archived' };
  throw new Error(`${problem.file}:${problem.line}: no target for ${problem.target}`);
}

function planRewrite(problem: Problem): Rewrite {
  if (!problem.file.startsWith(`${ARCHIVE_DIR}/`)) {
    throw new Error(`${problem.file}:${problem.line}: not an archived record`);
  }
  const { path, category } = resolved(problem);
  const replacement = `/${path}${splitTarget(problem.target).fragment}`;
  return { ...problem, replacement, category };
}

function lineOffset(text: string, line: number): number {
  let offset = 0;
  for (let current = 1; current < line; current += 1) offset = text.indexOf('\n', offset) + 1;
  return offset;
}

// Replaces only the destination: the text after `](` or `]: `.
function rewriteFile(file: string, rewrites: readonly Rewrite[]): void {
  let text = readFileSync(file, 'utf8');
  let from = 0;
  for (const rewrite of [...rewrites].sort((a, b) => a.line - b.line)) {
    from = Math.max(from, lineOffset(text, rewrite.line));
    const at = ['](', ']: ']
      .map((opener) => text.indexOf(`${opener}${rewrite.target}`, from))
      .filter((index) => index !== -1)
      .map((index) => index + 2)
      .sort((a, b) => a - b)[0];
    if (at === undefined) throw new Error(`${file}:${rewrite.line}: destination not found`);
    text = text.slice(0, at) + rewrite.replacement + text.slice(at + rewrite.target.length);
    from = at + rewrite.replacement.length;
  }
  writeFileSync(file, text);
}

const checker = pathToFileURL(posix.join(process.cwd(), 'scripts/check-record-links.ts')).href;
const { findLinkProblems, localDate } = await import(checker);
const problems: Problem[] = findLinkProblems('.', localDate(new Date()));
const rewrites = problems.map(planRewrite);
const byFile = Map.groupBy(rewrites, (rewrite) => rewrite.file);
for (const [file, fileRewrites] of byFile) rewriteFile(file, fileRewrites);
const counts = Map.groupBy(rewrites, (rewrite) => rewrite.category);
for (const [category, items] of counts) console.log(`${category}: ${items.length}`);
console.log(`Rewrote ${rewrites.length} links in ${byFile.size} files.`);
