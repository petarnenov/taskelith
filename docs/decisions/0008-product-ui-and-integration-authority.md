# ADR 0008: Product UI, auto-merge authority, and selectable SDLC framework

Date: 2026-10-24
Status: Decided by the owner on 2026-10-24 in the project conversation, while reviewing a clickable UI proof of concept screen by screen. Recorded; no UI, merge automation, intake, or framework-selection code exists yet. Each decision is implemented in the delivery gate named below. On 2026-10-25 [ADR 0011](0011-mantine-ui-proof-of-concept.md) replaced the proof of concept with a Mantine build and stored its source in the repository.

## Context

The owner reviewed a UI proof of concept: a private design canvas outside this repository with ten screens (project board, agent session, reviews, workers and account pools, new task, knowledge, "Needs you" inbox, SCM integrations, plugins, and board states). The review produced product decisions that the architecture did not yet record, and some of them conflict with earlier rules:

- [Governance](../governance.md#authority) gives merging and pushing to the owner or an explicitly authorized integrator, and finishing local work does not authorize integration.
- [ADR 0003](0003-first-integrations-and-plugin-kernel.md) decision 11 does not accept running a harness only under pre-set policy.
- [Architecture section 7](../architecture.md#durable-chat-turns-and-provider-approvals) forbids generating a default approval.
- [ADR 0004](0004-first-class-engineering-principles.md) principle 8 makes OpenSpec mandatory for developing Taskelith, without a choice of framework.

The owner resolved the merge conflicts with "ауто мърдж побеждава всичко" ("auto-merge wins over everything") and asked that Taskelith's own project can select its SDLC framework too, with OpenSpec as the default.

## Decisions

1. **Selectable SDLC framework, OpenSpec by default.** Every project selects its spec-driven framework, Taskelith's own development included. OpenSpec is the default. This amends ADR 0004 principle 8:
   - Every task that develops Taskelith is still bound to a change of the selected framework, without exception.
   - Selection follows the precedence and migration rules of [architecture section 6](../architecture.md#first-class-sdlc-with-replaceable-frameworks): a new default applies to new work only, and running work keeps its binding.
   - This repository keeps using OpenSpec until a project-maintainer selects another framework and that framework's pinned tooling has been admitted through the [dependency policy](../dependencies.md).
2. **Auto-merge is the integration authority.**
   - Each project has an auto-merge setting, on by default, that only a project-maintainer changes.
   - While it is on, a change whose gates have all passed (verify, independent review, and required approvals) is merged into the project's work branch with the project's merge method, without a further human step.
   - The setting is the explicit integration authorization that governance requires.
   - Merges into one target branch run one at a time.
   - Auto-merge never releases or deploys. Release follows the [release policy](../releases.md), and deployment still needs separate owner authorization.
   - Where an earlier rule conflicts with auto-merge, auto-merge wins:
     - Governance: an enabled auto-merge setting is the explicitly delegated integrator.
     - ADR 0003 decision 11: harness plugins must still answer native approval requests from an external client. A project-maintainer may record standing rules that Taskelith answers through that client. While auto-merge is on, pushing to the task's own branch is such a rule. Each rule records its author, scope, and policy revision, and every use is audited. Turning auto-merge off revokes the push rule.
     - Architecture section 7: a maintainer's standing rule is an explicit approval policy, not a default approval. Without a rule, a request still waits for a person.
3. **Merge conflicts are resolved without a person.** When auto-merge meets a conflict, the flow is:
   1. The task's own harness resolves the conflict in the task's worktree.
   2. Verify runs again on the new head.
   3. The task's independent reviewer reviews the resolved diff.
   4. The change merges.
   - **Attempt budget.** The conflict-resolution flow has a budget of three attempts.
   - **Spec conflict.** When the target branch changed a contract that the task's specification depends on, the task returns to Specify. The harness reconciles the specification, and the later gates run again.
   - **Escalation.** A maintainer is asked only when the attempt budget is spent, a reconciled specification fails again, or no reviewer is available after three attempts.
   - **Reviewer.** Review never falls back to the implementer.
4. **The project board is the landing page.**
   - **Board.** Its columns are the platform lifecycle stages of [governance](../governance.md#lifecycle-and-records) under short labels: Propose (Propose and inspect), Specify (Specify and design), Implement, Verify, Review, and Archived (Close).
     - Accept and integrate is the merge gate between Review and Archived.
     - Each card shows its framework's native step, or "platform-managed" where the [framework mapping](../sdlc-framework-mapping.md) records a gap.
     - Merging closes and archives the change and stops its agent session.
   - **Task detail.** It shows the gate states (pending, passed, failed, stale, blocked), traceability, the run binding, and the admission. *Editorial note, 2026-10-27 (owner-confirmed; terms of the [product ports contract](../contracts/product-ports.md#33-card) section 3.3):* a board card is one root workflow run, keyed by `runId`. Each of its tasks is a G2 task, admitted to one stage (`stageId`) and optionally one work item (`workItem`) of that run; the "admission" that the task detail shows is the run's list of those task admissions. No decision of this ADR changes.
   - **Screens.** Agent session (with a composer that stays visible), reviews, workers and account pools, new task, knowledge, a "Needs you" inbox that every screen updates, SCM integrations, and plugins.
   - **Board states.**
     - The board defines first run, empty, loading, load error, live updates lost, no workers online, and read-only states. On first run it guides the user through setup instead of showing an empty board.
     - A load error shows no data rather than data that may be wrong.
     - When live updates are lost, the board shows the time of its last known state, and the server rechecks every action.
   - **Design rules.**
     - The dark theme is the default and a light theme is supported.
     - Layouts are responsive down to phone width.
     - Interactive targets are at least 44 px.
     - Text contrast is at least 4.5:1 in both themes.
5. **Intake, workers, and learning.**
   - **Task creation.**
     - A task is created from a description or imported from a Jira issue, a GitHub issue, a Confluence page, a text file, or another link.
     - Its type (feature, bug, improvement, documentation, maintenance, or emergency), framework, implementer, reviewer, and spec approver are prefilled with defaults that the user may change.
   - **Write-back to the source.**
     - Progress and the pull request link are written back to the source, and the source is resolved on merge.
     - Comments and reopenings at the source become feedback for lessons.
   - **Spec approval.** It may be delegated to an independent reviewer by maintainer policy; a task may require a maintainer instead.
   - **Workers.** A worker enrolled with a one-time token is admitted automatically once its self-check passes.
6. **New capabilities are plugins.**
   - Intake sources and write-back, notifications, the inbox's sources, and worker admission checks are each delivered behind a microkernel port as plugins or adapters, under ADR 0003 decision 8 and ADR 0004 principle 4.
   - Their port contracts are defined in the gate that first implements them:
     - worker admission in G2;
     - the board, inbox, intake, write-back, and auto-merge in G3;
     - framework selection in the UI in G4;
     - lesson feedback from sources in G5.

## Consequences

- ADR 0004 principle 8, the governance policy (version 3), the architecture, the repository instructions, and the README are updated to match.
- The proof of concept is reference material, not product code, and is not stored in this repository. The decisions above are the binding record. (Amended by ADR 0011: the Mantine proof of concept's source is stored in `docs/ui-poc/` as reference material.)
- This ADR implements nothing. Each decision becomes work items in its gate's plan, tracked through the selected SDLC framework.
- Auto-merge changes nothing in the release policy, in deployment authorization, or in promotions from `dev` to `main`.
