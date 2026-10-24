import { ok, type Result } from '@taskelith/kernel';
import { registerPlugin, type PluginHost } from '@taskelith/plugin-sdk';
import { OPENSPEC_CAPABILITIES, OpenSpecFramework } from './openspec-framework.js';
import type { OpenSpecCliOptions } from './openspec-cli.js';

export const OPENSPEC_PLUGIN_MANIFEST = Object.freeze({
  id: 'sdlc-openspec',
  version: '0.0.0',
  pluginApiRange: '^0.1.0',
  port: 'SdlcFramework',
  capabilities: Object.freeze(OPENSPEC_CAPABILITIES.optionalOperations.map(kebabCase)),
});

// The framework exists only after the host admits the plugin's manifest.
export function registerOpenSpecFramework(host: PluginHost, options: OpenSpecCliOptions): Result<OpenSpecFramework> {
  const registered = registerPlugin(OPENSPEC_PLUGIN_MANIFEST, host);
  return registered.ok ? ok(new OpenSpecFramework(options)) : registered;
}

// Manifest capabilities are kebab-case names of the declared optional
// operations, for example `validate-structure`.
function kebabCase(operation: string): string {
  return operation.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
