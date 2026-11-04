import type { ScmPlugins, SourceControlPlugin } from '@taskelith/integrations';

// The installation's SCM plugins: the one plugin it registers, whose
// identifier is read once here.
export function singlePlugin(plugin: SourceControlPlugin): ScmPlugins {
  const registered = plugin.id;
  return { pluginOf: (pluginId: string) => (pluginId === registered ? plugin : undefined) };
}
