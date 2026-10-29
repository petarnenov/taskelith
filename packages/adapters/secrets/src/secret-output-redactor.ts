import { SECRET_PREFIXES } from '@taskelith/access';
import { pemPrivateKeySpans, REDACTED, SECRET_BLOCK_MARKERS, type TextSpan } from '@taskelith/observability';
import { redactSecrets } from './scrub.js';

// The Execution module's HeldOutput and OutputSplit, by shape.
export type OutputContinuation = 'none' | 'word' | 'block';

export interface HeldOutput {
  readonly text: string;
  readonly continuation: OutputContinuation;
}

export interface OutputSplit {
  readonly released: string;
  readonly held: HeldOutput;
}

const WHITESPACE = /\s/;
const { pemKeyBegin, pemKeyEnd, credsBegin, credsEnd } = SECRET_BLOCK_MARKERS;
const PEM_KEY_BEGIN_HERE = new RegExp(pemKeyBegin, 'y');
const PEM_KEY_END_AT_END = new RegExp(`${pemKeyEnd}$`);
// The literal heads of the PEM markers; the key's type follows the space.
const PEM_BEGIN_HEAD = '-----BEGIN ';
const PEM_END_HEAD = '-----END ';
const PEM_TYPE_REST = /^[A-Z0-9 ]*(?:PRIVATE KEY-{1,4})?$/;
// A cut run ending in this word may go on as a block's begin marker.
const BEGIN_WORD = '-----BEGIN';
// A proper prefix of any marker holds at most 11 dashes.
const MARKER_DASHES = 12;
// Begin markers that reopen the blocks a cut left open; never released.
const PEM_CONTEXT = `${PEM_BEGIN_HEAD}PRIVATE KEY-----\n`;
const CREDS_CONTEXT = `${credsBegin}\n`;

