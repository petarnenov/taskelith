import { ok, parseIdentifier, type Identifier, type Result } from '@taskelith/kernel';
import { fieldFailure } from './field-failure.js';
import { parseNativeReference, type NativeReference } from './native-reference.js';

export type WorkItemId = Identifier<'WorkItemId'>;

// A unit of governed work, such as a change or a feature in the framework. The
// framework plugin maps the native reference to the stable platform identifier;
// the identifier stays the same when the native name or location changes.
export interface WorkItem {
  readonly id: WorkItemId;
  readonly nativeReference: NativeReference;
}

export type WorkItemInput = { readonly [Field in keyof WorkItem]: string };

export function parseWorkItem(input: WorkItemInput): Result<WorkItem> {
  const id = parseIdentifier('WorkItemId', input.id);
  if (!id.ok) return fieldFailure('id', id.error);
  const nativeReference = parseNativeReference(input.nativeReference);
  if (!nativeReference.ok) return fieldFailure('nativeReference', nativeReference.error);
  return ok(Object.freeze({ id: id.value, nativeReference: nativeReference.value }));
}
