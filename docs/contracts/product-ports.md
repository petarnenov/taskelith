# Product ports contract

Date: 2026-10-26. Status: proposed contract for G3 ([G3 work plan](../g3-plan.md) item 8, `define-product-ports`), under independent review. It defines the ports that [ADR 0008](../decisions/0008-product-ui-and-integration-authority.md) decision 6 places in G3: the board read model over the lifecycle stages and the framework mapping, the "Needs you" inbox and its sources, task intake and write-back, and auto-merge with its standing rules. The [product UI specification](../../openspec/specs/product-ui/spec.md) and the [auto-merge authority specification](../../openspec/specs/auto-merge-authority/spec.md) state the behavior; this contract fixes the values, records, ports, and invariants that implement it. G3 items 15 (board and inbox views), 23 (auto-merge), 24 (merge conflict flow), and 25 (intake) implement it, and item 9 maps its views onto the OpenAPI document.

## 1. Purpose and parties

The SPA reads centrally aggregated views and sends commands through the control plane ([architecture section 11](../architecture.md#11-spa-authentication-and-live-traffic)). This contract defines the module-owned ports behind those views and commands. The ports and their types name no intake source, SCM, harness, or SDLC framework: each enters through a plugin or adapter, under [ADR 0003](../decisions/0003-first-integrations-and-plugin-kernel.md) decision 8 and [ADR 0004](../decisions/0004-first-class-engineering-principles.md) principle 4.

| Port | Owner | Implemented by |
| --- | --- | --- |
| `BoardReadModel`: the board and the task detail | Execution | The item 15 aggregate over SDLC, Execution, Fleet, and Integrations records |
| `NeedsYouInbox`: the inbox and its counts | Execution | The item 15 aggregate over every registered `NeedsYouSource` |
| `NeedsYouSource`: one source of inbox items | Execution | Native requests (Execution, item 18), spec approvals (the item 22 adapter over SDLC gate records, outside the SDLC module), escalations (Integrations, items 23 and 24) |
| `StandingApprovalRules`: maintainer rules that answer native requests | Execution | The item 23 PostgreSQL adapter |
| `IntakeSource`: imports a task from an external source | Integrations | Source plugins; in G3 only GitHub issues, through the item 20 plugin (G3 decision D9 (a)) |
| `WriteBack`: progress, links, and resolution at the source | Integrations | The plugin that implements the item's `IntakeSource` |
| `AutoMergeSettings`: the per-project setting | Integrations | The item 23 PostgreSQL adapter |
| `MergeQueue`: serial merges per target branch | Integrations | The item 23 PostgreSQL adapter |

The Integrations module is the "SCM / Tracker integrations" module of [architecture section 6](../architecture.md#modules). It imports only the kernel, SDLC, and Execution modules; no module imports it. The SCM port of item 7 also belongs to it; merging itself happens through that port and is not defined here. Both modules are hexagonal: these ports are types and constants only, and this item adds no adapter.

A task created without an external source, from a description, involves no `IntakeSource` and no `WriteBack`.

## 2. Common rules

1. **Project scope and authorization.** Every query and command names one project. The Access module checks the caller's role on that project before the port is called ([trust model](../trust-model.md) section 3); a port never decides authorization itself. A `project-viewer` reads the board, the task detail, and the inbox. A `project-operator` answers native permission and input requests. A `project-maintainer` approves specifications, resolves escalations, changes the auto-merge setting, and records or revokes standing rules.
2. **Views are projections.** A view is never the authority for a command. Every command rechecks the current state in its own transaction and fails with `precondition-failed` when the state the caller saw has changed. A view carries the time of its state (`asOf`) and the event stream position it reflects (`position`), so that item 14's event stream can resume from it and the board can show the time of its last known state when live updates are lost.
3. **Stable identities.** Views are keyed by the stable identities of tasks, runs, stages, gates, and attempts, never by array positions or native paths, so that a later campaign grouping ([ADR 0013](../decisions/0013-intents-campaigns-and-proposal-graphs.md)) adds a grouping without a second data path.
4. **No vendor names.** No type, value, or test of either module names a source, SCM, harness, or framework. A framework's native step appears only as the native stage identifier the SDLC framework port returned. A source's issue identifier appears only as an opaque reference.
5. **Untrusted plugin data.** `IntakeSource` and `WriteBack` are implemented by plugins, so their inputs and outputs are plain data with string fields that the Integrations module parses and bounds, as the frozen SDLC framework port does ([ADR 0009](../decisions/0009-frozen-sdlc-framework-port.md)). The other ports are internal and use the modules' branded types.
6. **Failures.** Every operation returns a kernel `Result`. Callers branch on the kernel failure codes: `invalid` for malformed input, `not-found`, `conflict` for a duplicate or a lost compare-and-set, `precondition-failed` for a changed state, `forbidden`, and `unavailable` for a source or store that cannot be reached.
7. **Idempotency.** Every command that a client or a plugin call can repeat is idempotent by one named means: an idempotency key (inbox answers and write-back calls), a compare-and-set on an expected revision (the auto-merge setting and merge request transitions), or a natural key (recording or revoking a standing rule by its identifier, a rule use by its rule and native request, a merge request or a manual merge by its run and head). A repeat with the same key and the same input returns the first outcome; the same key with different input fails with `conflict`. A lost compare-and-set fails with `conflict`.
8. **Approver port.** Approvals run through the decision body that a gate names, never through a hard-coded human call ([ADR 0013](../decisions/0013-intents-campaigns-and-proposal-graphs.md) and [ADR 0014](../decisions/0014-decision-council-and-delegated-approval.md) forward-compatibility obligations). In G3 the approvers are a `project-maintainer` and the independent reviewer that delegated spec approval names; the council is not constituted in G3.

## 3. Board read model

### 3.1 Columns

The board's columns are the governance lifecycle stages under their short labels. Accept and integrate is the merge gate between Review and Archived, not a column.

| Column value | Label | Lifecycle stage |
| --- | --- | --- |
| `propose` | Propose | Propose and inspect |
| `specify` | Specify | Specify and design |
| `implement` | Implement | Implement |
| `verify` | Verify | Verify |
| `review` | Review | Review |
| `archived` | Archived | Close |

### 3.2 Framework mapping

The column of a workflow stage is derived from the stage's obligations and its place in the stage graph, as the frozen SDLC framework port returns them (`StageData.obligations`, `StageData.origin`, `StageData.dependsOn`). No new framework operation is needed, and the rule is the same for every framework:

1. A stage with the `implementation` obligation is in `implement`.
2. A stage with the `verification` obligation is in `verify`.
3. A stage with the `review` obligation is in `review` if a stage with the `implementation` obligation is among its transitive dependencies in `dependsOn`, and in `specify` otherwise, because a review of a specification belongs to Specify and design.
4. A stage with the `intake` obligation and no other rule above is in `propose`, even if it also has the `specification` obligation.
5. A stage with the `specification` obligation and no rule above is in `specify`.
6. A stage with the `closure` obligation is the Close stage. While it is the current stage and the change is not merged, the card stays in `review` and shows its merge gate state (section 3.4). Once its merge request is `merged`, the card is in `archived`, even while the Close stage still runs, as the product UI scenario "Merge" requires.
7. A stage with no obligation is rejected by the SDLC module's parser before it reaches the board, so the rules above cover every stage.

A stage that matches more than one rule takes the first rule that matches. A card's **current stage** is the first stage that has not completed, in a topological order of `dependsOn` with ties broken by the order in which the port returned the stages; this contract uses the term only in that sense. The card's column is the column of its current stage. For the frozen OpenSpec plugin, `proposal` is in Propose, `specs`, `design`, and `tasks` are in Specify, `apply` is in Implement, `verify` and `review` are platform-managed stages in Verify and Review, and `archive` is the Close stage. For the SpecKit mapping fixture, `specify` is in Propose, `review-spec`, `plan`, `review-plan`, and `tasks` are in Specify, `implement` is in Implement, `verify` and `review` are platform-managed stages in Verify and Review, and `close` is a platform-managed Close stage.

A card names the current stage's native identifier when its origin is `native`, and shows "platform-managed" when its origin is `platform-managed`.

### 3.3 Card

| Field | Meaning |
| --- | --- |
| `taskId`, `runId` | Stable identities |
| `title` | Display text, at most 200 characters |
| `workType` | One of `feature`, `bug`, `improvement`, `documentation`, `maintenance`, `emergency` (ADR 0008 decision 5) |
| `framework` | The run binding's plugin identifier and version |
| `column` | Section 3.2 |
| `stage` | The current stage (section 3.2): its identifier, origin, and state |
| `gate` | The most urgent gate state of the current stage, in the order `blocked`, `failed`, `stale`, `pending`, `passed`; absent when the stage has no gate |
| `waitingFor` | Why the card does not move, when it waits: a person, a stage admission, a reviewer, capacity, or the merge queue |
| `session` | The session activity of section 3.6, or `none` |
| `integration` | The merge gate state of section 3.4 |
| `needsYou` | The number of open inbox items for the task |

### 3.4 Merge gate on the board

The board shows the merge gate with these values, which item 15 derives from the merge queue states of section 6.3. They are the view's own values, so that Execution does not import Integrations.

| Value | Meaning | From merge request state |
| --- | --- | --- |
| `not-ready` | A gate before the Close stage has not passed | No merge request |
| `awaiting-manual-merge` | All gates passed and auto-merge is off | No merge request, setting off |
| `queued` | Waiting for its target branch | `queued` |
| `merging` | Merging now | `merging` |
| `resolving-conflict` | The conflict flow runs | `resolving-conflict` |
| `returned-to-specify` | A spec conflict sent it back | `returned-to-specify` |
| `escalated` | Waits for a maintainer | `escalated` |
| `integrated` | Merged | `merged` |

A `withdrawn` request maps to `awaiting-manual-merge` for the reasons `auto-merge-off` and `manual-merge`, and to `not-ready` for the reasons `gate-not-passed`, `cancelled`, and `maintainer-withdrew`.

### 3.5 Board view and board states

`BoardReadModel.board(projectId)` returns the project's cards with `asOf`, `position`, the number of workers online, and whether the caller may act. The SPA's board states derive from it: no project is the first run, no cards is empty, a failed query is a load error that shows no task data, zero workers online is "no workers online", and a caller who may not act sees the read-only state. The read model never returns partial data as complete: if one of its sources cannot be read, the query fails with `unavailable`.

### 3.6 Session activity

The values follow the product UI requirement "Session activity indicator":

| Value | Indicator | Meaning |
| --- | --- | --- |
| `working` | Spins | The session is live, or stopping and the worker has not confirmed that it ended |
| `waiting-for-person` | Still | The session waits on an inbox item |
| `waiting-for-admission` | Still | The session waits for its next stage admission |
| `stopped` | Still, muted | The session has stopped |
| `worker-unreachable` | Still | Contact is lost; the view carries the last contact time, and the attempt keeps its owner and ownership generation |
| `process-uncertain` | Still, danger | The worker can prove neither that the process runs nor that it ended; a `project-maintainer` may reconcile it with an audited decision |

A card without a session has `session` set to `none`.

### 3.7 Task detail

`BoardReadModel.taskDetail(projectId, taskId)` returns, for each stage of the run in graph order: its identifier, origin, column, stage state, and gates, each with its state, the evidence kind it requires, and its block reason when blocked. It also returns why the task waits, requirement traceability from each requirement's native reference to its work items and attempts with the freshness of their evidence (`current`, `stale`, or `missing`), the run binding, the admission with its state and policy revision, and the merge gate state. Evidence made stale by a new head or artifact revision is shown as `stale` until it passes again.

## 4. "Needs you" inbox

### 4.1 Items

Every item that waits on a person is one inbox item. The item kinds in G3:

| Kind | Source | Who answers | Answer |
| --- | --- | --- | --- |
| `permission-request` | A native permission request of an attempt (item 18) | `project-operator` or above | `allow` or `deny` |
| `input-request` | A native input request of an attempt (item 18) | `project-operator` or above | Text, at most 64 KiB |
| `spec-approval` | A spec gate that requires a maintainer (item 22) | `project-maintainer` | `approve` or `reject`, with a reason |
| `escalation` | Auto-merge or the conflict flow (items 23 and 24) | `project-maintainer` | `retry`, `return-to-specify`, `merge-manually`, or `withdraw` |

An item records its identifier, project, kind, the source that owns it, its subject (the task, and the run, stage, gate, attempt, and native request it concerns, when they exist), a title, its creation time, the role that may answer it (`answerableBy`), and its state, `open` or `resolved`, with the resolver, the time, and the answer once resolved. Only an `escalation` item carries an escalation reason. `answerableBy` names the least human role that may answer in G3; when the decision council of ADR 0014 is constituted, a contract change adds the deciding body to the item. Escalation reasons are `conflict-budget-spent` (three conflict attempts failed), `spec-reconciliation-failed` (a reconciled specification failed again), and `no-reviewer` (no reviewer was available after three attempts).

### 4.2 Answers

- A native request appears in the inbox only after its source has persisted it (architecture section 7). The item stays tied to its request, attempt, and attempt generation.
- An answer goes to the source that owns the item, never to the inbox store. The source consumes it once: a second answer to a resolved item fails with `conflict` and changes nothing, and an answer for an item whose attempt has a newer generation fails with `precondition-failed`.
- The inbox never answers an item itself and never generates a default answer. A standing rule (section 5) answers a request before it becomes an item; a request without a matching rule waits for a person.
- Resolving an item publishes an event that every screen applies, so that the item leaves the inbox and the board's counts everywhere.

### 4.3 Ports

`NeedsYouSource` is implemented once per source. It declares the kinds it owns, lists its open items for a project after a position, and applies an answer with the responder, the answer, and an idempotency key. `NeedsYouInbox` lists a project's open items, newest first, filtered by kind or task, and counts them per task and in total. Execution's existing `Inbox` port is a message inbox for consumers; the new names keep the two apart.

## 5. Standing approval rules

A project-maintainer records standing rules that Taskelith uses to answer native permission requests through the external approval client (ADR 0008 decision 2). A rule records its identifier, project, author, scope, policy revision, creation time, origin (`maintainer` or `auto-merge`), and, once revoked, who revoked it, when, and why.

- **Scope.** A rule's scope names one normalized operation. G3 defines one, `push-to-task-branch`: a push to the task's own branch, never to the target branch. The agent harness port (item 3) classifies a native permission request into a normalized operation; a request it cannot classify matches no rule.
- **Auto-merge rule.** While auto-merge is on, the project has an active rule of origin `auto-merge` for `push-to-task-branch`. Turning auto-merge on records it, and turning it off revokes it, in the same transaction as the setting change (section 6.2).
- **Use.** Answering a request by a rule and recording the use happen in one transaction. A use records the rule, the request, the attempt and its generation, the policy revision, and the time. A rule revoked or of an older policy revision than the run's current one is not used.
- **Audit.** Recording, revoking, and using a rule are audited.

## 6. Integrations: intake, write-back, and auto-merge

### 6.1 Intake and write-back

`IntakeSource` turns a source reference that a user gives, such as a link, into a task draft. It declares its source kind, a label, and whether it supports write-back (`supportsWriteBack`). `fetch` returns the item's opaque external identifier, title, body, and link, and may suggest a work type. The Integrations module parses the result, rejecting a title over 200 characters or a body over 256 KiB as `invalid`, then fills the draft's changeable defaults from the project: work type (the suggestion or `feature`), framework (the project default, OpenSpec unless another is selected), implementer, reviewer, and spec approver (`delegated-reviewer` or `project-maintainer`, by the project's spec approval policy). The user may change every default before the task is created.

`WriteBack` reports to the source the task's progress (its column and gate state), the change request link once one exists, and the resolution on merge. Each call carries an idempotency key; a repeat with the same key is a no-op at the source. A write-back failure is retried and recorded, and never blocks a gate or a merge. Comments and reopenings at the source become lesson feedback in G5 (ADR 0008 decision 6); this contract defines no feedback operation.

### 6.2 Auto-merge setting

Each project has one auto-merge setting, on by default, with a revision and, from its first change on, the maintainer who last changed it and the time. Only a project-maintainer changes it, by compare-and-set on the revision. While it is on, it is the explicit integration authorization that governance requires. Changing the setting records or revokes the push rule of section 5 in the same PostgreSQL transaction; this is a deliberate cross-module transaction between Integrations and Execution, as architecture section 6 requires to be documented. Auto-merge never merges into `main`, releases, or deploys.

### 6.3 Merge queue

A merge request names the change's run and task, the target branch, and the code head that its gates passed at. The target branch is the project's integration branch for a standalone change; it is a field, not a constant, so that an intent's integration branch can become a target later (ADR 0013 decision 7).

- **Entry.** A change enters the queue when every gate before its Close stage has passed at the current head and auto-merge is on. Enqueueing is idempotent per run and head: a repeat returns the existing request.
- **One at a time.** At most one request per target branch is `merging` or `resolving-conflict`; the next is claimed only after it has merged or left the flow. A claim that takes nothing reports whether the branch is busy or the queue is empty.
- **States.** `queued`, `merging`, `resolving-conflict`, `returned-to-specify`, `escalated`, `merged`, and `withdrawn`. A gate that goes stale or fails (`gate-not-passed`) withdraws a queued request. The setting turning off (`auto-merge-off`) or the task's cancellation (`cancelled`) withdraws every request that is `queued`, `escalated`, or `returned-to-specify`; a request in flight finishes its current step and is then withdrawn unless it merged. Each withdrawal records its reason.
- **Latest request.** A run has one request per head; `latestForRun` returns the most recently enqueued one.
- **Escalation answers.** A maintainer's answer to an escalation moves its request: `retry` puts it back to `queued` and resets its conflict attempts to zero; `return-to-specify` moves it to `returned-to-specify`; `merge-manually` withdraws it with the reason `manual-merge`, and the maintainer merges outside auto-merge; `withdraw` withdraws it with the reason `maintainer-withdrew`. Each answer is audited.
- **Conflicts.** The conflict flow of ADR 0008 decision 3 has a budget of three attempts, counted per request and reset only by a `retry` answer. Each attempt resolves in the task's workspace, runs verification and the task's independent review again on the new head, and makes the old head's evidence stale. A spec conflict returns the task to Specify. A spent budget, a reconciled specification that fails again, or no reviewer after three attempts escalates to a maintainer through the inbox. Review never falls back to the implementer.
- **Merge.** Merging uses the SCM port with the project's merge method. A merged request records the integrated revision; the change is then closed and archived through its framework's Close stage, and its agent session is stopped. Each step is idempotent and has a crash point, so that a restart completes it without merging twice.
- **Manual merge.** A merge outside auto-merge, after `merge-manually` or while the setting is off, is reported by the SCM port (item 7) and recorded with `recordManualMerge`: it moves the run's latest request to `merged`, or records a `merged` request when the run has none, with the integrated revision. The closure and the session stop then follow as for any merge, and the card moves to `archived`. A repeat for the same run and head returns the merged request. How the SCM port detects the merge belongs to items 7 and 23.

## 7. Required tests

The items that implement these ports add, through `make`:

- A board mapping test over the frozen OpenSpec plugin's stage graph and the SpecKit mapping fixture, asserting the columns of section 3.2, including a card in `archived` once its merge request is `merged` while its Close stage still runs.
- An inbox test that a duplicate answer, an answer for a newer attempt generation, and an answer by a role that may not answer are rejected without a change, and that a resolved item leaves the counts.
- A standing rule test that a revoked rule, a rule of an older policy revision, and an unclassified request never answer a request, and that every use is audited.
- An auto-merge test that turning the setting off revokes the push rule in the same transaction and withdraws queued, escalated, and returned-to-specify requests, and that two ready changes for one target branch merge one after the other.
- A conflict flow test that the budget stops at three attempts, that a spec conflict returns to Specify, that escalation creates exactly one inbox item, and that each escalation answer moves the request as section 6.3 states.
- A crash point test for each merge, closure, and session-stop step.
- An intake test with a scripted source that returns over-long, missing, and malformed fields, and a write-back test that a failing source neither blocks a merge nor loses the retry.

## 8. Not in this contract

- Wire schemas: item 9 maps these views and commands onto the OpenAPI document and the event stream.
- The SCM operations, the agent harness port, and the classification of native requests: items 7 and 3.
- The worker admission port: G2, or item 27 if the G2 closure defers it.
- Framework selection in the UI (G4), lesson feedback from sources (G5), notifications, and the decision council ([ADR 0014](../decisions/0014-decision-council-and-delegated-approval.md)).
- Freezing `IntakeSource` and `WriteBack` as plugin API ports in the plugin SDK: item 25 freezes them with their first plugin.
