// The X-CSRF-Token check: equal lengths first, then a comparison whose time
// depends only on the length, never on where the values differ.
export function csrfTokenMatches(expected: string, presented: string | undefined): boolean {
  if (presented === undefined || presented.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ presented.charCodeAt(index);
  }
  return difference === 0;
}
