import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { Clock } from '@taskelith/sdlc';
import { normalizeOrigin } from '../domain/normalized-origin.js';
import { MAX_SCM_SECRETS, ScmSecrets, type ScmIntegration, type ScmIntegrationId } from '../domain/scm-integration.js';
import type { ScmIntegrationAuditEntry } from '../ports/scm-integration-audit.js';
import {
  UNREADABLE_PLUGIN_ID, type ScmIntegrationChange, type ScmIntegrationIds, type ScmIntegrations, type ScmPluginDefects, type ScmPlugins,
} from '../ports/scm-integrations.js';
import type { ScmValues, SourceControlPlugin } from '../ports/source-control-plugin.js';
import { nonEmptyText, texts, type FieldCheck, type Reading } from '../ports/untrusted-shapes.js';
import { pluginAnswer, pluginDefect, pluginMember, type DefectOfCall, type ReportedDefect } from './plugin-answer.js';

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

// The audited actor, a principal, and the reason of the command.
export interface ScmIntegrationInvocation {
  readonly actor: string;
  readonly reason: string;
}

export interface ScmIntegrationServicePorts {
  readonly store: ScmIntegrations;
  readonly plugins: ScmPlugins;
  readonly ids: ScmIntegrationIds;
  readonly clock: Clock;
  readonly defects: ScmPluginDefects;
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

  async create(creation: ScmIntegrationCreation, invocation: ScmIntegrationInvocation): Promise<Result<ScmIntegration>> {
    const plugin = this.#ports.plugins.pluginOf(creation.pluginId);
    if (plugin === undefined) return err(failure('not-found', 'no SCM plugin has this identifier', { pluginId: creation.pluginId }));
    const allowedOrigin = normalizeOrigin(creation.allowedOrigin);
    if (!allowedOrigin.ok) return allowedOrigin;
    const integrationId = this.#ports.ids.next();
    const descriptor = this.#descriptorOf(plugin, integrationId);
    if (!descriptor.ok) return descriptor;
    const { pluginId, secretNames } = descriptor.value;
    const checks = this.#checksOf(plugin, this.#reportingDefect(integrationId, pluginId), []);
    const settings = await checks.settings(creation.settings);
    if (!settings.ok) return settings;
    const secrets = await checks.secrets(creation.secrets);
    if (!secrets.ok) return secrets;
    const missing = secretNames.find((name) => !Object.hasOwn(creation.secrets, name));
    if (missing !== undefined) return err(failure('invalid', `the secret ${missing} is missing`, { setting: missing }));
    const integration: ScmIntegration = {
      integrationId, pluginId, label: creation.label, allowedOrigin: allowedOrigin.value,
      settings: { ...creation.settings }, secretNames: secrets.value.names(), revision: 1,
    };
    return this.#ports.store.add(integration, secrets.value, this.#auditEntry(invocation));
  }

  async update(integrationIdText: string, update: ScmIntegrationUpdate, invocation: ScmIntegrationInvocation): Promise<Result<ScmIntegration>> {
    const current = await this.read(integrationIdText);
    if (!current.ok) return current;
    const plugin = this.#ports.plugins.pluginOf(current.value.pluginId);
    if (plugin === undefined) return err(failure('internal', 'the integration names no registered SCM plugin'));
    const { integrationId, settings } = current.value;
    const descriptor = this.#descriptorOf(plugin, integrationId);
    if (!descriptor.ok) return descriptor;
    const defect = this.#reportingDefect(integrationId, descriptor.value.pluginId);
    const change = await changeOf(this.#checksOf(plugin, defect, Object.keys(settings)), update);
    if (!change.ok) return change;
    const overflowing = secretPastLimit(current.value, change.value.secrets);
    if (overflowing !== undefined) return err(failure('invalid', `the secret ${overflowing} exceeds the ${MAX_SCM_SECRETS} secrets of an integration`, { setting: overflowing }));
    return this.#ports.store.update(integrationId, change.value, this.#auditEntry(invocation));
  }

  #auditEntry({ actor, reason }: ScmIntegrationInvocation): ScmIntegrationAuditEntry {
    return { actor, reason, at: this.#ports.clock.now() };
  }

  // Read before any check, so that no later step runs a plugin getter.
  #descriptorOf(plugin: SourceControlPlugin, integrationId: ScmIntegrationId): Result<PluginDescriptor> {
    const defectOf = (pluginId: string): DefectOfCall => (kind) => this.#reportingDefect(integrationId, pluginId)('descriptor', kind);
    const pluginId = pluginMember(() => plugin.id, checkedBy<string>(nonEmptyText), defectOf(UNREADABLE_PLUGIN_ID));
    if (!pluginId.ok) return pluginId;
    const secretNames = pluginMember(() => plugin.secretNames, copiedTexts, defectOf(pluginId.value));
    return secretNames.ok ? ok({ pluginId: pluginId.value, secretNames: secretNames.value }) : secretNames;
  }

