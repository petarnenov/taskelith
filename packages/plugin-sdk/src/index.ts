export { PLUGIN_API_PORT_VERSIONS, PLUGIN_API_VERSION, satisfiesCaretRange } from './plugin-api.js';
export { type PluginManifest } from './plugin-manifest.js';
export { registerPlugin, type PluginHost } from './register-plugin.js';
export type {
  ArtifactRequirement,
  ArtifactRevisionData,
  FinalizationReport,
  FrameworkContext,
  OptionalSdlcOperation,
  ResolvedWorkflow,
  SdlcFramework,
  SdlcFrameworkCapabilities,
  SdlcOperation,
  StageData,
  StageInstructions,
  StageRequest,
  StructuralValidationReport,
  StructuralValidationRequest,
  ValidationProblem,
  WorkItemData,
  WorkItemRequest,
  WorkflowDefinitionData,
  WorkflowRequest,
} from '@taskelith/sdlc/port';
