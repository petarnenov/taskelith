import type { GateState, SessionState } from '../ui';
import type { InboxId } from '../store';

export type Framework = 'OpenSpec' | 'SpecKit';

export interface Task {
  id: string;
  stage: number;
  title: string;
  change: string;
  framework: Framework;
  native: string;
  gate: GateState;
  note: string;
  session: SessionState;
  harness: string;
  revision?: string;
  blockedReason?: string;
  approval?: boolean;
  awaitsOwner?: boolean;
  inboxId?: InboxId;
  pr?: string;
  conflict?: 'textual' | 'semantic';
}

export const COLUMNS = [
  { name: 'Propose', stage: 'Propose and inspect', gate: 'proposal inspected' },
  { name: 'Specify', stage: 'Specify and design', gate: 'spec approval' },
  { name: 'Implement', stage: 'Implement', gate: 'tasks done' },
  { name: 'Verify', stage: 'Verify', gate: 'make verify + CI' },
  { name: 'Review', stage: 'Review', gate: 'review · then merge' },
  { name: 'Archived', stage: 'Close', gate: 'closure record' },
];

export const MERGE_ROW = { name: 'Merge', stage: 'Accept and integrate', gate: 'auto-merge' };

export const NATIVE_STEPS: Record<Framework, (string | null)[]> = {
  OpenSpec: ['proposal.md', 'specs/ + design.md', 'tasks.md · apply', null, null, null, 'archive'],
  SpecKit: [
    null,
    'spec.md + plan.md · agent steps',
    'tasks.md · implement agent step',
    null,
    null,
    null,
    null,
  ],
};

export const TASKS: Task[] = [
  {
    id: 'forgejo',
    stage: 0,
    title: 'Forgejo SCM plugin',
    change: 'not proposed yet',
    framework: 'OpenSpec',
    native: 'not started',
    gate: 'pending',
    note: 'Awaiting inspection',
    session: 'none',
    harness: '',
  },
  {
    id: 'codex',
    stage: 1,
    title: 'Qualify Codex on Linux',
    change: 'qualify-codex-on-linux',
    framework: 'OpenSpec',
    native: 'specs/ + design.md',
    gate: 'pending',
    note: 'Spec awaits your approval',
    session: 'idle',
    harness: 'Codex · linux-02',
    awaitsOwner: true,
    inboxId: 'codex-spec',
    revision: 'proposal · sha256:51d0…a7c3',
  },
  {
    id: 'openapi',
    stage: 1,
    title: 'OpenAPI contracts for the control plane',
    change: '003-openapi-contracts',
    framework: 'SpecKit',
    native: 'speckit.clarify · agent step',
    gate: 'pending',
    note: '2 clarifications open',
    session: 'live',
    harness: 'Claude Code · linux-01',
    revision: 'spec · sha256:e48b…0d19',
    blockedReason:
      'spec.md still has 2 [NEEDS CLARIFICATION] markers. Clarification is a planning obligation, so Claude Code answers them in Specify with speckit.clarify; the plan gate cannot pass and implementation is not admitted until both are resolved.',
  },
  {
    id: 'gates',
    stage: 1,
    title: 'Gate and transition rules',
    change: 'define-gate-and-transition-rules',
    framework: 'OpenSpec',
    native: 'specs/ + design.md',
    gate: 'stale',
    note: 'New spec revision · gate re-runs',
    session: 'live',
    harness: 'Claude Code · linux-01',
    revision: 'specs · sha256:9c41…e0b2',
    blockedReason:
      'The specs changed from sha256:4b10…77aa to sha256:9c41…e0b2 after their gate passed, so the gate is stale and the unused implementation admission bound to the old digest was invalidated. The spec gate re-runs on the new revision; a new admission then binds the work item to its digest.',
  },
  {
    id: 'kernel',
    stage: 2,
    title: 'Task admission',
    change: 'define-task-admission',
    framework: 'OpenSpec',
    native: 'tasks.md · apply',
    gate: 'pending',
    note: '4 of 9 tasks',
    session: 'approval',
    harness: 'Claude Code · mac-01',
    approval: true,
    inboxId: 'kernel-approval',
    revision: 'tasks · sha256:3e7a…54f8',
  },
  {
    id: 'lint',
    stage: 2,
    title: 'Lint tooling',
    change: 'add-lint-tooling',
    framework: 'OpenSpec',
    native: 'tasks.md · apply',
    gate: 'failed',
    note: 'Typecheck failed, attempt 2 of 3',
    session: 'live',
    harness: 'Codex · linux-02',
    revision: 'tasks · sha256:7b22…c901',
    blockedReason:
      'The tasks-done gate needs a passing typecheck. Attempt 2 of 3 failed on src/lint/config.ts; Codex is on the last attempt, then it escalates to you.',
  },
  {
    id: 'evidence',
    stage: 2,
    title: 'Evidence store adapter',
    change: 'add-evidence-store',
    framework: 'OpenSpec',
    native: 'tasks.md · apply',
    gate: 'blocked',
    note: 'Worker lost contact',
    session: 'uncertain',
    harness: 'Claude Code · linux-03',
    revision: 'tasks · sha256:0fa6…3d7e',
    blockedReason:
      'linux-03 lost contact 6 min ago. The attempt is not reassigned automatically: its capacity stays reserved until Taskelith reconciles who owns it. Escalates to you after 15 min.',
  },
  {
    id: 'workflow',
    stage: 3,
    title: 'SDLC framework port',
    change: 'draft-sdlc-framework-port',
    framework: 'OpenSpec',
    native: 'platform-managed verify',
    gate: 'pending',
    note: 'make verify running',
    session: 'live',
    harness: 'Codex · linux-02',
    revision: 'tasks · sha256:c3d9…8a61',
  },
  {
    id: 'compose',
    stage: 4,
    title: 'Container Compose baseline',
    change: 'container-compose-baseline',
    framework: 'OpenSpec',
    native: 'platform-managed review',
    gate: 'pending',
    note: 'Reviewer unavailable · attempt 2 of 3',
    session: 'idle',
    harness: 'Claude Code · linux-01',
    revision: 'tasks · sha256:a1e4…62bf',
    blockedReason:
      'The review gate stays pending: no reviewer slot (Claude Code reviewer slots 2 of 2 in use). It never falls back to the implementer. Attempt 2 of 3 failed; after the last one it escalates to you.',
  },
  {
    id: 'pools',
    stage: 4,
    title: 'Account pool scheduler',
    change: 'add-account-pool-scheduler',
    framework: 'OpenSpec',
    native: 'platform-managed review',
    gate: 'passed',
    note: 'Verify and review passed · waiting for merge',
    session: 'idle',
    harness: 'Claude Code · mac-01',
    pr: 'PR #61',
    conflict: 'textual',
    revision: 'tasks · sha256:d85c…19a0',
  },
  {
    id: 'journal',
    stage: 4,
    title: 'Worker journal format',
    change: '004-worker-journal',
    framework: 'SpecKit',
    native: 'platform-managed review',
    gate: 'passed',
    note: 'Verify and review passed · waiting for merge',
    session: 'idle',
    harness: 'Codex · linux-02',
    pr: 'PR #63',
    conflict: 'semantic',
    revision: 'tasks.md · sha256:6f03…b4e2',
  },
  {
    id: 'protect',
    stage: 5,
    title: 'Shared kernel',
    change: 'add-shared-kernel',
    framework: 'OpenSpec',
    native: 'archive',
    gate: 'passed',
    note: 'Closed · merged PR #46',
    session: 'stopped',
    harness: 'Claude Code · mac-01',
    revision: 'tasks · sha256:2c7f…e815',
  },
  {
    id: 'devflow',
    stage: 5,
    title: 'SDLC workflow model',
    change: 'define-sdlc-workflow-model',
    framework: 'OpenSpec',
    native: 'archive',
    gate: 'passed',
    note: 'Closed · merged PR #51',
    session: 'stopped',
    harness: 'Claude Code · mac-01',
    revision: 'tasks · sha256:8e19…07cd',
  },
];