  #reportingDefect(integrationId: ScmIntegrationId, pluginId: string): ReportedDefect {
    return (operation, kind) => {
      this.#ports.defects.defect({ integrationId, pluginId, operation, kind });
      return pluginDefect();
    };
  }

  // `held` names the settings the integration already has.
  #checksOf(plugin: SourceControlPlugin, defect: ReportedDefect, held: readonly string[]): PluginChecks {
    return {
      settings: (settings) => checkedSettings(plugin, settings, held, defect),
      secrets: (values) => checkedSecrets(plugin, values, defect),
    };
  }
}

// The plugin's identifier and secret names, read once as plain values.
interface PluginDescriptor {
  readonly pluginId: string;
  readonly secretNames: readonly string[];
}

function checkedBy<Value>(check: FieldCheck): (value: unknown) => Reading<Value> {
  return (value) => {
    const problem = check(value);
    return problem === undefined ? ok(value as Value) : err([problem]);
  };
}

function copiedTexts(value: unknown): Reading<readonly string[]> {
  const read = checkedBy<readonly string[]>(texts)(value);
  return read.ok ? ok(Object.freeze([...read.value])) : read;
}

// The plugin's checks of one integration, each inside the plugin boundary.
interface PluginChecks {
  settings(settings: ScmValues): Promise<Result<void>>;
  secrets(values: ScmValues): Promise<Result<ScmSecrets>>;
}

// The first added secret, in code-unit order, beyond `MAX_SCM_SECRETS`.
function secretPastLimit(current: ScmIntegration, replacements: ScmSecrets | undefined): string | undefined {
  const added = (replacements?.names() ?? []).filter((name) => !current.secretNames.includes(name));
  return added[MAX_SCM_SECRETS - current.secretNames.length];
}

async function changeOf(checks: PluginChecks, update: ScmIntegrationUpdate): Promise<Result<ScmIntegrationChange>> {
  const { expectedRevision, label, allowedOrigin, settings, secrets } = update;
  const origin = allowedOrigin === undefined ? ok(undefined) : normalizeOrigin(allowedOrigin);
  if (!origin.ok) return origin;
  const settingsChecked = settings === undefined ? ok(undefined) : await checks.settings(settings);
  if (!settingsChecked.ok) return settingsChecked;
  const replaced = secrets === undefined ? ok(undefined) : await checks.secrets(secrets);
  if (!replaced.ok) return replaced;
  return ok({
    expectedRevision,
    ...(label === undefined ? {} : { label }),
    ...(origin.value === undefined ? {} : { allowedOrigin: origin.value }),
    ...(settings === undefined ? {} : { settings: { ...settings } }),
    ...(replaced.value === undefined ? {} : { secrets: replaced.value }),
  });
}

// The plugin may report a value as the setting, so only a name that the
// request or the integration holds is kept.
async function checkedSettings(
  plugin: SourceControlPlugin, settings: ScmValues, held: readonly string[], defect: ReportedDefect,
): Promise<Result<void>> {
  const checked = await pluginAnswer(() => plugin.checkSettings(settings), noValue, (kind) => defect('checkSettings', kind));
  if (!checked.ok) return checked;
  if (checked.value.ok) return ok(undefined);
  const trusted = [...Object.keys(settings), ...held];
  const reported = checked.value.error.details.setting;
  return err(refusedSetting('setting', reported !== undefined && trusted.includes(reported) ? reported : 'settings'));
}

// Each named secret is one the plugin knows, with a value it accepts.
async function checkedSecrets(plugin: SourceControlPlugin, values: ScmValues, defect: ReportedDefect): Promise<Result<ScmSecrets>> {
  const secrets = ScmSecrets.of(values);
  if (!secrets.ok) return secrets;
  for (const name of secrets.value.names()) {
    const checked = await pluginAnswer(() => plugin.checkSecret(name, values[name]!), noValue, (kind) => defect('checkSecret', kind));
    if (!checked.ok) return checked;
    if (!checked.value.ok) return err(refusedSetting('secret', name));
  }
  return secrets;
}

// A check answers no value, so whatever it carries is ignored.
function noValue(): Reading<void> {
  return ok(undefined);
}

// The plugin's own message may quote a value, so only the name is kept.
function refusedSetting(kind: 'setting' | 'secret', name: string) {
  return failure('invalid', `the ${kind} ${name} is unknown, missing, or invalid`, { setting: name });
}

function unknownIntegration() {
  return failure('not-found', 'no SCM integration has this identifier');
}
