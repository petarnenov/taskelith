import type { ExecutionView, GateState } from '../ui';
import type { InboxId } from '../store';

export type Framework = 'OpenSpec' | 'SpecKit';
export type Obligation =
  | 'intake'
  | 'specification'
  | 'implementation'
  | 'verification'
  | 'review'
  | 'closure';
export type EvidenceKind = 'structural-validation' | 'semantic-approval' | 'platform-record';
export type StageOrigin = 'native' | 'platform-managed';

export interface GateDef {
  id: string;
  requiredEvidence: EvidenceKind;
  label: string;
}

export interface StageDef {
  id: string;
  obligations: Obligation[];
  origin: StageOrigin;
  column: number;
  native?: string;
  gates: GateDef[];
}

export interface WorkflowDef {
  id: string;
  version: string;
  stages: StageDef[];
}

export const COLUMNS = [
  { name: 'Propose', obligation: 'intake' },
  { name: 'Specify', obligation: 'specification' },
  { name: 'Implement', obligation: 'implementation' },
  { name: 'Verify', obligation: 'verification' },
  { name: 'Review', obligation: 'review' },
  { name: 'Archived', obligation: 'closure' },
] as const;

const validate = (stage: string): GateDef => ({
  id: stage + '-validate',
  requiredEvidence: 'structural-validation',
  label: 'openspec-validate-strict',
});
const approve = (stage: string, label = 'semantic approval'): GateDef => ({
  id: stage + '-approval',
  requiredEvidence: 'semantic-approval',
  label,
});
const record = (stage: string, label: string): GateDef => ({
  id: stage + '-record',
  requiredEvidence: 'platform-record',
  label,
});

const VERIFY_STAGE: StageDef = {
  id: 'verify',
  obligations: ['verification'],
  origin: 'platform-managed',
  column: 3,
  gates: [record('verify', 'make verify and CI on the task head')],
};
const REVIEW_STAGE: StageDef = {
  id: 'review',
  obligations: ['review'],
  origin: 'platform-managed',
  column: 4,
  gates: [approve('review', 'independent review')],
};

// Stage graphs of the OpenSpec plugin and the SpecKit mapping fixture; the
// column is the UI's placement by each stage's obligations.
export const WORKFLOWS: Record<Framework, WorkflowDef> = {
  OpenSpec: {
    id: 'openspec/spec-driven',
    version: '1',
    stages: [
      {
        id: 'proposal',
        obligations: ['intake'],
        origin: 'native',
        column: 0,
        native: 'proposal.md',
        gates: [validate('proposal'), approve('proposal', 'proposal inspected')],
      },
      {
        id: 'specs',
        obligations: ['specification'],
        origin: 'native',
        column: 1,
        native: 'specs/',
        gates: [validate('specs'), approve('specs', 'spec approval')],
      },
      {
        id: 'design',
        obligations: ['specification'],
        origin: 'native',
        column: 1,
        native: 'design.md',
        gates: [validate('design')],
      },
      {
        id: 'tasks',
        obligations: ['specification'],
        origin: 'native',
        column: 1,
        native: 'tasks.md',
        gates: [validate('tasks')],
      },
      {
        id: 'apply',
        obligations: ['implementation'],
        origin: 'native',
        column: 2,
        native: 'apply (runs tasks.md)',
        gates: [record('apply', 'all tasks checked')],
      },
      VERIFY_STAGE,
      REVIEW_STAGE,
      {
        id: 'archive',
        obligations: ['closure'],
        origin: 'native',
        column: 5,
        native: 'archive',
        gates: [record('archive', 'closure record')],
      },
    ],
  },
  SpecKit: {
    id: 'speckit/speckit',
    version: '1.0.1',
    stages: [
      {
        id: 'specify',
        obligations: ['intake', 'specification'],
        origin: 'native',
        column: 0,
        native: 'specify (clarify loop inside)',
        gates: [record('specify', 'spec.md written')],
      },
      {
        id: 'review-spec',
        obligations: ['review'],
        origin: 'platform-managed',
        column: 1,
        gates: [approve('review-spec', 'spec review')],
      },
      {
        id: 'plan',
        obligations: ['specification'],
        origin: 'native',
        column: 1,
        native: 'plan',
        gates: [record('plan', 'plan.md written')],
      },
      {
        id: 'review-plan',
        obligations: ['review'],
        origin: 'platform-managed',
        column: 1,
        gates: [approve('review-plan', 'plan review')],
      },
      {
        id: 'tasks',
        obligations: ['specification'],
        origin: 'native',
        column: 1,
        native: 'tasks',
        gates: [record('tasks', 'tasks.md written')],
      },
      {
        id: 'implement',
        obligations: ['implementation'],
        origin: 'native',
        column: 2,
        native: 'implement',
        gates: [record('implement', 'all tasks checked')],
      },
      VERIFY_STAGE,
      REVIEW_STAGE,
      {
        id: 'close',
        obligations: ['closure'],
        origin: 'platform-managed',
        column: 5,
        gates: [record('close', 'closure record')],
      },
    ],
  },
};

