import { err, failure, ok, type Result } from '@taskelith/kernel';
import { PLUGIN_API_VERSION, satisfiesCaretRange } from './plugin-api.js';
import { parsePluginManifest, type PluginManifest } from './plugin-manifest.js';

// What the composition root offers plugins: the ports that modules declare.
export interface PluginHost {
  readonly ports: readonly string[];
}

// Admits a plugin only when its manifest is valid, it implements a port the
// host offers, and its plugin API range accepts this SDK's plugin API version.
export function registerPlugin(input: unknown, host: PluginHost): Result<PluginManifest> {
  const manifest = parsePluginManifest(input);
  if (!manifest.ok) return manifest;
  const { id, port, pluginApiRange } = manifest.value;
  if (!host.ports.includes(port)) {
    return err(failure('not-found', `Plugin ${id} implements unknown port ${port}`, { pluginId: id, port }));
  }
  if (!satisfiesCaretRange(PLUGIN_API_VERSION, pluginApiRange)) {
    return err(failure(
      'precondition-failed',
      `Plugin ${id} supports plugin API ${pluginApiRange}, which excludes ${PLUGIN_API_VERSION}`,
      { pluginId: id, pluginApiRange, pluginApiVersion: PLUGIN_API_VERSION },
    ));
  }
  return manifest;
}
