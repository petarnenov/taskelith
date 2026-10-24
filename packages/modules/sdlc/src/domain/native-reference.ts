import { err, failure, ok, type Result } from '@taskelith/kernel';

declare const nativeReferenceBrand: unique symbol;

// A framework plugin's own reference to a work item or artifact, such as a
// change name or a file path at a commit. The domain stores it for display and
// traceability and never interprets it; it may contain spaces and non-ASCII
// text, unlike an identifier.
export type NativeReference = string & { readonly [nativeReferenceBrand]: true };

export const MAX_NATIVE_REFERENCE_LENGTH = 1024;
const CONTROL_CHARACTER = /\p{Cc}/u;

export function parseNativeReference(text: string): Result<NativeReference> {
  if (text.length === 0 || text.length > MAX_NATIVE_REFERENCE_LENGTH || CONTROL_CHARACTER.test(text)) {
    return err(failure(
      'invalid',
      `NativeReference must be 1-${MAX_NATIVE_REFERENCE_LENGTH} characters without control characters`,
    ));
  }
  return ok(text as NativeReference);
}
