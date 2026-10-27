// The order of PostgreSQL's "C" collation for the ASCII identifiers.
export function byCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
