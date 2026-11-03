import { createPrivateKey } from 'node:crypto';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { registerPlugin, type draft, type PluginHost } from '@taskelith/plugin-sdk';
import { GITHUB_MERGE_METHODS } from './change-requests.js';
import { createGithubSourceControl, type GithubSourceControlOptions } from './github-source-control.js';
import { GithubWebhookDecoy, isGithubEventless } from './webhook-verifier.js';

export const GITHUB_PLUGIN_MANIFEST = Object.freeze({
  id: 'scm-github',
  version: '0.0.0',
  pluginApiRange: '^0.4.0',
  port: 'SourceControlProvider',
  capabilities: Object.freeze(['required-status']),
});

// An integration's settings: the App, its installation, and the merge
// methods that the repositories allow, as comma-separated port methods.
export const GITHUB_SETTING_NAMES = Object.freeze(['app-id', 'installation-id', 'merge-methods']);
export const GITHUB_SECRET_NAMES = Object.freeze(['private-key', 'webhook-secret']);
const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;

// Where the plugin reaches GitHub; tests point it at an emulator.
export type GithubPluginOptions = Pick<GithubSourceControlOptions, 'baseUrl' | 'fetch' | 'clock'>;

// The provider exists only after the host admits the plugin's manifest.
export function registerGithubSourceControl(
  host: PluginHost,
  options: GithubSourceControlOptions,
): Result<draft.SourceControlProvider> {
  const registered = registerPlugin(GITHUB_PLUGIN_MANIFEST, host);
  return registered.ok ? createGithubSourceControl(options) : registered;
}

export function registerGithubSourceControlPlugin(host: PluginHost, options: GithubPluginOptions = {}): Result<draft.SourceControlPlugin> {
  const registered = registerPlugin(GITHUB_PLUGIN_MANIFEST, host);
  return registered.ok ? ok(githubSourceControlPlugin(options)) : registered;
}

// The draft descriptor through which the control plane checks and builds
// stored integrations; no check quotes a value.
export function githubSourceControlPlugin(options: GithubPluginOptions = {}): draft.SourceControlPlugin {
  return Object.freeze({
    id: GITHUB_PLUGIN_MANIFEST.id,
    secretNames: GITHUB_SECRET_NAMES,
    checkSettings,
    checkSecret,
    createProvider: ({ settings, secrets }: draft.SourceControlConfiguration) => createGithubSourceControl({
      ...options,
      appId: settings['app-id'] ?? '',
      installationId: settings['installation-id'] ?? '',
      mergeMethods: mergeMethodsOf(settings['merge-methods'] ?? ''),
      privateKey: secrets['private-key'] ?? '',
      webhookSecret: secrets['webhook-secret'] ?? '',
    }),
    createDecoy: () => new GithubWebhookDecoy(),
    isEventless: isGithubEventless,
  });
}

function checkSettings(settings: draft.ScmValues): Result<void> {
  const unknown = Object.keys(settings).find((name) => !GITHUB_SETTING_NAMES.includes(name));
  if (unknown !== undefined) return refused(unknown);
  const invalid = GITHUB_SETTING_NAMES.find((name) => !isValidSetting(name, settings[name]));
  return invalid === undefined ? ok(undefined) : refused(invalid);
}

function isValidSetting(name: string, setting: string | undefined): boolean {
  if (setting === undefined) return false;
  if (name !== 'merge-methods') return NUMERIC_ID.test(setting);
  const methods = mergeMethodsOf(setting);
  return methods.length > 0 && new Set(methods).size === methods.length && methods.every((method) => Object.hasOwn(GITHUB_MERGE_METHODS, method));
}

function checkSecret(name: string, secret: string): Result<void> {
  if (name === 'webhook-secret') return secret.length > 0 ? ok(undefined) : refused(name);
  return name === 'private-key' && isPrivateKey(secret) ? ok(undefined) : refused(name);
}

function isPrivateKey(pem: string): boolean {
  try {
    createPrivateKey(pem);
    return true;
  } catch {
    return false;
  }
}

function mergeMethodsOf(setting: string): string[] {
  return setting === '' ? [] : setting.split(',');
}

function refused(name: string): Result<never> {
  return err(failure('invalid', `The setting ${name} is unknown, missing, or invalid`, { setting: name }));
}
