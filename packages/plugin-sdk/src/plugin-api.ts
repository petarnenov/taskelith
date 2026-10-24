// The version of the plugin API this SDK implements. Pre-1.0, so a plugin's
// caret range accepts only the same minor version.
export const PLUGIN_API_VERSION = '0.1.0';

type Version = readonly [major: number, minor: number, patch: number];

const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// Caret semantics as in npm: ^1.2.3 accepts >=1.2.3 <2.0.0, ^0.2.3 accepts
// >=0.2.3 <0.3.0, and ^0.0.3 accepts only 0.0.3. Only release versions and
// `^MAJOR.MINOR.PATCH` ranges are understood; anything else is not satisfied.
export function satisfiesCaretRange(version: string, caretRange: string): boolean {
  const actual = parseReleaseVersion(version);
  const minimum = caretRange.startsWith('^') ? parseReleaseVersion(caretRange.slice(1)) : undefined;
  if (actual === undefined || minimum === undefined || compare(actual, minimum) < 0) return false;
  const [major, minor] = minimum;
  if (major > 0) return actual[0] === major;
  if (minor > 0) return actual[0] === 0 && actual[1] === minor;
  return compare(actual, minimum) === 0;
}

function parseReleaseVersion(text: string): Version | undefined {
  const match = RELEASE_VERSION.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function compare(left: Version, right: Version): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}