export interface MergeStep {
  label: string;
  detail: string;
  resolved: number;
}

export function mergeSteps(task: Task): MergeStep[] {
  if (task.conflict === 'semantic') {
    return [
      {
        label: 'Merge conflict',
        detail: 'Conflicts with dev in 1 file · handed to the harness',
        resolved: 0,
      },
      { label: 'Resolving conflicts', detail: 'Attempt 1 of 3', resolved: 0 },
      { label: 'Resolving conflicts', detail: 'Attempt 2 of 3', resolved: 0 },
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

export function conflictFiles(task: Task): string[] {
  if (task.conflict === 'semantic') return ['openspec/specs/worker-journal/spec.md'];
  return ['docs/architecture.md', 'openspec/specs/harness-account-pools/spec.md'];
}

export const BINDINGS: Record<Framework, Record<string, string>> = {
  OpenSpec: {
    plugin: 'sdlc-openspec 0.1.0',
    tool: '1.14.3',
    workflowId: 'spec-driven',
    workflowVersion: '1',
    digest: 'sha256:4f1c…9a2e',
  },
  SpecKit: {
    plugin: 'sdlc-speckit 0.1.0',
    tool: '1.2.3',
    workflowId: 'speckit',
    workflowVersion: '1.0.1',
    digest: 'sha256:b07d…31c4',
  },
};

export const SETTINGS_ROWS = [
  { label: 'Merge method', text: 'Squash is disabled for this repository.', value: 'Merge commit' },
  {
    label: 'Merge conflicts',
    text: 'The task’s harness resolves them. Verify re-runs on the new head, then the resolved diff gets an independent review.',
    value: '3 attempts',
  },
  {
    label: 'Spec conflict',
    text: 'When dev changed a contract the spec depends on, return the task to Specify and reconcile it automatically.',
    value: 'Return to Specify',
  },
  {
    label: 'Escalate to you',
    text: 'Only after the attempt budget is spent, a reconciled spec fails again, or a reviewer is still unavailable after 3 attempts. The card shows “Needs you”.',
    value: 'Last resort',
  },
  {
    label: 'Linked sources',
    text: 'Comment progress and the PR link on the Jira issue, GitHub issue or Confluence page the task came from, and resolve it on merge. Reopens and comments there become lessons.',
    value: 'On',
  },
  {
    label: 'Spec approval',
    text: 'Delegated to an independent reviewer by maintainer policy. A task can ask for a maintainer instead.',
    value: 'Reviewer',
  },
  {
    label: 'Pre-authorized actions',
    text: 'Push to the task branch: added by PP, scope task branches of this project, policy v3 r12; revoked when auto-merge is turned off. Maintainers add more with “Always allow” in Needs you; each rule records its author, scope and policy revision, and every use is audited.',
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