export interface GateView {
  state: GateState;
  generation: number;
  verdict?: string;
  blockReason?: string;
}

export interface ArtifactRevisionView {
  artifactId: string;
  digest: string;
  nativeReference: string;
}

export type AdmissionState = 'admitted' | 'used' | 'invalidated';

// One card is one workflow run bound to one native work item.
export interface Run {
  runId: string;
  title: string;
  framework: Framework;
  workItem: string;
  nativeReference: string;
  at: string;
  gates?: Record<string, Partial<GateView>>;
  admission?: { state: AdmissionState; invalidatedBy?: string };
  revision?: ArtifactRevisionView;
  note: string;
  session: ExecutionView;
  harness: string;
  whyNotMoving?: string;
  inboxId?: InboxId;
  pr?: string;
  conflict?: 'textual' | 'semantic';
  laterGate?: string;
}

const rev = (artifactId: string, digest: string, nativeReference: string): ArtifactRevisionView => ({
  artifactId,
  digest,
  nativeReference,
});

export const RUNS: Run[] = [
  {
    runId: 'run-forgejo',
    title: 'Forgejo SCM plugin',
    framework: 'OpenSpec',
    workItem: 'openspec:add-forgejo-scm-plugin',
    nativeReference: 'add-forgejo-scm-plugin',
    at: 'proposal',
    gates: { 'proposal-validate': { state: 'pending' }, 'proposal-approval': { state: 'pending' } },
    admission: { state: 'admitted' },
    note: 'Planning task admitted · proposal being written',
    session: {
      phase: 'awaiting-launch',
      waitingReason: 'project-quota-exhausted',
      reachability: 'reachable',
    },
    harness: '',
  },
  {
    runId: 'run-codex-linux',
    title: 'Qualify Codex on Linux',
    framework: 'OpenSpec',
    workItem: 'openspec:qualify-codex-on-linux',
    nativeReference: 'qualify-codex-on-linux',
    at: 'specs',
    gates: {
      'specs-validate': { state: 'passed', verdict: 'valid' },
      'specs-approval': { state: 'pending', generation: 4 },
    },
    admission: { state: 'used' },
    revision: rev('specs', 'sha256:51d0…a7c3', 'openspec/changes/qualify-codex-on-linux/specs'),
    note: 'Spec approval waits for you',
    session: { phase: 'ended', outcome: 'exited-0', reachability: 'reachable' },
    harness: 'Codex · linux-02',
    inboxId: 'codex-spec',
  },
  {
    runId: 'run-openapi',
    title: 'OpenAPI contracts for the control plane',
    framework: 'SpecKit',
    workItem: 'speckit:003-openapi-contracts',
    nativeReference: '003-openapi-contracts',
    at: 'specify',
    gates: { 'specify-record': { state: 'pending' } },
    admission: { state: 'used' },
    revision: rev('spec', 'sha256:e48b…0d19', 'specs/003-openapi-contracts/spec.md'),
    note: '2 clarifications open',
    session: { phase: 'running', reachability: 'reachable', turn: 'working' },
    harness: 'Claude Code · linux-01',
    whyNotMoving:
      'spec.md still has 2 [NEEDS CLARIFICATION] markers, so Claude Code keeps clarifying inside specify; the review-spec gate cannot pass until both are resolved. Marker detection comes with the SpecKit adapter in G4.',
    laterGate: 'SpecKit adapter · G4',
  },
  {
    runId: 'run-gates',
    title: 'Gate and transition rules',
    framework: 'OpenSpec',
    workItem: 'openspec:define-gate-and-transition-rules',
    nativeReference: 'define-gate-and-transition-rules',
    at: 'specs',
    gates: {
      'specs-validate': { state: 'pending', generation: 3 },
      'specs-approval': { state: 'stale', generation: 2, verdict: 'approved (superseded)' },
    },
    admission: { state: 'invalidated', invalidatedBy: 'specs sha256:4b10…77aa → sha256:9c41…e0b2' },
    revision: rev('specs', 'sha256:9c41…e0b2', 'openspec/changes/define-gate-and-transition-rules/specs'),
    note: 'New spec revision · gates reopen',
    session: { phase: 'running', reachability: 'reachable', turn: 'working' },
    harness: 'Claude Code · linux-01',
    whyNotMoving:
      'The specs changed after their approval, so the approval is stale and keeps its superseded decision until the gate reopens; the unused planning admission bound to the old digest was invalidated. Validation and approval run again on the new revision.',
  },
  {
    runId: 'run-admission',
    title: 'Task admission',
    framework: 'OpenSpec',
    workItem: 'openspec:define-task-admission',
    nativeReference: 'define-task-admission',
    at: 'apply',
    gates: { 'apply-record': { state: 'pending' } },
    admission: { state: 'used' },
    revision: rev('tasks', 'sha256:3e7a…54f8', 'openspec/changes/define-task-admission/tasks.md'),
    note: '4 of 9 tasks',
    session: {
      phase: 'running',
      reachability: 'reachable',
      turn: 'awaiting-approval',
      attempt: 2,
      ownershipGeneration: 3,
    },
    harness: 'Claude Code · mac-01',
    inboxId: 'kernel-approval',
  },
  {
    runId: 'run-lint',
    title: 'Lint tooling',
    framework: 'OpenSpec',
    workItem: 'openspec:add-lint-tooling',
    nativeReference: 'add-lint-tooling',
    at: 'apply',
    gates: { 'apply-record': { state: 'pending' } },
    admission: { state: 'used' },
    revision: rev('tasks', 'sha256:7b22…c901', 'openspec/changes/add-lint-tooling/tasks.md'),
    note: 'Typecheck failed · fix round 2 of 3',
    session: { phase: 'running', reachability: 'reachable', turn: 'working' },
    harness: 'Codex · linux-02',
    whyNotMoving:
      'The tasks are not all checked: the typecheck fails on src/lint/config.ts. Codex is on fix round 2 of 3; after the last round the task needs you.',
  },
  {
    runId: 'run-evidence',
    title: 'Evidence store adapter',
    framework: 'OpenSpec',
    workItem: 'openspec:add-evidence-store',
    nativeReference: 'add-evidence-store',
    at: 'apply',
    gates: { 'apply-record': { state: 'pending' } },
    admission: { state: 'used' },
    revision: rev('tasks', 'sha256:0fa6…3d7e', 'openspec/changes/add-evidence-store/tasks.md'),
    note: 'Worker unreachable',
    session: {
      phase: 'running',
      reachability: 'unknown',
      lastContact: '6 min ago',
      evidence: 'uncertain',
      attempt: 1,
      ownershipGeneration: 4,
    },
    harness: 'Claude Code · linux-03',
    whyNotMoving:
      'linux-03 is unreachable and reported that it can prove neither that the process runs nor that it ended. The attempt stays with linux-03 at ownership generation 4 and keeps its capacity until a terminal fact arrives or an operator reconciles it. The gate stays pending.',
  },
  {
    runId: 'run-sdlc-port',
    title: 'SDLC framework port',
    framework: 'OpenSpec',
    workItem: 'openspec:draft-sdlc-framework-port',
    nativeReference: 'draft-sdlc-framework-port',
    at: 'verify',
    gates: { 'verify-record': { state: 'pending' } },
    note: 'Platform verify running: make verify and CI on the task head',
    session: { phase: 'ended', outcome: 'exited-0', reachability: 'reachable' },
    harness: 'Codex · linux-02',
  },
  {
    runId: 'run-compose',
    title: 'Container Compose baseline',
    framework: 'OpenSpec',
    workItem: 'openspec:container-compose-baseline',
    nativeReference: 'container-compose-baseline',
    at: 'review',
    gates: { 'review-approval': { state: 'pending' } },
    note: 'No reviewer slot · try 2 of 3',
    session: { phase: 'ended', outcome: 'exited-0', reachability: 'reachable' },
    harness: 'Claude Code · linux-01',
    whyNotMoving:
      'The review gate stays pending: no reviewer slot is free. It never falls back to the implementer. Try 2 of 3 to get a reviewer failed; after the last one the task needs you.',
  },
  {
    runId: 'run-pools',
    title: 'Account pool scheduler',
    framework: 'OpenSpec',
    workItem: 'openspec:add-account-pool-scheduler',
    nativeReference: 'add-account-pool-scheduler',
    at: 'review',
    gates: { 'review-approval': { state: 'passed', verdict: 'approved' } },
    note: 'Verify and review passed · waiting for merge',
    session: { phase: 'ended', outcome: 'exited-0', reachability: 'reachable' },
    harness: 'Claude Code · mac-01',
    pr: 'PR #61',
    conflict: 'textual',
  },
  {
    runId: 'run-journal',
    title: 'Worker journal format',
    framework: 'SpecKit',
    workItem: 'speckit:004-worker-journal',
    nativeReference: '004-worker-journal',
    at: 'review',
    gates: { 'review-approval': { state: 'passed', verdict: 'approved' } },
    note: 'Verify and review passed · waiting for merge',
    session: { phase: 'ended', outcome: 'exited-0', reachability: 'reachable' },
    harness: 'Codex · linux-02',
    pr: 'PR #63',
    conflict: 'semantic',
    laterGate: 'SpecKit adapter · G4',
  },
  {
    runId: 'run-kernel',
    title: 'Shared kernel',
    framework: 'OpenSpec',
    workItem: 'openspec:add-shared-kernel',
    nativeReference: 'add-shared-kernel',
    at: 'archive',
    gates: { 'archive-record': { state: 'passed', verdict: 'satisfied' } },
    note: 'Closed · merged PR #46',
    session: { phase: 'ended', outcome: 'exited-0', reachability: 'reachable' },
    harness: 'Claude Code · mac-01',
  },
  {
    runId: 'run-workflow-model',
    title: 'SDLC workflow model',
    framework: 'OpenSpec',
    workItem: 'openspec:define-sdlc-workflow-model',
    nativeReference: 'define-sdlc-workflow-model',
    at: 'archive',
    gates: { 'archive-record': { state: 'passed', verdict: 'satisfied' } },
    note: 'Closed · merged PR #51',
    session: { phase: 'ended', outcome: 'exited-0', reachability: 'reachable' },
    harness: 'Claude Code · mac-01',
  },
];

