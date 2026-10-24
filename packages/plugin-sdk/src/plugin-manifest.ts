import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import schema from './plugin-manifest.schema.json' with { type: 'json' };

// Written by hand to match plugin-manifest.schema.json until type generation
// from schemas is wired into the build.
export interface PluginManifest {
  readonly id: string;
  readonly version: string;
  readonly pluginApiRange: string;
  readonly port: string;
  readonly capabilities: readonly string[];
}

const validateManifest = new Ajv2020({ allErrors: true }).compile<PluginManifest>(schema);

export function parsePluginManifest(input: unknown): Result<PluginManifest> {
  if (!validateManifest(input)) {
    // Ajv sets errors whenever validation fails.
    const problems = validateManifest.errors!.map(describeError).join('; ');
    return err(failure('invalid', `Plugin manifest is invalid: ${problems}`));
  }
  return ok(Object.freeze({ ...input, capabilities: Object.freeze([...input.capabilities]) }));
}

function describeError(error: ErrorObject): string {
  const location = error.instancePath || '/';
  const property = error.params.additionalProperty as string | undefined;
  return property === undefined ? `${location} ${error.message}` : `${location} ${error.message} "${property}"`;
}
