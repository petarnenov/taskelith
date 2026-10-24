import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type {
  ArtifactRequirement,
  ArtifactRevisionData,
  FinalizationReport,
  FrameworkContext,
  ResolvedWorkflow,
  SdlcFramework,
  SdlcFrameworkCapabilities,
  StageData,
  StageInstructions,
  StageRequest,
  StructuralValidationReport,
  WorkItemData,
  WorkItemRequest,
  WorkflowRequest,
} from '@taskelith/plugin-sdk';

// Test-only: normalizes a SpecKit 1.2.3 working copy by the rules in
// ../fixtures/README.md, reading files only; G4 builds the real adapter.

export const SPECKIT_CAPABILITIES: SdlcFrameworkCapabilities = Object.freeze({
  optionalOperations: Object.freeze([]),
  nativeObligations: Object.freeze(['intake', 'specification', 'implementation']),
});

const WORKFLOW_ID = 'speckit';
const WORKFLOW_FILE = `.specify/workflows/${WORKFLOW_ID}/workflow.yml`;
const IMPLEMENT_STAGE = 'implement';
// Obligations SpecKit has no native record for, in workflow order.
const PLATFORM_STAGES = [
  { id: 'verify', obligation: 'verification' },
  { id: 'review', obligation: 'review' },
  { id: 'close', obligation: 'closure' },
] as const;

interface ArtifactDefinition {
  readonly artifactId: string;
  readonly stageId: string;
  readonly file: string;
  readonly requires: readonly string[];
}

const ARTIFACTS: readonly ArtifactDefinition[] = [
  { artifactId: 'spec', stageId: 'specify', file: 'spec.md', requires: [] },
  { artifactId: 'plan', stageId: 'plan', file: 'plan.md', requires: ['spec'] },
  { artifactId: 'tasks', stageId: 'tasks', file: 'tasks.md', requires: ['spec', 'plan'] },
];

interface WorkflowStep {
  readonly id: string;
  readonly gate: boolean;
}

interface Project {
  readonly toolVersion: string;
  readonly commandsDirectory: string;
}

export class SpecKitNormaliser implements SdlcFramework {
  readonly capabilities = SPECKIT_CAPABILITIES;

  async discoverWorkItems(request: FrameworkContext): Promise<Result<readonly WorkItemData[]>> {
    const project = await openProject(request.workingCopy);
    if (!project.ok) return project;
    const features = await featureDirectories(request.workingCopy);
    return ok(features.map((feature) => ({ id: `speckit:${feature}`, nativeReference: feature })));
  }

  async resolveWorkflow(request: WorkflowRequest): Promise<Result<ResolvedWorkflow>> {
    const project = await openProject(request.workingCopy);
    if (!project.ok) return project;
    if (request.workItem !== undefined) {
      const feature = await openFeature({ ...request, workItem: request.workItem });
      if (!feature.ok) return feature;
    }
    const source = await readFile(join(request.workingCopy, WORKFLOW_FILE));
    const registry = JSON.parse(await readFile(join(request.workingCopy, '.specify/workflows/workflow-registry.json'), 'utf8'));
    return ok({
      definition: { id: `speckit/${WORKFLOW_ID}`, version: registry.workflows[WORKFLOW_ID].version, stages: stagesOf(workflowSteps(source.toString('utf8'))) },
      digest: `sha256:${sha256(source)}`,
      upstreamToolVersion: project.value.toolVersion,
    });
  }

  async describeArtifacts(request: WorkItemRequest): Promise<Result<readonly ArtifactRequirement[]>> {
    const feature = await openFeature(request);
    if (!feature.ok) return feature;
    const requirements: ArtifactRequirement[] = [];
    for (const { artifactId, stageId, file, requires } of ARTIFACTS) {
      requirements.push({ artifactId, stageId, requires, present: await isFile(join(feature.value.directory, file)) });
    }
    return ok(requirements);
  }

  async inspectArtifactRevisions(request: WorkItemRequest): Promise<Result<readonly ArtifactRevisionData[]>> {
    const feature = await openFeature(request);
    if (!feature.ok) return feature;
    return ok(await revisionsOf(request));
  }

