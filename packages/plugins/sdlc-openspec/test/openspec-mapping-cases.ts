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

// Expected normalized outputs of an OpenSpec 1.14.3 plugin for the fixture
// working copy; provenance and rules are in ../fixtures/README.md.

export const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
export const WORKING_COPY = `${FIXTURES}working-copy`;
export const ARCHIVE_DATE = '2026-10-24';
export const OPENSPEC_VERSION = '1.14.3';

export const CAPABILITIES: SdlcFrameworkCapabilities = {
  optionalOperations: ['validateStructure', 'finalize'],
  nativeObligations: ['intake', 'specification', 'implementation', 'closure'],
};

export const SPEC_DRIVEN_WORKFLOW: ResolvedWorkflow = {
  definition: {
    id: 'openspec/spec-driven',
    version: '1',
    stages: [
      { id: 'proposal', obligations: ['intake'], origin: 'native', dependsOn: [] },
      { id: 'specs', obligations: ['specification'], origin: 'native', dependsOn: ['proposal'] },
      { id: 'design', obligations: ['specification'], origin: 'native', dependsOn: ['proposal'] },
      { id: 'tasks', obligations: ['specification'], origin: 'native', dependsOn: ['specs', 'design'] },
      { id: 'apply', obligations: ['implementation'], origin: 'native', dependsOn: ['tasks'] },
      { id: 'verify', obligations: ['verification'], origin: 'platform-managed', dependsOn: ['apply'] },
      { id: 'review', obligations: ['review'], origin: 'platform-managed', dependsOn: ['verify'] },
      { id: 'archive', obligations: ['closure'], origin: 'native', dependsOn: ['review'] },
    ],
  },
  digest: 'sha256:b6f28f305ab7f33b061949251bba82c79de66c82424cfed60582327db3f888f2',
  upstreamToolVersion: OPENSPEC_VERSION,
};

export const SPEC_DRIVEN_ARTIFACTS: readonly ArtifactRequirement[] = [
  { artifactId: 'proposal', stageId: 'proposal', requires: [], present: true },
  { artifactId: 'specs', stageId: 'specs', requires: ['proposal'], present: true },
  { artifactId: 'design', stageId: 'design', requires: ['proposal'], present: true },
  { artifactId: 'tasks', stageId: 'tasks', requires: ['specs', 'design'], present: true },
];

// The living specs that the fix and documentation deltas modify, as they were
// in the parent of each archive commit (0729388^ and 4f78d29^).
export const BASE_SPEC_DIGESTS: Readonly<Record<string, string>> = {
  'openspec/specs/integration-flow/spec.md': '320d55a2347f16c000ce3a1e4913f2ceea10075afe43fe533831f942d0cb5777',
  'openspec/specs/trust-and-operational-foundation/spec.md': '95e07b0a2db79474cd35fa20f30c39b1ee70a758bbcf6d8feed24511a37f47cb',
};

// Native stages that are not agent tasks: archiving runs through finalize.
const STAGES_WITHOUT_INSTRUCTIONS = ['verify', 'review', 'archive'];

// One artifact file of a change, by its path in the change directory.
interface ArtifactFile {
  readonly artifactId: string;
  readonly path: string;
  readonly sha256: string;
}

// The stage whose instructions a fixture prepares, with the artifacts it reads.
interface InstructionsFixture {
  readonly stageId: string;
  readonly inputs: readonly string[];
}

export interface OpenSpecMappingFixture {
  readonly kind: 'feature' | 'fix' | 'documentation';
  readonly change: string;
  readonly files: readonly ArtifactFile[];
  readonly instructions: InstructionsFixture;
}

export const MAPPING_FIXTURES: readonly OpenSpecMappingFixture[] = [
  {
    kind: 'feature',
    change: 'draft-sdlc-framework-port',
    files: [
      { artifactId: 'proposal', path: 'proposal.md', sha256: 'fe912bab7e2c2b78898a3e47b9e5cf21df775178dec6b1d4d6360c69f0f6d891' },
      { artifactId: 'specs', path: 'specs/sdlc-framework-port/spec.md', sha256: 'ed28c5d9b019f3583b037fcb67c944fe80018b9070c1e45e32fc60f257bfea4e' },
      { artifactId: 'design', path: 'design.md', sha256: '6cdd4f3273afaaca42bbeba80460105e7a7331a2839b800d273c974b42a92cae' },
      { artifactId: 'tasks', path: 'tasks.md', sha256: '4b6bdba94e2b66bc6d0a22093db32d7ba41c3363dc04d206f0aac38349479798' },
    ],
    instructions: { stageId: 'specs', inputs: ['proposal'] },
  },
  {
    kind: 'fix',
    change: 'fix-boundary-entrypoint',
    files: [
      { artifactId: 'proposal', path: 'proposal.md', sha256: '1be8a1925afb3ab1cf445881f2e528005ef9d0bc55e308b05e882315a233b169' },
      { artifactId: 'specs', path: 'specs/trust-and-operational-foundation/spec.md', sha256: 'c089ea54389df9a1e1f8548074d9128253071f2faa1eeef8947ea8bc69744a33' },
      { artifactId: 'design', path: 'design.md', sha256: '1427e5b91fc26d9a5b08310eecc969f638e5687c54516810e8204c969edb295a' },
      { artifactId: 'tasks', path: 'tasks.md', sha256: '7d6b310451b1c4e9a1da7bd4b6754d9364afdc58e136b1d9f48f503744899f3d' },
    ],
    instructions: { stageId: 'tasks', inputs: ['specs', 'design'] },
  },
  {
    kind: 'documentation',
    change: 'document-worktree-pitfalls',
    files: [
      { artifactId: 'proposal', path: 'proposal.md', sha256: '028404eb52cfa702fd07ebf525795e1aaab0e4dbb383c018850443235f529d9e' },
      { artifactId: 'specs', path: 'specs/integration-flow/spec.md', sha256: '61e12533d4147132cdebc6a753b80815d1a84540d9be92ac4ebfb0c3cd895c64' },
      { artifactId: 'design', path: 'design.md', sha256: '96d680cefaa52416c2e1ec2e18509783445e47ca42d56b8c1b92a70b2ee72441' },
      { artifactId: 'tasks', path: 'tasks.md', sha256: '7dedaa7e4b12cbdf74824d0e92877398973739cd7466ede04e96253aa26a469a' },
    ],
    instructions: { stageId: 'proposal', inputs: [] },
  },
];

