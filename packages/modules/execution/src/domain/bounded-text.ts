// A lone surrogate counts 3 bytes, as its UTF-8 replacement character does.
export function utf8Length(text: string): number {
  let bytes = 0;
  for (const character of text) bytes += utf8Width(character);
  return bytes;
}

// Cuts the tail to at most `maximum` UTF-16 code units, never inside a
// surrogate pair.
export function truncatedToLength(text: string, maximum: number): string {
  if (text.length <= maximum) return text;
  const splitsPair = isHighSurrogate(text.charCodeAt(maximum - 1)) && isLowSurrogate(text.charCodeAt(maximum));
  return text.slice(0, splitsPair ? maximum - 1 : maximum);
}

// Consecutive parts of at most `maximum` (2 or more) UTF-16 code units,
// split on whole characters; an empty text has no part.
export function splitToLength(text: string, maximum: number): readonly string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maximum) {
    const part = truncatedToLength(rest, maximum);
    parts.push(part);
    rest = rest.slice(part.length);
  }
  if (rest !== '') parts.push(rest);
  return Object.freeze(parts);
}

// Cuts the tail to at most `maximum` UTF-8 bytes on a whole character.
export function truncatedToUtf8Bytes(text: string, maximum: number): string {
  let bytes = 0;
  let end = 0;
  for (const character of text) {
    bytes += utf8Width(character);
    if (bytes > maximum) return text.slice(0, end);
    end += character.length;
  }
  return text;
}

function utf8Width(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  return codePoint < 0x10000 ? 3 : 4;
}

function isHighSurrogate(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff;
}

function isLowSurrogate(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff;
}