export interface MergeStep {
  label: string;
  detail: string;
  resolved: number;
}

export function mergeSteps(run: Run): MergeStep[] {
  if (run.conflict === 'semantic') {
    return [
      {
        label: 'Merge conflict',
        detail: 'Conflicts with dev in 1 file · handed to the harness',
        resolved: 0,
      },
      { label: 'Resolving conflicts', detail: 'Round 1 of 3', resolved: 0 },
      { label: 'Resolving conflicts', detail: 'Round 2 of 3', resolved: 0 },
      {
        label: 'Spec conflict',
        detail: 'dev changed the contract this spec depends on · returning to Specify',
        resolved: 0,
      },
    ];
  }
  return [
    { label: 'Merge conflict', detail: 'Conflicts with dev in 2 files · handed to the harness', resolved: 0 },
    { label: 'Resolving conflicts', detail: '0 of 2 files resolved', resolved: 0 },
    { label: 'Resolving conflicts', detail: '1 of 2 files resolved', resolved: 1 },
    { label: 'Re-running verify', detail: 'New head a41c9e2 · make verify + CI', resolved: 2 },
    {
      label: 'Reviewing resolution',
      detail: 'Claude Code (Fable 5.1) reviews the resolved diff · pass 1 of 3',
      resolved: 2,
    },
  ];
}

