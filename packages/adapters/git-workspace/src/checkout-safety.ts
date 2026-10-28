import type { Result } from '@taskelith/kernel';

export function checkCheckoutSafety(_checkout: string, _owner: number): Promise<Result<void>> {
  throw new Error('not implemented');
}
