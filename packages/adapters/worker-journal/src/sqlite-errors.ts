// SQLite primary result codes that the journal acts on; node:sqlite puts
// the code in the error's `errcode`, possibly as an extended code.
export const SQLITE_BUSY = 5;
export const SQLITE_READONLY = 8;
export const SQLITE_IOERR = 10;
export const SQLITE_CORRUPT = 11;
export const SQLITE_FULL = 13;
export const SQLITE_CANTOPEN = 14;
export const SQLITE_PROTOCOL = 15;
export const SQLITE_NOTADB = 26;

export function sqliteCode(error: unknown): number | undefined {
  const code = (error as { errcode?: unknown } | null)?.errcode;
  return typeof code === 'number' ? code & 0xff : undefined;
}

export function isSqliteError(error: unknown, code: number): boolean {
  return sqliteCode(error) === code;
}
