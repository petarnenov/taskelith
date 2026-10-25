import type { SQLOutputValue } from 'node:sqlite';

export type Row = Record<string, SQLOutputValue>;

// Values the journal stored from typed input are read back with their type;
// a format check and quick_check guard the file itself (contract section 8).
export function storedText<T extends string>(row: Row, column: string): T {
  const value = row[column];
  if (typeof value !== 'string') throw new TypeError(`journal column ${column} is not text`);
  return value as T;
}

export function optionalText<T extends string>(row: Row, column: string): T | undefined {
  return row[column] === null ? undefined : storedText<T>(row, column);
}

export function storedInteger<T extends number>(row: Row, column: string): T {
  const value = row[column];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError(`journal column ${column} is not an integer`);
  return value as T;
}
