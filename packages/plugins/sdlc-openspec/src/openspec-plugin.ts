import { ok, type Result } from '@taskelith/kernel';
import { registerPlugin, type PluginHost } from '@taskelith/plugin-sdk';
import { OpenSpecFramework } from './openspec-framework.js';
import type { OpenSpecCliOptions } from './openspec-cli.js';

export const OPENSPEC_PLUGIN_MANIFEST = Object.freeze({
  id: 'sdlc-openspec',
  version: '0.0.0',
  pluginApiRange: '^0.1.0',
  port: 'SdlcFramework',
  capabilities: Object.freeze(['validate-structure', 'finalize']),
});

// The framework exists only after the host admits the plugin's manifest.
export function registerOpenSpecFramework(host: PluginHost, options: OpenSpecCliOptions): Result<OpenSpecFramework> {
  const registered = registerPlugin(OPENSPEC_PLUGIN_MANIFEST, host);
  return registered.ok ? ok(new OpenSpecFramework(options)) : registered;
}
