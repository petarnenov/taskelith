import { err, failure, ok, type Result } from '@taskelith/kernel';

declare const generationBrand: unique symbol;

// The version of a gate or stage progress. A transition names the version its
// writer read and increments it (compare-and-set), so stale writes fail.
export type Generation = number & { readonly [generationBrand]: true };

export const FIRST_GENERATION = 1 as Generation;

export function parseGeneration(value: number): Result<Generation> {
  if (!Number.isSafeInteger(value) || value < 1) {
    return err(failure('invalid', 'Generation must be a positive integer'));
  }
  return ok(value as Generation);
}

export function nextGeneration(generation: Generation): Generation {
  return (generation + 1) as Generation;
}

export function checkGeneration(entity: string, actual: Generation, expected: Generation): Result<void> {
  if (actual !== expected) {
    return err(failure(
      'conflict',
      `${entity} is at generation ${actual}, not the expected generation ${expected}`,
      { expected: String(expected), actual: String(actual) },
    ));
  }
  return ok(undefined);
}

// A replacement carries the generation after the one its writer read, so an
// unchanged or older record cannot be written back over a newer one.
export function checkNextGeneration(entity: string, replacement: Generation, expected: Generation): Result<void> {
  if (replacement !== nextGeneration(expected)) {
    return err(failure(
      'invalid',
      `${entity} replacing generation ${expected} must be at generation ${nextGeneration(expected)}, not ${replacement}`,
      { expected: String(expected), replacement: String(replacement) },
    ));
  }
  return ok(undefined);
}
