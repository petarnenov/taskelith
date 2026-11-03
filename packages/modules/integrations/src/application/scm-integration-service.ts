import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { normalizeOrigin } from '../domain/normalized-origin.js';
import { ScmSecrets, type ScmIntegration } from '../domain/scm-integration.js';
import type { ScmIntegrationChange, ScmIntegrationIds, ScmIntegrations, ScmPlugins } from '../ports/scm-integrations.js';
import type { ScmValues, SourceControlPlugin } from '../ports/source-control-plugin.js';

export const SCM_INTEGRATION_PAGE_SIZE = 100;

export interface ScmIntegrationCreation {
  readonly pluginId: string;
  readonly label: string;
  readonly allowedOrigin: string;
  readonly settings: ScmValues;
  readonly secrets: ScmValues;
}

export interface ScmIntegrationUpdate {
  readonly expectedRevision: number;
  readonly label?: string;
  readonly allowedOrigin?: string;
  readonly settings?: ScmValues;
  readonly secrets?: ScmValues;
}

export interface ScmIntegrationPage {
  readonly items: readonly ScmIntegration[];
  readonly next?: string;
}

export interface ScmIntegrationServicePorts {
  readonly store: ScmIntegrations;
  readonly plugins: ScmPlugins;
  readonly ids: ScmIntegrationIds;
}

// Wire contracts section 4: the plugin checks its settings and secrets,
// and the control plane normalizes the allowed origin (section 4.1).
export class ScmIntegrationService {
  readonly #ports: ScmIntegrationServicePorts;

  constructor(ports: ScmIntegrationServicePorts) {
    this.#ports = ports;
  }

  async list(after: string | undefined): Promise<Result<ScmIntegrationPage>> {
    const read = await this.#ports.store.page(after, SCM_INTEGRATION_PAGE_SIZE + 1);
    if (!read.ok) return read;
    const items = read.value.slice(0, SCM_INTEGRATION_PAGE_SIZE);
    const more = read.value.length > SCM_INTEGRATION_PAGE_SIZE;
    return ok(more ? { items, next: items[items.length - 1]!.integrationId } : { items });
  }

  async read(integrationIdText: string): Promise<Result<ScmIntegration>> {
    const integrationId = parseIdentifier('ScmIntegrationId', integrationIdText);
    const read = integrationId.ok ? await this.#ports.store.get(integrationId.value) : ok(undefined);
    if (!read.ok) return read;
    return read.value === undefined ? err(unknownIntegration()) : ok(read.value);
  }

  async create(creation: ScmIntegrationCreation): Promise<Result<ScmIntegration>> {
    const plugin = this.#ports.plugins.pluginOf(creation.pluginId);
    if (plugin === undefined) return err(failure('not-found', 'no SCM plugin has this identifier', { pluginId: creation.pluginId }));
    const allowedOrigin = normalizeOrigin(creation.allowedOrigin);
    if (!allowedOrigin.ok) return allowedOrigin;
    const settings = checkedSettings(plugin, creation.settings);
    if (!settings.ok) return settings;
    const secrets = checkedSecrets(plugin, creation.secrets);
    if (!secrets.ok) return secrets;
    const missing = plugin.secretNames.find((name) => !Object.hasOwn(creation.secrets, name));
    if (missing !== undefined) return err(failure('invalid', `the secret ${missing} is missing`, { setting: missing }));
    const integration: ScmIntegration = {
      integrationId: this.#ports.ids.next(), pluginId: plugin.id, label: creation.label, allowedOrigin: allowedOrigin.value,
      settings: { ...creation.settings }, secretNames: secrets.value.names(), revision: 1,
    };
    return this.#ports.store.add(integration, secrets.value);
  }

  async update(integrationIdText: string, update: ScmIntegrationUpdate): Promise<Result<ScmIntegration>> {
    const current = await this.read(integrationIdText);
    if (!current.ok) return current;
    const plugin = this.#ports.plugins.pluginOf(current.value.pluginId);
    if (plugin === undefined) return err(failure('internal', 'the integration names no registered SCM plugin'));
    const change = changeOf(plugin, update);
    return change.ok ? this.#ports.store.update(current.value.integrationId, change.value) : change;
  }
}

function changeOf(plugin: SourceControlPlugin, update: ScmIntegrationUpdate): Result<ScmIntegrationChange> {
  const { expectedRevision, label, allowedOrigin, settings, secrets } = update;
  const origin = allowedOrigin === undefined ? ok(undefined) : normalizeOrigin(allowedOrigin);
  if (!origin.ok) return origin;
  const settingsChecked = settings === undefined ? ok(undefined) : checkedSettings(plugin, settings);
  if (!settingsChecked.ok) return settingsChecked;
  const replaced = secrets === undefined ? ok(undefined) : checkedSecrets(plugin, secrets);
  if (!replaced.ok) return replaced;
  return ok({
    expectedRevision,
    ...(label === undefined ? {} : { label }),
    ...(origin.value === undefined ? {} : { allowedOrigin: origin.value }),
    ...(settings === undefined ? {} : { settings: { ...settings } }),
    ...(replaced.value === undefined ? {} : { secrets: replaced.value }),
  });
}

function checkedSettings(plugin: SourceControlPlugin, settings: ScmValues): Result<void> {
  const checked = plugin.checkSettings(settings);
  return checked.ok ? checked : err(refusedSetting('setting', checked.error.details.setting ?? 'settings'));
}

// Each named secret is one the plugin knows, with a value it accepts.
function checkedSecrets(plugin: SourceControlPlugin, values: ScmValues): Result<ScmSecrets> {
  const secrets = ScmSecrets.of(values);
  if (!secrets.ok) return secrets;
  for (const name of secrets.value.names()) {
    if (!plugin.checkSecret(name, values[name]!).ok) return err(refusedSetting('secret', name));
  }
  return secrets;
}

// The plugin's own message may quote a value, so only the name is kept.
function refusedSetting(kind: 'setting' | 'secret', name: string) {
  return failure('invalid', `the ${kind} ${name} is unknown, missing, or invalid`, { setting: name });
}

function unknownIntegration() {
  return failure('not-found', 'no SCM integration has this identifier');
}