const TOKEN_CHARACTER = /[A-Za-z0-9_-]/;
const ISSUED_AT_END = new RegExp(`(?:${Object.values(SECRET_PREFIXES).join('|')})(?:_[A-Za-z0-9_-]*)?$`);
const SEED_AT_END = /S[OAU][A-Z2-7]{1,55}$/;
const SCHEME_CHARACTER = /[A-Za-z0-9+.-]/;
// A host and a user name cut before its `@` look alike, so both match.
const USERINFO_SO_FAR = /^[^/?#@]+$/;

type BlockKind = 'pem' | 'creds';

interface BlockSpan extends TextSpan {
  readonly kind: BlockKind;
  readonly open: boolean;
  // The end of the block's begin marker.
  readonly bodyStart: number;
}

type Resumed = { readonly rest: string } | { readonly held: HeldOutput };

type Partial = (suffix: string) => boolean;

const BEGIN_PARTIALS: readonly Partial[] = [pemPartial(PEM_BEGIN_HEAD), literalPartial(credsBegin)];
const PEM_END_PARTIALS: readonly Partial[] = [pemPartial(PEM_END_HEAD)];
const CREDS_INNER_PARTIALS: readonly Partial[] = [literalPartial(credsEnd), pemPartial(PEM_BEGIN_HEAD)];

// The Execution module's SessionOutputRedactor port over redactSecrets
// (control-plane wire contracts, section 7; 13d design decisions 1 and 2).
export class SecretOutputRedactor {
  // Releases, redacted, the text before the hold point; a held part past
  // `bound` becomes one marker, and its continuation is dropped.
  split(held: HeldOutput, chunk: string, bound: number): OutputSplit {
    const pending = held.text + chunk;
    const resumed = held.continuation === 'none' ? { rest: pending } : afterContinuation(pending, held, bound);
    if ('held' in resumed) return { released: '', held: resumed.held };
    const { rest } = resumed;
    const hold = holdPoint(rest);
    const released = redactSecrets(rest.slice(0, hold));
    const tail = rest.slice(hold);
    if (tail.length <= bound) return { released, held: { text: tail, continuation: 'none' } };
    return { released: released + REDACTED, held: cutHeld(tail, bound) };
  }

  // A cut secret's continuation was already recorded as its marker; an
  // open block or an interrupted secret at the turn's end becomes one.
  release(held: HeldOutput): string {
    if (held.continuation !== 'none') return '';
    const open = blockSpans(held.text).find((block) => block.open);
    if (open !== undefined) return redactSecrets(held.text.slice(0, open.start)) + REDACTED;
    return withoutInterruptedSecret(redactSecrets(held.text));
  }
}

// The least point before which no match of a session text rule can cross:
// the trailing run, an open or crossing block, or a marker's partial begin.
function holdPoint(text: string): number {
  let hold = runStart(text, text.length);
  const partial = partialStart(text, BEGIN_PARTIALS);
  if (partial !== undefined) hold = Math.min(hold, runStart(text, partial));
  for (const block of blockSpans(text).reverse()) {
    if (block.start < hold && (block.open || block.end > hold)) hold = runStart(text, block.start);
  }
  return hold;
}

// A held part past the bound: open blocks are dropped up to the end marker
// of their own kind, and the rest of a run up to the next whitespace.
function cutHeld(tail: string, bound: number): HeldOutput {
  const blocks = blockSpans(tail);
  if (blocks.some((block) => block.open)) return blockContext(tail, blocks, bound);
  const partial = partialStart(tail, BEGIN_PARTIALS);
  if (partial !== undefined && WHITESPACE.test(tail.slice(partial))) return pendingBegin(tail.slice(partial), bound);
  return { text: tail.slice(-BEGIN_WORD.length), continuation: 'word' };
}

// Where a cut secret's continuation ends, or what to keep to find its end.
function afterContinuation(text: string, held: HeldOutput, bound: number): Resumed {
  return held.continuation === 'block' ? afterBlock(text, held.text.length, bound) : afterWord(text, bound);
}

function afterWord(text: string, bound: number): Resumed {
  const whitespace = text.search(WHITESPACE);
  if (whitespace === -1) return { held: { text: text.slice(-BEGIN_WORD.length), continuation: 'word' } };
  const rest = text.slice(whitespace);
  return text.slice(0, whitespace).endsWith(BEGIN_WORD) ? afterBlock(BEGIN_WORD + rest, BEGIN_WORD.length, bound) : { rest };
}

// The held context reopens the cut blocks at the text's start, so they end
// only where they would end in the whole text.
function afterBlock(text: string, reopened: number, bound: number): Resumed {
  const blocks = blockSpans(text);
  const covered = coveredEnd(blocks);
  if (covered === undefined) return afterPartialBegin(text, reopened, bound);
  return covered.open ? { held: blockContext(text, blocks, bound) } : { rest: text.slice(covered.end) };
}

// A begin marker cut after a space is kept while it may still complete;
// otherwise the cut run's continuation is dropped up to whitespace.
function afterPartialBegin(text: string, reopened: number, bound: number): Resumed {
  if (BEGIN_PARTIALS.some((partial) => partial(text))) return { held: pendingBegin(text, bound) };
  return afterWord(text.slice(reopened), bound);
}

// A partial begin past the bound is taken as a key's, the larger loss.
function pendingBegin(partial: string, bound: number): HeldOutput {
  return { text: partial.length <= bound ? partial : PEM_CONTEXT, continuation: 'block' };
}

// The contexts of the blocks open at the text's end, then a suffix that
// may start a marker ending the inner block or opening a key inside it.
function blockContext(text: string, blocks: readonly BlockSpan[], bound: number): HeldOutput {
  const pem = blocks.find((block) => block.open && block.kind === 'pem');
  const creds = blocks.find((block) => block.open && block.kind === 'creds');
  const context = (creds === undefined ? '' : CREDS_CONTEXT) + (pem === undefined ? '' : PEM_CONTEXT);
  const inner = (pem ?? creds)!;
  const start = partialStart(text, pem === undefined ? CREDS_INNER_PARTIALS : PEM_END_PARTIALS, inner.bodyStart);
  const suffix = start === undefined ? '' : text.slice(start);
  return { text: context + (context.length + suffix.length <= bound ? suffix : ''), continuation: 'block' };
}

// The end of the blocks chained from the text's start, and whether open.
function coveredEnd(blocks: readonly BlockSpan[]): { end: number; open: boolean } | undefined {
  if (blocks[0]?.start !== 0) return undefined;
  let covered = { end: blocks[0].end, open: blocks[0].open };
  for (const block of blocks) {
    if (block.start < covered.end && block.end > covered.end) covered = { end: block.end, open: block.open };
  }
  return covered;
}

// PEM private keys as redactSecrets finds them, and `.creds` blocks as
// redactCredsBlocks matches them; an open block reaches the text's end.
function blockSpans(text: string): BlockSpan[] {
  const pem = pemPrivateKeySpans(text).map((span): BlockSpan => ({
    ...span, kind: 'pem', bodyStart: pemBeginEnd(text, span.start),
    open: span.end === text.length && !PEM_KEY_END_AT_END.test(text),
  }));
  return [...pem, ...credsSpans(text, pem)].sort((left, right) => left.start - right.start);
}

function pemBeginEnd(text: string, start: number): number {
  PEM_KEY_BEGIN_HERE.lastIndex = start;
  return start + PEM_KEY_BEGIN_HERE.exec(text)![0].length;
}

// redactCredsBlocks runs after the keys are replaced, so a `.creds` marker
// inside a key counts for nothing.
function credsSpans(text: string, keys: readonly TextSpan[]): BlockSpan[] {
  const spans: BlockSpan[] = [];
  for (let begin = markerOutside(text, credsBegin, 0, keys); begin !== -1; ) {
    const bodyStart = begin + credsBegin.length;
    const end = markerOutside(text, credsEnd, bodyStart, keys);
    if (end === -1) return [...spans, { start: begin, end: text.length, kind: 'creds', open: true, bodyStart }];
    spans.push({ start: begin, end: end + credsEnd.length, kind: 'creds', open: false, bodyStart });
    begin = markerOutside(text, credsBegin, end + credsEnd.length, keys);
  }
  return spans;
}

function markerOutside(text: string, marker: string, from: number, keys: readonly TextSpan[]): number {
  let at = text.indexOf(marker, from);
  while (at !== -1 && within(keys, at)) at = text.indexOf(marker, at + 1);
  return at;
}

function within(spans: readonly TextSpan[], at: number): boolean {
  return spans.some((span) => span.start <= at && at < span.end);
}

// The earliest start, from `from`, of a suffix that is a proper prefix of a
// marker; it starts with a dash, so only the last few dashes are tried.
function partialStart(text: string, partials: readonly Partial[], from = 0): number | undefined {
  let earliest: number | undefined;
  let at = text.lastIndexOf('-');
  for (let tried = 0; at >= from && tried < MARKER_DASHES; tried += 1) {
    const suffix = text.slice(at);
    if (partials.some((partial) => partial(suffix))) earliest = at;
    at = at === 0 ? -1 : text.lastIndexOf('-', at - 1);
  }
  return earliest;
}

function literalPartial(marker: string): Partial {
  return (suffix) => suffix.length < marker.length && marker.startsWith(suffix);
}

// A PEM marker's head, then its type and `PRIVATE KEY` without all dashes.
function pemPartial(head: string): Partial {
  return (suffix) => head.startsWith(suffix) || (suffix.startsWith(head) && PEM_TYPE_REST.test(suffix.slice(head.length)));
}

// The trailing run's interrupted secret, from its earliest start, as one
// marker; each search is linear in the run.
function withoutInterruptedSecret(text: string): string {
  const runFrom = runStart(text, text.length);
  const run = text.slice(runFrom);
  const starts = [jwtStart(run), issuedStart(run), seedStart(run), userinfoStart(run)].filter((start) => start !== undefined);
  return starts.length === 0 ? text : text.slice(0, runFrom + Math.min(...starts)) + REDACTED;
}

// A JWT cut short holds at most two dots after its `eyJ`.
function jwtStart(run: string): number | undefined {
  let start = run.length;
  for (let dots = 0; start > 0; start -= 1) {
    const character = run[start - 1]!;
    if (character === '.') dots += 1;
    if (dots > 2 || (character !== '.' && !TOKEN_CHARACTER.test(character))) break;
  }
  return found(run.indexOf('eyJ', start));
}

function issuedStart(run: string): number | undefined {
  const start = suffixStart(run, TOKEN_CHARACTER);
  return found(run.slice(start).search(ISSUED_AT_END), start);
}

function seedStart(run: string): number | undefined {
  return found(run.search(SEED_AT_END));
}

// URL user information, or a host, after the scheme; the scheme is kept.
function userinfoStart(run: string): number | undefined {
  const scheme = run.lastIndexOf('://');
  if (scheme < 1 || !SCHEME_CHARACTER.test(run[scheme - 1]!)) return undefined;
  return USERINFO_SO_FAR.test(run.slice(scheme + 3)) ? scheme + 3 : undefined;
}

function suffixStart(text: string, character: RegExp): number {
  let start = text.length;
  while (start > 0 && character.test(text[start - 1]!)) start -= 1;
  return start;
}

function found(index: number, offset = 0): number | undefined {
  return index === -1 ? undefined : offset + index;
}

// The start of the run of non-whitespace characters that ends at `index`.
function runStart(text: string, index: number): number {
  let start = index;
  while (start > 0 && !WHITESPACE.test(text[start - 1]!)) start -= 1;
  return start;
}
