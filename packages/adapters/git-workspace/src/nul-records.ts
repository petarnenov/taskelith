const NUL = 0;
const SPACE = 0x20;

// The records of Git's `-z` output; null when the last one is unterminated.
export function nulRecords(output: Uint8Array): Uint8Array[] | null {
  const records: Uint8Array[] = [];
  let start = 0;
  for (let index = output.indexOf(NUL); index !== -1; index = output.indexOf(NUL, start)) {
    records.push(output.subarray(start, index));
    start = index + 1;
  }
  return start === output.length ? records : null;
}

export interface SplitRecord {
  readonly fields: readonly string[];
  // The bytes after the fields, such as a path that may hold spaces.
  readonly rest: Uint8Array;
}

// The first `count` space-separated fields as latin1 text and the rest;
// null when there are fewer.
export function splitFields(record: Uint8Array, count: number): SplitRecord | null {
  const fields: string[] = [];
  let start = 0;
  for (let field = 0; field < count; field += 1) {
    const space = record.indexOf(SPACE, start);
    if (space === -1) return null;
    fields.push(Buffer.from(record.subarray(start, space)).toString('latin1'));
    start = space + 1;
  }
  return { fields, rest: record.subarray(start) };
}