export function workItemOf(fixture: OpenSpecMappingFixture): WorkItemInput {
  return { id: `openspec:${fixture.change}`, nativeReference: fixture.change };
}

export function revisionsOf(fixture: OpenSpecMappingFixture, changeDirectory = `openspec/changes/${fixture.change}`): ArtifactRevisionInput[] {
  return fixture.files.map((file) => ({
    artifactId: file.artifactId,
    digest: `sha256:${file.sha256}`,
    nativeReference: `${changeDirectory}/${file.path}`,
  }));
}

// The pinned CLI's `instruction` field for the stage (for `apply`, with every
// task done), kept verbatim in fixtures/expected/.
export function expectedInstructionText(stageId: string): string {
  return readFileSync(`${FIXTURES}expected/instructions/${stageId}.md`, 'utf8');
}

export function mappingCases(workingCopy: string): SdlcConformanceCase[] {
  const context = { workingCopy };
  const workItems = MAPPING_FIXTURES.map(workItemOf).sort((left, right) => (left.nativeReference < right.nativeReference ? -1 : 1));
  return [
    { name: 'discover the three changes', operation: 'discoverWorkItems', request: context, expected: { ok: true, value: workItems } },
    { name: 'resolve the workflow of a new change', operation: 'resolveWorkflow', request: context, expected: { ok: true, value: SPEC_DRIVEN_WORKFLOW } },
    ...MAPPING_FIXTURES.flatMap((fixture) => workItemCases(workingCopy, fixture)),
    ...unknownWorkItemCases(workingCopy),
  ];
}

function workItemCases(workingCopy: string, fixture: OpenSpecMappingFixture): SdlcConformanceCase[] {
  const request = { workingCopy, workItem: fixture.change };
  const revisions = revisionsOf(fixture);
  const { stageId, inputs } = fixture.instructions;
  return [
    { name: `${fixture.kind}: resolve its workflow`, operation: 'resolveWorkflow', request, expected: { ok: true, value: SPEC_DRIVEN_WORKFLOW } },
    { name: `${fixture.kind}: describe its artifacts`, operation: 'describeArtifacts', request, expected: { ok: true, value: SPEC_DRIVEN_ARTIFACTS } },
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
          outputs: [stageId],
        },
      },
    },
    {
      name: `${fixture.kind}: prepare the apply stage`,
      operation: 'prepareStageInstructions',
      request: { ...request, stageId: 'apply' },
      expected: { ok: true, value: { stageId: 'apply', instructions: expectedInstructionText('apply'), inputs: revisions, outputs: [] } },
    },
    ...STAGES_WITHOUT_INSTRUCTIONS.map((stage): SdlcConformanceCase => ({
      name: `${fixture.kind}: the ${stage} stage has no agent instructions`,
      operation: 'prepareStageInstructions',
      request: { ...request, stageId: stage },
      expected: { ok: false, code: 'invalid' },
    })),
    {
      name: `${fixture.kind}: validate its structure`,
      operation: 'validateStructure',
      request: { ...request, subject: revisions },
      expected: {
        ok: true,
        value: { validator: 'openspec-validate-strict', verdict: 'valid', reference: `openspec@${OPENSPEC_VERSION} validate ${fixture.change} --strict`, problems: [] },
      },
    },
    {
      name: `${fixture.kind}: archive it`,
      operation: 'finalize',
      request,
      expected: {
        ok: true,
        value: {
          reference: `openspec@${OPENSPEC_VERSION} archive ${fixture.change} --yes`,
          revisions: revisionsOf(fixture, `openspec/changes/archive/${ARCHIVE_DATE}-${fixture.change}`),
        },
      },
    },
  ];
}

function unknownWorkItemCases(workingCopy: string): SdlcConformanceCase[] {
  const request = { workingCopy, workItem: 'no-such-change' };
  return [
    { name: 'unknown change: describe its artifacts', operation: 'describeArtifacts', request, expected: { ok: false, code: 'not-found' } },
    { name: 'unknown change: inspect its revisions', operation: 'inspectArtifactRevisions', request, expected: { ok: false, code: 'not-found' } },
    {
      name: 'unknown stage: prepare its instructions',
      operation: 'prepareStageInstructions',
      request: { workingCopy, workItem: MAPPING_FIXTURES[0]!.change, stageId: 'no-such-stage' },
      expected: { ok: false, code: 'not-found' },
    },
  ];
}
