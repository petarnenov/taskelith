import { err, failure, ok, type Result } from '@taskelith/kernel';
import { parseLifecycleObligation, type LifecycleObligation } from '../domain/lifecycle.js';
import { STRING_SHAPE, arrayOf, copyPlainData, plainShapeProblems, recordOf } from './plain-data.js';
import { OPTIONAL_SDLC_OPERATIONS, type OptionalSdlcOperation, type SdlcFrameworkCapabilities } from './sdlc-framework.js';

// The module's parser of a capability declaration, apart from the port
// contract, so that the port entry loads no domain code.

export interface ParsedSdlcFrameworkCapabilities {
  readonly optionalOperations: readonly OptionalSdlcOperation[];
  readonly nativeObligations: readonly LifecycleObligation[];
}

// The declaration comes from a plugin, so it is copied and its structure is
// checked at run time before its values are parsed.
export function parseSdlcFrameworkCapabilities(capabilities: unknown): Result<ParsedSdlcFrameworkCapabilities> {
  const copy = copyPlainData('capabilities', capabilities);
  if (!copy.ok) return structureFailure(copy.error);
  const shape = plainShapeProblems('capabilities', copy.value, CAPABILITIES_SHAPE);
  if (shape.length > 0) return structureFailure(shape);
  const declared = copy.value as SdlcFrameworkCapabilities;
  const optionalOperations: OptionalSdlcOperation[] = [];
  for (const text of declared.optionalOperations) {
    if (!(OPTIONAL_SDLC_OPERATIONS as readonly string[]).includes(text)) {
      return capabilityFailure('optionalOperations', `optional operation must be one of ${OPTIONAL_SDLC_OPERATIONS.join(', ')}`);
    }
    if (optionalOperations.includes(text as OptionalSdlcOperation)) {
      return capabilityFailure('optionalOperations', `operation ${text} is listed twice`);
    }
    optionalOperations.push(text as OptionalSdlcOperation);
  }
  const nativeObligations: LifecycleObligation[] = [];
  for (const text of declared.nativeObligations) {
    const obligation = parseLifecycleObligation(text);
    if (!obligation.ok) return capabilityFailure('nativeObligations', obligation.error.message);
    if (nativeObligations.includes(obligation.value)) return capabilityFailure('nativeObligations', `obligation ${text} is listed twice`);
    nativeObligations.push(obligation.value);
  }
  return ok(Object.freeze({
    optionalOperations: Object.freeze(optionalOperations),
    nativeObligations: Object.freeze(nativeObligations),
  }));
}

const CAPABILITIES_SHAPE = recordOf({ optionalOperations: arrayOf(STRING_SHAPE), nativeObligations: arrayOf(STRING_SHAPE) });

function structureFailure(problems: readonly string[]): Result<never> {
  return err(failure('invalid', problems.join('; '), { field: 'capabilities' }));
}

function capabilityFailure(field: keyof SdlcFrameworkCapabilities, message: string): Result<never> {
  return err(failure('invalid', `${field}: ${message}`, { field }));
}
