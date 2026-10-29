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
const { pemKeyEnd, credsBegin, credsEnd } = SECRET_BLOCK_MARKERS;
const PEM_KEY_END = new RegExp(pemKeyEnd);
const PEM_KEY_END_AT_END = new RegExp(`${pemKeyEnd}$`);
// The literal heads of the PEM markers; the key's type follows the space.
const PEM_BEGIN_HEAD = '-----BEGIN ';
const PEM_END_HEAD = '-----END ';
const PEM_TYPE_REST = /^[A-Z0-9 ]*(?:PRIVATE KEY-{1,4})?$/;
// A cut run ending in this word may go on as a block's begin marker.
const BEGIN_WORD = '-----BEGIN';
// A proper prefix of any marker holds at most 11 dashes.
const MARKER_DASHES = 12;

interface BlockSpan extends TextSpan {
  readonly open: boolean;
}

type Partial = (suffix: string) => boolean;

const BEGIN_PARTIALS: readonly Partial[] = [pemPartial(PEM_BEGIN_HEAD), literalPartial(credsBegin)];
const END_PARTIALS: readonly Partial[] = [pemPartial(PEM_END_HEAD), literalPartial(credsEnd)];

// The Execution module's SessionOutputRedactor port over redactSecrets
// (control-plane wire contracts, section 7; 13d design decisions 1 and 2).
export class SecretOutputRedactor {
  // Releases, redacted, the text before the hold point; a held part past
  // `bound` becomes one marker, and its continuation is dropped.
  split(held: HeldOutput, chunk: string, bound: number): OutputSplit {
    const pending = held.text + chunk;
    const resumed = held.continuation === 'none' ? { rest: pending } : afterContinuation(pending, held.continuation, bound);
    if ('held' in resumed) return { released: '', held: resumed.held };
    const { rest } = resumed;
    const hold = holdPoint(rest);
    const released = redactSecrets(rest.slice(0, hold));
    const tail = rest.slice(hold);
    if (tail.length <= bound) return { released, held: { text: tail, continuation: 'none' } };
    return { released: released + REDACTED, held: cutHeld(tail, bound) };
  }

  // A cut secret's continuation was already recorded as its marker.
  release(held: HeldOutput): string {
    return held.continuation === 'none' ? redactSecrets(held.text) : '';
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

// A held part past the bound: the rest of an open block is dropped up to
// its end marker, and the rest of a run up to the next whitespace.
function cutHeld(tail: string, bound: number): HeldOutput {
  const partial = partialStart(tail, BEGIN_PARTIALS);
  const opensBlock = blockSpans(tail).some((block) => block.open) || (partial !== undefined && WHITESPACE.test(tail.slice(partial)));
  return opensBlock ? blockEndSearch(tail, bound) : { text: tail.slice(-BEGIN_WORD.length), continuation: 'word' };
}

// Where a cut secret's continuation ends, or what to keep to find its end.
function afterContinuation(text: string, continuation: 'word' | 'block', bound: number): { rest: string } | { held: HeldOutput } {
  if (continuation === 'block') {
    const end = firstBlockEnd(text);
    return end === undefined ? { held: blockEndSearch(text, bound) } : { rest: text.slice(end) };
  }
  const whitespace = text.search(WHITESPACE);
  if (whitespace === -1) return { held: { text: text.slice(-BEGIN_WORD.length), continuation: 'word' } };
  const rest = text.slice(whitespace);
  return text.slice(0, whitespace).endsWith(BEGIN_WORD) ? afterContinuation(rest, 'block', bound) : { rest };
}

// Keeps only a suffix that could start an end marker, within the bound.
function blockEndSearch(text: string, bound: number): HeldOutput {
  const partial = partialStart(text, END_PARTIALS);
  const kept = partial === undefined ? '' : text.slice(partial);
  return { text: kept.length <= bound ? kept : '', continuation: 'block' };
}

function firstBlockEnd(text: string): number | undefined {
  const pem = PEM_KEY_END.exec(text);
  const creds = text.indexOf(credsEnd);
  const ends = [
    ...(pem === null ? [] : [{ start: pem.index, end: pem.index + pem[0].length }]),
    ...(creds === -1 ? [] : [{ start: creds, end: creds + credsEnd.length }]),
  ];
  return ends.sort((left, right) => left.start - right.start)[0]?.end;
}

// PEM private keys as redactSecrets finds them, and `.creds` blocks as
// redactCredsBlocks matches them; an open block reaches the text's end.
function blockSpans(text: string): BlockSpan[] {
  const pem = pemPrivateKeySpans(text).map((span) => ({
    ...span, open: span.end === text.length && !PEM_KEY_END_AT_END.test(text),
  }));
  return [...pem, ...credsSpans(text)].sort((left, right) => left.start - right.start);
}

function credsSpans(text: string): BlockSpan[] {
  const spans: BlockSpan[] = [];
  for (let begin = text.indexOf(credsBegin); begin !== -1; ) {
    const end = text.indexOf(credsEnd, begin + credsBegin.length);
    if (end === -1) return [...spans, { start: begin, end: text.length, open: true }];
    spans.push({ start: begin, end: end + credsEnd.length, open: false });
    begin = text.indexOf(credsBegin, end + credsEnd.length);
  }
  return spans;
}

// The earliest start of a suffix that is a proper prefix of a marker; such
// a suffix starts with a dash, so only the last few dashes are tried.
function partialStart(text: string, partials: readonly Partial[]): number | undefined {
  let earliest: number | undefined;
  let at = text.lastIndexOf('-');
  for (let tried = 0; at !== -1 && tried < MARKER_DASHES; tried += 1) {
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

// The start of the run of non-whitespace characters that ends at `index`.
function runStart(text: string, index: number): number {
  let start = index;
  while (start > 0 && !WHITESPACE.test(text[start - 1]!)) start -= 1;
  return start;
}
