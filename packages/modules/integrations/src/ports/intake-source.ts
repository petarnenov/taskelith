import type { Result } from '@taskelith/kernel';

export const MAX_INTAKE_TITLE_LENGTH = 200;
export const MAX_INTAKE_BODY_BYTES = 256 * 1024;

// Plugin-facing: every field is plain data that the module parses and bounds,
// because plugin output is untrusted.
export interface IntakeSourceDescription {
  readonly sourceKind: string;
  readonly label: string;
  readonly supportsWriteBack: boolean;
}

export interface IntakeRequest {
  readonly projectId: string;
  readonly reference: string;
}

export interface IntakeItemData {
  readonly externalId: string;
  readonly title: string;
  readonly body: string;
  readonly link: string;
  readonly suggestedWorkType?: string;
}

// Imports one item from a source reference such as a link; the module fills
// the task draft's changeable defaults from the project.
export interface IntakeSource {
  describe(): IntakeSourceDescription;
  fetch(request: IntakeRequest): Promise<Result<IntakeItemData>>;
}
