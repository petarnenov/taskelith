// The version of the plugin API this SDK implements. Pre-1.0, so a plugin's
// caret range accepts only the same minor version.
export const PLUGIN_API_VERSION = '0.1.0';

type Version = readonly [major: number, minor: number, patch: number];

// Caret semantics as in npm: ^1.2.3 accepts >=1.2.3 <2.0.0, ^0.2.3 accepts
// >=0.2.3 <0.3.0, and ^0.0.3 accepts only 0.0.3. The manifest schema admits
// no other range syntax.
export function satisfiesCaretRange(version: string, caretRange: string): boolean {
  const actual = parseVersion(version);
  const minimum = parseVersion(caretRange.slice(1));
  if (compare(actual, minimum) < 0) return false;
  const [major, minor] = minimum;
  if (major > 0) return actual[0] === major;
  if (minor > 0) return actual[0] === 0 && actual[1] === minor;
  return compare(actual, minimum) === 0;
}

function parseVersion(text: string): Version {
  const [major, minor, patch] = text.split('.').map(Number);
  return [major, minor, patch];
}

function compare(left: Version, right: Version): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}
