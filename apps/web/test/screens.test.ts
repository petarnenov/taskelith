import { describe, expect, it } from 'vitest';
import { identifierOf, taskDetailPath } from '../src/screens';

// Every identifier of the wire contracts: 1-128 printable ASCII characters.
const PRINTABLE = Array.from({ length: 0x7e - 0x21 + 1 }, (_, offset) => String.fromCharCode(0x21 + offset));

describe('the task detail address', () => {
  it.each(PRINTABLE)('keeps %s route-safe and readable back', (character) => {
    const identifier = `a${character}b`;
    const [, , project, , run] = taskDetailPath(identifier, identifier).split('/');
    for (const segment of [project!, run!]) {
      // No dot, percent sign, or separator, which the SPA's server refuses.
      expect(segment).toMatch(/^[A-Za-z0-9_~-]+$/);
      expect(identifierOf(segment)).toBe(identifier);
    }
  });

  it('keeps an identifier of the longest length readable back', () => {
    const identifier = '.'.repeat(128);
    const [, , , , run] = taskDetailPath('p', identifier).split('/');
    expect(identifierOf(run!)).toBe(identifier);
  });
});
