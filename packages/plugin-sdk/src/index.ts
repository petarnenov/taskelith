export { PLUGIN_API_PORT_VERSIONS, PLUGIN_API_VERSION, satisfiesCaretRange } from './plugin-api.js';
export { type PluginManifest } from './plugin-manifest.js';
export { registerPlugin, type PluginHost } from './register-plugin.js';
// The draft SCM port, outside the frozen surface (plugin-registration spec).
export type * as draft from './draft.js';
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
