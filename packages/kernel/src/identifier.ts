import { failure } from './failure.js';
import { err, ok, type Result } from './result.js';

declare const identifierKind: unique symbol;

// A branded string that only parseIdentifier creates; kinds do not mix, as in
// `type TaskId = Identifier<'TaskId'>`, which the owning module declares.
export type Identifier<Kind extends string> = string & { readonly [identifierKind]: Kind };

export const MAX_IDENTIFIER_LENGTH = 128;
const PRINTABLE_WITHOUT_SPACE = /^[\x21-\x7e]+$/;

export function parseIdentifier<Kind extends string>(kind: Kind, text: string): Result<Identifier<Kind>> {
  if (text.length > MAX_IDENTIFIER_LENGTH || !PRINTABLE_WITHOUT_SPACE.test(text)) {
    return err(failure(
      'invalid',
      `${kind} must be 1-${MAX_IDENTIFIER_LENGTH} printable ASCII characters without whitespace`,
      { kind },
    ));
  }
  return ok(text as Identifier<Kind>);
}
