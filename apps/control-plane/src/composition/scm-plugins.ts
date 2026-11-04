import type { ScmPlugins, SourceControlPlugin } from '@taskelith/integrations';

// The installation's SCM plugins: the one plugin it registers.
export function singlePlugin(plugin: SourceControlPlugin): ScmPlugins {
  return { pluginOf: (pluginId: string) => (pluginId === plugin.id ? plugin : undefined) };
}