  async prepareStageInstructions(request: StageRequest): Promise<Result<StageInstructions>> {
    const feature = await openFeature(request);
    if (!feature.ok) return feature;
    const { stageId } = request;
    const source = await readFile(join(request.workingCopy, WORKFLOW_FILE), 'utf8');
    const step = workflowSteps(source).find((candidate) => candidate.id === stageId);
    if (step === undefined && !PLATFORM_STAGES.some((stage) => stage.id === stageId)) {
      return err(failure('not-found', `feature ${request.workItem} has no stage ${stageId}`, { stageId }));
    }
    if (step === undefined || step.gate) return err(failure('invalid', `stage ${stageId} is not an agent task`, { stageId }));
    const artifact = ARTIFACTS.find((candidate) => candidate.stageId === stageId);
    const inputIds = artifact?.requires ?? ARTIFACTS.map((candidate) => candidate.artifactId);
    const revisions = await revisionsOf(request);
    return ok({
      stageId,
      instructions: await readFile(join(request.workingCopy, feature.value.commandsDirectory, `speckit.${stageId}.md`), 'utf8'),
      inputs: revisions.filter((revision) => inputIds.includes(revision.artifactId)),
      outputs: artifact === undefined ? [] : [artifact.artifactId],
    });
  }

  async validateStructure(): Promise<Result<StructuralValidationReport>> {
    return err(failure('unavailable', 'SpecKit has no structural validator for feature artifacts'));
  }

  async finalize(): Promise<Result<FinalizationReport>> {
    return err(failure('unavailable', 'SpecKit has no closure operation'));
  }
}

async function openProject(workingCopy: string): Promise<Result<Project>> {
  const path = join(workingCopy, '.specify/integration.json');
  if (!(await isFile(path))) return err(failure('not-found', `${workingCopy} is not a SpecKit project`));
  const integration = JSON.parse(await readFile(path, 'utf8'));
  const settings = integration.integration_settings[integration.integration];
  return ok({ toolVersion: integration.version, commandsDirectory: settings.parsed_options.commands_dir });
}

interface Feature extends Project {
  readonly directory: string;
}

async function openFeature(request: WorkItemRequest): Promise<Result<Feature>> {
  const project = await openProject(request.workingCopy);
  if (!project.ok) return project;
  if (!(await featureDirectories(request.workingCopy)).includes(request.workItem)) {
    return err(failure('not-found', `no feature ${request.workItem}`, { workItem: request.workItem }));
  }
  return ok({ ...project.value, directory: join(request.workingCopy, 'specs', request.workItem) });
}

async function featureDirectories(workingCopy: string): Promise<string[]> {
  const entries = await readdir(join(workingCopy, 'specs'), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function revisionsOf(request: WorkItemRequest): Promise<ArtifactRevisionData[]> {
  const revisions: ArtifactRevisionData[] = [];
  for (const { artifactId, file } of ARTIFACTS) {
    const nativeReference = `specs/${request.workItem}/${file}`;
    const path = join(request.workingCopy, nativeReference);
    if (await isFile(path)) revisions.push({ artifactId, digest: `sha256:${sha256(await readFile(path))}`, nativeReference });
  }
  return revisions;
}

// The `steps` of the bundled workflow: each `- id:` entry, a gate when it has
// `type: gate`. Enough for the pinned file; G4 uses a YAML parser.
function workflowSteps(source: string): WorkflowStep[] {
  const steps: { id: string; gate: boolean }[] = [];
  const lines = source.slice(source.indexOf('\nsteps:')).split('\n');
  for (const line of lines) {
    const id = /^ {2}- id: (\S+)$/.exec(line)?.[1];
    if (id !== undefined) steps.push({ id, gate: false });
    else if (/^ {4}type: gate$/.test(line) && steps.length > 0) steps[steps.length - 1]!.gate = true;
  }
  return steps;
}

// Gates are platform-managed reviews; the first command is intake.
function stagesOf(steps: readonly WorkflowStep[]): StageData[] {
  const stages: StageData[] = steps.map((step, index) => ({
    id: step.id,
    obligations: step.gate ? ['review'] : nativeObligations(step.id, index),
    origin: step.gate ? 'platform-managed' : 'native',
    dependsOn: index === 0 ? [] : [steps[index - 1]!.id],
  }));
  for (const { id, obligation } of PLATFORM_STAGES) {
    stages.push({ id, obligations: [obligation], origin: 'platform-managed', dependsOn: [stages[stages.length - 1]!.id] });
  }
  return stages;
}

function nativeObligations(stageId: string, index: number): string[] {
  if (stageId === IMPLEMENT_STAGE) return ['implementation'];
  return index === 0 ? ['intake', 'specification'] : ['specification'];
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}