export function conflictFiles(run: Run): string[] {
  if (run.conflict === 'semantic') return ['specs/004-worker-journal/spec.md'];
  return ['docs/architecture.md', 'openspec/specs/harness-account-pools/spec.md'];
}

export const BINDINGS: Record<Framework, { plugin: string; tool: string; digest: string }> = {
  OpenSpec: { plugin: 'sdlc-openspec 0.0.0', tool: '1.14.3', digest: 'sha256:b6f2…88f2' },
  SpecKit: { plugin: 'sdlc-speckit (fixture only, adapter in G4)', tool: '1.2.3', digest: 'sha256:1777…fbc' },
};

export const SETTINGS_ROWS = [
  { label: 'Merge method', text: 'Squash is disabled for this repository.', value: 'Merge commit' },
  {
    label: 'Merge conflicts',
    text: 'The task’s harness resolves them. Verify re-runs on the new head, then the resolved diff gets an independent review.',
    value: '3 rounds',
  },
  {
    label: 'Spec conflict',
    text: 'When dev changed a contract the spec depends on, return the task to Specify and reconcile it automatically.',
    value: 'Return to Specify',
  },
  {
    label: 'Escalate to you',
    text: 'Only after the round budget is spent, a reconciled spec fails again, or a reviewer is still unavailable after 3 tries. The card shows “Needs you”.',
    value: 'Last resort',
  },
  {
    label: 'Linked sources',
    text: 'Comment progress and the PR link on the GitHub issue the task came from, and resolve it on merge.',
    value: 'On',
  },
  {
    label: 'Spec approval',
    text: 'Delegated to an independent reviewer by maintainer policy (G3 item 22). A task can ask for a maintainer instead.',
    value: 'Reviewer',
  },
  {
    label: 'Standing rules',
    text: 'Push to the task branch: added by PP, scope task branches of this project; revoked when auto-merge is turned off. Only project-maintainers add rules; every use is audited. How a rule relates to a run’s policy revision is decided in G3 items 8 and 23.',
    value: '1 rule',
  },
  {
    label: 'Release and deploy',
    text: 'Release follows the release policy (automatic from main); deployment needs separate owner authorization. Auto-merge never releases or deploys.',
    value: 'Release policy',
  },
  {
    label: 'After merge',
    text: 'Archive the change and stop its agent session. Always on.',
    value: 'Always',
  },
];
