import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { err, ok, type Result } from '@taskelith/kernel';
import type { PluginManifest } from './plugin-manifest.js';
import schema from './plugin-manifest.schema.json' with { type: 'json' };

// Adapter over ajv: callers see a manifest or readable schema violations,
// never ajv's own types.
let validateManifest: ValidateFunction<PluginManifest> | undefined;

export function checkManifestSchema(input: unknown): Result<PluginManifest, readonly string[]> {
  validateManifest ??= new Ajv2020({ allErrors: true }).compile<PluginManifest>(schema);
  if (validateManifest(input)) return ok(input);
  // Ajv sets errors whenever validation fails.
  return err(validateManifest.errors!.map(describeError));
}

function describeError(error: ErrorObject): string {
  const location = error.instancePath || '/';
  const property = error.params.additionalProperty as string | undefined;
  return property === undefined ? `${location} ${error.message}` : `${location} ${error.message} "${property}"`;
}
