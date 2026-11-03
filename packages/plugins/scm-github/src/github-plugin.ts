import type { Result } from '@taskelith/kernel';
import { registerPlugin, type draft, type PluginHost } from '@taskelith/plugin-sdk';
import { createGithubSourceControl, type GithubSourceControlOptions } from './github-source-control.js';

export const GITHUB_PLUGIN_MANIFEST = Object.freeze({
  id: 'scm-github',
  version: '0.0.0',
  pluginApiRange: '^0.3.0',
  port: 'SourceControlProvider',
  capabilities: Object.freeze(['required-status']),
});

// The provider exists only after the host admits the plugin's manifest.
export function registerGithubSourceControl(
  host: PluginHost,
  options: GithubSourceControlOptions,
): Result<draft.SourceControlProvider> {
  const registered = registerPlugin(GITHUB_PLUGIN_MANIFEST, host);
  return registered.ok ? createGithubSourceControl(options) : registered;
}
