import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  ArtifactRequirement,
  ArtifactRevisionInput,
  ResolvedWorkflow,
  SdlcConformanceCase,
  SdlcFrameworkCapabilities,
  WorkItemInput,
} from '@taskelith/sdlc';

// Expected normalized outputs of a SpecKit 1.2.3 plugin for the fixture
// working copy; provenance and rules are in ../fixtures/README.md.

export const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
export const WORKING_COPY = `${FIXTURES}working-copy`;
export const SPECKIT_VERSION = '1.2.3';

// No structural validator, no closure, and gates not decidable headlessly:
// the platform supplies review, verification, and closure.
export const CAPABILITIES: SdlcFrameworkCapabilities = {
  optionalOperations: [],
  nativeObligations: ['intake', 'specification', 'implementation'],
};

export const SPECKIT_WORKFLOW: ResolvedWorkflow = {
  definition: {
    id: 'speckit/speckit',
    version: '1.0.1',
    stages: [
      { id: 'specify', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
      { id: 'review-spec', obligations: ['review'], origin: 'platform-managed', dependsOn: ['specify'] },
      { id: 'plan', obligations: ['specification'], origin: 'native', dependsOn: ['review-spec'] },
      { id: 'review-plan', obligations: ['review'], origin: 'platform-managed', dependsOn: ['plan'] },
      { id: 'tasks', obligations: ['specification'], origin: 'native', dependsOn: ['review-plan'] },
      { id: 'implement', obligations: ['implementation'], origin: 'native', dependsOn: ['tasks'] },
      { id: 'verify', obligations: ['verification'], origin: 'platform-managed', dependsOn: ['implement'] },
      { id: 'review', obligations: ['review'], origin: 'platform-managed', dependsOn: ['verify'] },
      { id: 'close', obligations: ['closure'], origin: 'platform-managed', dependsOn: ['review'] },
    ],
  },
  digest: 'sha256:177761c5e7df28126beea043b5cb45aeaf7958090c022dc11ac71399422fcfbc',
  upstreamToolVersion: SPECKIT_VERSION,
};

export const FEATURE_ARTIFACTS: readonly ArtifactRequirement[] = [
  { artifactId: 'spec', stageId: 'specify', requires: [], present: true },
  { artifactId: 'plan', stageId: 'plan', requires: ['spec'], present: true },
  { artifactId: 'tasks', stageId: 'tasks', requires: ['spec', 'plan'], present: true },
];

// The agent command whose prompt is each native stage's instruction text.
const STAGE_COMMANDS: Readonly<Record<string, string>> = {
  specify: 'speckit.specify.md',
  plan: 'speckit.plan.md',
  tasks: 'speckit.tasks.md',
  implement: 'speckit.implement.md',
};

// The artifact file of a feature, by its name in the feature directory.
interface ArtifactFile {
  readonly artifactId: string;
  readonly path: string;
  readonly sha256: string;
}

interface InstructionsFixture {
  readonly stageId: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
}

export interface SpecKitMappingFixture {
  readonly kind: 'feature' | 'fix' | 'documentation';
  readonly feature: string;
  readonly sourceChange: string;
  readonly files: readonly ArtifactFile[];
  readonly instructions: InstructionsFixture;
}

export const MAPPING_FIXTURES: readonly SpecKitMappingFixture[] = [
  {
    kind: 'feature',
    feature: '001-sdlc-framework-port',
    sourceChange: 'draft-sdlc-framework-port',
    files: [
      { artifactId: 'spec', path: 'spec.md', sha256: 'b4e8810d52183567695db762785dab0e8dc385d989be0545de4e5a9415100038' },
      { artifactId: 'plan', path: 'plan.md', sha256: 'ce952e282265b38ad857092f577a750c251ff7412b4176dae4a2cd25f8720b63' },
      { artifactId: 'tasks', path: 'tasks.md', sha256: 'e06c4a348760d3df08c5de442695689bff4e112517c7c35e49b59d9797de2eef' },
    ],
    instructions: { stageId: 'plan', inputs: ['spec'], outputs: ['plan'] },
  },
  {
    kind: 'fix',
    feature: '002-boundary-entrypoint-fix',
    sourceChange: 'fix-boundary-entrypoint',
    files: [
      { artifactId: 'spec', path: 'spec.md', sha256: 'c1cb5b3553ac5c0dccab4c707b58ad20d978e767b49e277ecc345d7ca1665252' },
      { artifactId: 'plan', path: 'plan.md', sha256: 'a161963402c3202c4d980b521039b96a44ee6969ffc747480c487f78c5f8dd78' },
      { artifactId: 'tasks', path: 'tasks.md', sha256: 'b87dd1935916d4c8786bb8dab3cd4d9588a31dc826a991628e3ca3050f1a737f' },
    ],
    instructions: { stageId: 'tasks', inputs: ['spec', 'plan'], outputs: ['tasks'] },
  },
  {
    kind: 'documentation',
    feature: '003-worktree-pitfalls-docs',
    sourceChange: 'document-worktree-pitfalls',
    files: [
      { artifactId: 'spec', path: 'spec.md', sha256: '0157621a3c0f99670887831fb35a07458d99886540cf21ae6b91515475649ae9' },
      { artifactId: 'plan', path: 'plan.md', sha256: '53b9f939f75bcce4895b57027eda3e281a4ed80bbddff4e4d3d801e28b760c48' },
      { artifactId: 'tasks', path: 'tasks.md', sha256: '02ca1f17b58c563fc1f33d96ec08111c96848a0108fcc96cb32532905bde2f1c' },
    ],
    instructions: { stageId: 'specify', inputs: [], outputs: ['spec'] },
  },
];

export function workItemOf(fixture: SpecKitMappingFixture): WorkItemInput {
  return { id: `speckit:${fixture.feature}`, nativeReference: fixture.feature };
}

export function revisionsOf(fixture: SpecKitMappingFixture): ArtifactRevisionInput[] {
  return fixture.files.map((file) => ({
    artifactId: file.artifactId,
    digest: `sha256:${file.sha256}`,
    nativeReference: `specs/${fixture.feature}/${file.path}`,
  }));
}

// A native stage's instruction text is its agent command prompt, verbatim
// as the pinned scaffold installs it.
export function expectedInstructionText(stageId: string): string {
  return readFileSync(`${WORKING_COPY}/.agent/commands/${STAGE_COMMANDS[stageId]}`, 'utf8');
}

export function mappingCases(workingCopy: string): SdlcConformanceCase[] {
  const context = { workingCopy };
  return [
    { name: 'discover the three features', operation: 'discoverWorkItems', request: context, expected: { ok: true, value: MAPPING_FIXTURES.map(workItemOf) } },
    { name: 'resolve the workflow of a new feature', operation: 'resolveWorkflow', request: context, expected: { ok: true, value: SPECKIT_WORKFLOW } },
    ...MAPPING_FIXTURES.flatMap((fixture) => workItemCases(workingCopy, fixture)),
    ...unknownWorkItemCases(workingCopy),
  ];
}

function workItemCases(workingCopy: string, fixture: SpecKitMappingFixture): SdlcConformanceCase[] {
  const request = { workingCopy, workItem: fixture.feature };
  const revisions = revisionsOf(fixture);
  const { stageId, inputs, outputs } = fixture.instructions;
  return [
    { name: `${fixture.kind}: resolve its workflow`, operation: 'resolveWorkflow', request, expected: { ok: true, value: SPECKIT_WORKFLOW } },
    { name: `${fixture.kind}: describe its artifacts`, operation: 'describeArtifacts', request, expected: { ok: true, value: FEATURE_ARTIFACTS } },
    { name: `${fixture.kind}: inspect its revisions`, operation: 'inspectArtifactRevisions', request, expected: { ok: true, value: revisions } },
    {
      name: `${fixture.kind}: prepare the ${stageId} stage`,
      operation: 'prepareStageInstructions',
      request: { ...request, stageId },
      expected: {
        ok: true,
        value: {
          stageId,
          instructions: expectedInstructionText(stageId),
          inputs: revisions.filter((revision) => inputs.includes(revision.artifactId)),
          outputs,
        },
      },
    },
    {
      name: `${fixture.kind}: prepare the implement stage`,
      operation: 'prepareStageInstructions',
      request: { ...request, stageId: 'implement' },
      expected: { ok: true, value: { stageId: 'implement', instructions: expectedInstructionText('implement'), inputs: revisions, outputs: [] } },
    },
    {
      name: `${fixture.kind}: platform-managed gate has no native instructions`,
      operation: 'prepareStageInstructions',
      request: { ...request, stageId: 'review-spec' },
      expected: { ok: false, code: 'invalid' },
    },
    {
      name: `${fixture.kind}: no native structural validator`,
      operation: 'validateStructure',
      request: { ...request, subject: revisions },
      expected: { ok: false, code: 'unavailable' },
    },
    { name: `${fixture.kind}: no native closure`, operation: 'finalize', request, expected: { ok: false, code: 'unavailable' } },
  ];
}

function unknownWorkItemCases(workingCopy: string): SdlcConformanceCase[] {
  const request = { workingCopy, workItem: '999-no-such-feature' };
  return [
    { name: 'unknown feature: describe its artifacts', operation: 'describeArtifacts', request, expected: { ok: false, code: 'not-found' } },
    { name: 'unknown feature: inspect its revisions', operation: 'inspectArtifactRevisions', request, expected: { ok: false, code: 'not-found' } },
    {
      name: 'unknown stage: prepare its instructions',
      operation: 'prepareStageInstructions',
      request: { workingCopy, workItem: MAPPING_FIXTURES[0]!.feature, stageId: 'no-such-stage' },
      expected: { ok: false, code: 'not-found' },
    },
  ];
}
