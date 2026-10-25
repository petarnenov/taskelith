import { crc32 } from 'node:zlib';
import { err, ok, type Result } from '@taskelith/kernel';
import { encodeRecord, parseEventEntry, RECORD_FILES, type EventEntry, type RecordProblem } from './record.js';

// Append-only framing of the durable file rule (worker journal contract,
// section 4): length and checksum before each entry.
const FRAME = /^(\d+):([0-9a-f]{8}):/;

export function encodeEvent(entry: EventEntry): string {
  const body = encodeRecord(entry).trimEnd();
  return `${Buffer.byteLength(body)}:${checksum(body)}:${body}\n`;
}

// A torn last frame is discarded; a damaged frame before it means the file is
// corrupt.
export function parseEvents(text: string): Result<readonly EventEntry[], RecordProblem> {
  // The last piece after the final newline is empty or a torn frame.
  const complete = text.split('\n').slice(0, -1);
  const entries: EventEntry[] = [];
  for (const line of complete) {
    const entry = parseFrame(line);
    if (!entry.ok) return entry;
    entries.push(entry.value);
  }
  return ok(Object.freeze(entries));
}

function parseFrame(line: string): Result<EventEntry, RecordProblem> {
  const match = FRAME.exec(line);
  const body = match === null ? '' : line.slice(match[0].length);
  if (match === null || Number(match[1]) !== Buffer.byteLength(body) || match[2] !== checksum(body)) {
    return err({ file: RECORD_FILES.events, kind: 'corrupt', detail: 'has a damaged entry' });
  }
  return parseEventEntry(body);
}

function checksum(body: string): string {
  return crc32(body).toString(16).padStart(8, '0');
}
