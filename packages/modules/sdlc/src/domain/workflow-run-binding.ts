import { ok, parseIdentifier, type Identifier, type Result } from '@taskelith/kernel';
import { parseContentDigest, type ContentDigest } from './content-digest.js';
import { fieldFailure } from './field-failure.js';
import type { WorkflowId, WorkflowVersion } from './workflow-definition.js';

export type PluginId = Identifier<'PluginId'>;
export type PluginVersion = Identifier<'PluginVersion'>;
export type ToolVersion = Identifier<'ToolVersion'>;
export type ConfigurationRevision = Identifier<'ConfigurationRevision'>;
export type PolicyRevision = Identifier<'PolicyRevision'>;

// What a workflow run is bound to when it is created (architecture section 6,
// "Selection and switching"). The binding is immutable: changing a project or
// installation default affects only new runs, and moving an existing run to
// another framework is an explicit migration that records a new binding.
export interface WorkflowRunBinding {
  readonly pluginId: PluginId;
  readonly pluginVersion: PluginVersion;
  readonly upstreamToolVersion: ToolVersion;
  readonly workflowId: WorkflowId;
  readonly workflowVersion: WorkflowVersion;
  readonly workflowDigest: ContentDigest;
  readonly configurationRevision: ConfigurationRevision;
  readonly policyRevision: PolicyRevision;
}

export type WorkflowRunBindingInput = { readonly [Field in keyof WorkflowRunBinding]: string };

export function parseWorkflowRunBinding(input: WorkflowRunBindingInput): Result<WorkflowRunBinding> {
  const pluginId = parseIdentifier('PluginId', input.pluginId);
  if (!pluginId.ok) return fieldFailure('pluginId', pluginId.error);
  const pluginVersion = parseIdentifier('PluginVersion', input.pluginVersion);
  if (!pluginVersion.ok) return fieldFailure('pluginVersion', pluginVersion.error);
  const upstreamToolVersion = parseIdentifier('ToolVersion', input.upstreamToolVersion);
  if (!upstreamToolVersion.ok) return fieldFailure('upstreamToolVersion', upstreamToolVersion.error);
  const workflowId = parseIdentifier('WorkflowId', input.workflowId);
  if (!workflowId.ok) return fieldFailure('workflowId', workflowId.error);
  const workflowVersion = parseIdentifier('WorkflowVersion', input.workflowVersion);
  if (!workflowVersion.ok) return fieldFailure('workflowVersion', workflowVersion.error);
  const workflowDigest = parseContentDigest(input.workflowDigest);
  if (!workflowDigest.ok) return fieldFailure('workflowDigest', workflowDigest.error);
  const configurationRevision = parseIdentifier('ConfigurationRevision', input.configurationRevision);
  if (!configurationRevision.ok) return fieldFailure('configurationRevision', configurationRevision.error);
  const policyRevision = parseIdentifier('PolicyRevision', input.policyRevision);
  if (!policyRevision.ok) return fieldFailure('policyRevision', policyRevision.error);
  return ok(Object.freeze({
    pluginId: pluginId.value,
    pluginVersion: pluginVersion.value,
    upstreamToolVersion: upstreamToolVersion.value,
    workflowId: workflowId.value,
    workflowVersion: workflowVersion.value,
    workflowDigest: workflowDigest.value,
    configurationRevision: configurationRevision.value,
    policyRevision: policyRevision.value,
  }));
}
