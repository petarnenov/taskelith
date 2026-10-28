import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import type { SchemaCheck } from './review-findings.ts';

// Shared by the findings tool and the routing commands it dispatches, so
// that those commands need not import the tool itself.

export const SCHEMA_PATH = 'docs/review-findings/finding.schema.json';

export interface RunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

// A parsed JSON object, never an array or null.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Adapter over ajv: callers see readable violations, never ajv's own types.
export function ajvSchemaCheck(schema: object, references: readonly object[] = []): SchemaCheck {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const reference of references) ajv.addSchema(reference);
  const validate = ajv.compile(schema);
  return (value) => (validate(value) ? [] : validate.errors!.map(describeError));
}

// An unknown property's name is untrusted input, so it is never printed.
function describeError(error: ErrorObject): string {
  return `${error.instancePath || '/'} ${error.message}`;
}
