import { err, failure, ok, type Result } from '@taskelith/kernel';
import { checkManifestSchema } from './manifest-schema-validator.js';

// Written by hand to match plugin-manifest.schema.json until type generation
// from schemas is wired into the build.
export interface PluginManifest {
  readonly id: string;
  readonly version: string;
  readonly pluginApiRange: string;
  readonly port: string;
  readonly capabilities: readonly string[];
}

export function parsePluginManifest(input: unknown): Result<PluginManifest> {
  const checked = checkManifestSchema(input);
  if (!checked.ok) return err(failure('invalid', `Plugin manifest is invalid: ${checked.error.join('; ')}`));
  const manifest = checked.value;
  return ok(Object.freeze({ ...manifest, capabilities: Object.freeze([...manifest.capabilities]) }));
}
