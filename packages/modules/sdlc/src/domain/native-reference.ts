import { err, failure, ok, type Result } from '@taskelith/kernel';
import { isDisplayText } from './display-text.js';

declare const nativeReferenceBrand: unique symbol;

// A plugin's own reference to a work item or artifact, such as a file path; it
// is kept for display and traceability, never interpreted, and may be any text.
export type NativeReference = string & { readonly [nativeReferenceBrand]: true };

export const MAX_NATIVE_REFERENCE_LENGTH = 1024;

export function parseNativeReference(text: string): Result<NativeReference> {
  if (!isDisplayText(text, MAX_NATIVE_REFERENCE_LENGTH)) {
    return err(failure(
      'invalid',
      `NativeReference must be 1-${MAX_NATIVE_REFERENCE_LENGTH} characters without control characters`,
    ));
  }
  return ok(text as NativeReference);
}
