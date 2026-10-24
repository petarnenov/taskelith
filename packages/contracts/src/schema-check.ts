import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { err, ok, type Result } from '@taskelith/kernel';
import type { components } from './generated/http-types.js';
import type { MessageSchemas } from './generated/message-types.js';
import { HTTP_SCHEMAS, MESSAGE_SCHEMAS } from './generated/schemas.js';

export type HttpSchemas = components['schemas'];
export type { MessageSchemas };

// What a rejected input violates, as readable messages that name the location
// in the input.
export type SchemaViolations = readonly string[];

// Adapter over ajv: HTTP schemas are JSON Schema 2020-12 (OpenAPI 3.1) and
// message schemas are draft-07 (AsyncAPI 3.0), so each dialect has its own
// validator instance. Callers see a typed value or violations, never ajv's
// own types.
let httpValidator: Ajv2020 | undefined;
let messageValidator: Ajv | undefined;

export function checkHttpSchema<Name extends keyof HttpSchemas & string>(
  name: Name,
  input: unknown,
): Result<HttpSchemas[Name], SchemaViolations> {
  httpValidator ??= new Ajv2020({ allErrors: true, strict: true }).addSchema(HTTP_SCHEMAS);
  return check<HttpSchemas[Name]>(httpValidator.getSchema(`${HTTP_SCHEMAS.$id}#/$defs/${name}`), name, input);
}

export function checkMessageSchema<Name extends keyof MessageSchemas & string>(
  name: Name,
  input: unknown,
): Result<MessageSchemas[Name], SchemaViolations> {
  messageValidator ??= new Ajv({ allErrors: true, strict: true }).addSchema(MESSAGE_SCHEMAS);
  return check<MessageSchemas[Name]>(messageValidator.getSchema(`${MESSAGE_SCHEMAS.$id}#/definitions/${name}`), name, input);
}

function check<T>(validate: ValidateFunction | undefined, name: string, input: unknown): Result<T, SchemaViolations> {
  // The name type admits only schemas of the document, which the bundle contains.
  if (validate!(input)) return ok(input as T);
  return err(validate!.errors!.map((error) => describeError(name, error)));
}

function describeError(name: string, error: ErrorObject): string {
  const location = error.instancePath || '/';
  const property = error.params.additionalProperty as string | undefined;
  const detail = property === undefined ? error.message : `${error.message} "${property}"`;
  return `${name} ${location} ${detail}`;
}
