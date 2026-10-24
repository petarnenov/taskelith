import { err, failure, ok, type Result } from '@taskelith/kernel';

declare const generationBrand: unique symbol;

// The version of a gate or of a workflow's stage progress. Every accepted
// transition increments it, and every transition names the generation its
// writer read, so that a writer working from an outdated read is rejected
// (compare-and-set) instead of overwriting a newer state.
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
