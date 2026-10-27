import { redactWith, type TextRule } from '@taskelith/observability';

// A half-open range of text positions.
export interface Span {
  readonly start: number;
  readonly end: number;
}

const WHITESPACE = /\s/;

// The text to redact for the values revealed to a run, found in the original
// text, so that no replacement can hide or split another occurrence.
export function revealedSpans(text: string, revealed: readonly string[], shapeRules: readonly TextRule[]): Span[] {
  const values = [...new Set(revealed)].filter((value) => value.length > 0);
  const occurrences = merged(values.flatMap((value) => occurrencesOf(text, value)));
  return wordsTouchingShapes(text, occurrences, shapeRules);
}

// One marker per span; the text between spans is kept as it was.
export function replaceSpans(text: string, spans: readonly Span[], marker: string): string {
  let replaced = '';
  let kept = 0;
  for (const span of spans) {
    replaced += `${text.slice(kept, span.start)}${marker}`;
    kept = span.end;
  }
  return replaced + text.slice(kept);
}

// Every occurrence, overlapping ones included, in linear time (Knuth, Morris,
// and Pratt).
function occurrencesOf(text: string, value: string): Span[] {
  const fallback = borders(value);
  const found: Span[] = [];
  let matched = 0;
  for (let index = 0; index < text.length; index += 1) {
    while (matched > 0 && text[index] !== value[matched]) matched = fallback[matched - 1]!;
    if (text[index] === value[matched]) matched += 1;
    if (matched === value.length) {
      found.push({ start: index + 1 - matched, end: index + 1 });
      matched = fallback[matched - 1]!;
    }
  }
  return found;
}

// For each prefix of the value, the length of its longest proper border.
function borders(value: string): number[] {
  const lengths = [0];
  let length = 0;
  for (let index = 1; index < value.length; index += 1) {
    while (length > 0 && value[index] !== value[length]) length = lengths[length - 1]!;
    if (value[index] === value[length]) length += 1;
    lengths.push(length);
  }
  return lengths;
}

// Overlapping or touching spans become one, so that one marker covers them.
function merged(spans: readonly Span[]): Span[] {
  const sorted = [...spans].sort((left, right) => left.start - right.start);
  const result: Span[] = [];
  for (const span of sorted) {
    const last = result.at(-1);
    if (last !== undefined && span.start <= last.end) {
      result[result.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
    } else {
      result.push(span);
    }
  }
  return result;
}

// A shape secret never holds whitespace, so a value that touches one shares
// its word; such a word is redacted whole, or the shape would match no more.
function wordsTouchingShapes(text: string, spans: readonly Span[], shapeRules: readonly TextRule[]): Span[] {
  const result: Span[] = [];
  for (const word of wordsOf(text, spans)) {
    const wordText = text.slice(word.start, word.end);
    const touchesShape = redactWith(wordText, shapeRules) !== wordText;
    result.push(...(touchesShape ? [{ start: word.start, end: word.end }] : word.spans));
  }
  return result;
}

interface Word extends Span {
  readonly spans: readonly Span[];
}

// The whitespace-free words around the sorted spans; each text position is
// scanned at most once, so that this stays linear.
function wordsOf(text: string, spans: readonly Span[]): Word[] {
  const words: { start: number; end: number; spans: Span[] }[] = [];
  for (const span of spans) {
    const last = words.at(-1);
    if (last !== undefined && span.start < last.end) {
      last.end = wordEnd(text, Math.max(last.end, span.end));
      last.spans.push(span);
    } else {
      words.push({ start: wordStart(text, span.start, last?.end ?? 0), end: wordEnd(text, span.end), spans: [span] });
    }
  }
  return words;
}

function wordStart(text: string, index: number, floor: number): number {
  let start = index;
  while (start > floor && !WHITESPACE.test(text[start - 1]!)) start -= 1;
  return start;
}

function wordEnd(text: string, index: number): number {
  let end = index;
  while (end < text.length && !WHITESPACE.test(text[end]!)) end += 1;
  return end;
}
