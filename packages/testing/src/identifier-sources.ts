import { parseIdentifier, type Identifier } from '@taskelith/kernel';
import type { SeededRandom } from './seeded-random.js';

export interface IdSource<Kind extends string> {
  next(): Identifier<Kind>;
}

// `<prefix>-1`, `<prefix>-2`, ... for assertions that name identifiers.
export function sequentialIds<Kind extends string>(kind: Kind, prefix: string): IdSource<Kind> {
  let count = 0;
  return { next: () => identifier(kind, `${prefix}-${++count}`) };
}

// UUID version 4 text drawn from the seeded generator.
export function seededUuids<Kind extends string>(kind: Kind, random: SeededRandom): IdSource<Kind> {
  return { next: () => identifier(kind, uuidText(random)) };
}

function uuidText(random: SeededRandom): string {
  const bytes = Array.from({ length: 16 }, () => random.nextInt(256));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function identifier<Kind extends string>(kind: Kind, text: string): Identifier<Kind> {
  const parsed = parseIdentifier(kind, text);
  if (!parsed.ok) throw new RangeError(parsed.error.message);
  return parsed.value;
}
