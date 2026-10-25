import { err, failure, ok, type Result } from '@taskelith/kernel';

declare const ownershipGenerationBrand: unique symbol;

// The version of a task's active ownership. Each change of the owner raises
// it, so a command or observation of an earlier owner is recognized as stale.
export type OwnershipGeneration = number & { readonly [ownershipGenerationBrand]: true };

export const FIRST_OWNERSHIP_GENERATION = 1 as OwnershipGeneration;

export function parseOwnershipGeneration(value: number): Result<OwnershipGeneration> {
  if (!Number.isSafeInteger(value) || value < 1) {
    return err(failure('invalid', 'OwnershipGeneration must be a positive integer'));
  }
  return ok(value as OwnershipGeneration);
}

export function nextOwnershipGeneration(generation: OwnershipGeneration): OwnershipGeneration {
  return (generation + 1) as OwnershipGeneration;
}
