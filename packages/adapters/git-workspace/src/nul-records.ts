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

// The bytes after the first `count` spaces; null when there are fewer.
export function afterFields(record: Uint8Array, count: number): Uint8Array | null {
  let start = 0;
  for (let field = 0; field < count; field += 1) {
    const space = record.indexOf(SPACE, start);
    if (space === -1) return null;
    start = space + 1;
  }
  return record.subarray(start);
}
