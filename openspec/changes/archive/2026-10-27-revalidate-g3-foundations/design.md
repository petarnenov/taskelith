## Context

G3 item 0 ([G3 work plan](/docs/g3-plan.md#work-items), row 0) re-reviews the G3 groundwork that merged before the G2 closure against G2 as built. Seven artifacts are in scope, one per plan item. Each is reviewed on its own, by its own reviewers, so that a finding in one artifact never waits for another.

| Item | Archived change | Capability | Artifact files |
| --- | --- | --- | --- |
| 1 | [`qualify-g3-dependencies`](/openspec/changes/archive/2026-10-25-qualify-g3-dependencies/proposal.md) | `g3-dependency-evaluation` | [`docs/g3-dependencies.md`](/docs/g3-dependencies.md), [`docs/dependencies.md`](/docs/dependencies.md) |
| 2 | [`review-g3-provider-terms`](/openspec/changes/archive/2026-10-25-review-g3-provider-terms/proposal.md) | `harness-qualification`, `scm-qualification` | The terms sections of [`claude-code.md`](/docs/qualification/claude-code.md), [`codex.md`](/docs/qualification/codex.md), and [`github.md`](/docs/qualification/github.md) |
| 3 | [`define-agent-harness-port`](/openspec/changes/archive/2026-10-26-define-agent-harness-port/proposal.md) | `agent-harness-port` | [`docs/contracts/agent-harness-port.md`](/docs/contracts/agent-harness-port.md); `packages/modules/execution/src/ports/agent-harness*.ts`; `packages/modules/execution/src/adapters/scripted-agent-harness.ts` |
| 5 | [`define-account-pool-contract`](/openspec/changes/archive/2026-10-26-define-account-pool-contract/proposal.md), [`align-harness-identifiers`](/openspec/changes/archive/2026-10-26-align-harness-identifiers/proposal.md) | `account-pool-port` | [`docs/contracts/account-pool.md`](/docs/contracts/account-pool.md); [capacity reservation](/docs/contracts/capacity-reservation.md) section 10; `packages/modules/scheduling/src/domain/{account-slot,slot-secret,slot-selection}.ts`; `packages/modules/scheduling/src/ports/account-pool*.ts` |
| 6 | [`define-git-workspace-contract`](/openspec/changes/archive/2026-10-26-define-git-workspace-contract/proposal.md) | `git-workspace-port` | [`docs/contracts/git-workspace.md`](/docs/contracts/git-workspace.md); `packages/modules/workspace/**` |
| 7 | [`define-scm-port`](/openspec/changes/archive/2026-10-26-define-scm-port/proposal.md) | `scm-port` | [`docs/contracts/source-control.md`](/docs/contracts/source-control.md); the SCM parts of `packages/modules/integrations/src/ports/**` |
| 8 | [`define-product-ports`](/openspec/changes/archive/2026-10-26-define-product-ports/proposal.md) | `product-ports` | [`docs/contracts/product-ports.md`](/docs/contracts/product-ports.md); `packages/modules/execution/src/ports/{board-read-model,needs-you,standing-approval-rules}.ts`; `packages/modules/integrations/src/ports/{auto-merge,intake-source,write-back}.ts` |

Item 4 and items 9 onwards had not merged and are out of scope. This change does not edit `docs/g3-plan.md`.

## Goals / Non-Goals

**Goals:**

- One independent revalidation per artifact, with a verdict per item: "current" or "needs a fix".
- A follow-up change for each substantive finding, with a proposed name, its item, a size, and the findings it resolves.

**Non-Goals:**

- Fixing any artifact in this change. Contracts, specifications, port types, and qualification records stay as merged.
- Reviewing G2 itself. G2 is the baseline; a G2 defect that a reviewer notices is recorded as a follow-up for the coordinator, not resolved here.

## Decisions

### D1. Review baseline

The reviewed revision is the merged artifact at `dev` `eda6c283` (#349). The baseline is G2 as built at that revision, as these records state it:

- [ADR 0015](/docs/decisions/0015-g2-closure.md) decisions 1 to 5:
  - **Decision 1** lists the archived changes of every G2 row, 1 to 27. G2 rows 15 (supervisor), 20 (worker runtime, 20a to 20e2), 21 (placement and reconciliation), and 23 (installation) are the ones G3 builds on most directly.
  - **Decision 2** is the exit evidence: submit, assign, execute, and persist through the composed installation; the crash windows W1 to W6 and CP1 to CP12 on macOS and Linux; partition, cancellation races, and stale generations on a test-side Linux composition (24c).
  - **Decision 3** is native acceptance: no row is fully accepted on any of the four matrix entries.
  - **Decision 4** is the fresh-clone reproduction of `dev` at `bd6108d4`.
  - **Decision 5** holds the deferrals. Those to G3 are:
    - delivery of rotated worker credentials, TLS, and the installation certificate authority (G3 item 26);
    - writers that invalidate launches, re-admission, and a reconciliation queue surface;
    - evidence retirement and per-project download authorization;
    - worker self-check admission (G3 item 27);
    - a harness's own user-namespace sandbox under the seccomp profile, and model-calling harness scenarios on Linux (G3 item 35);
    - the macOS arm64 process ownership re-run;
    - cancellation race g and the 24c-dependent cancellation and connectivity rows on all four entries;
    - item 0 itself.
- [Foundation](/docs/foundation.md#g2-status), "G2 status": the ledger of what G2 delivered and the gate of each deferred item. It records the in-memory placement rotation cursor as owner-confirmed when G2 closed; #349 has since made the cursor durable.
- **#344** `placement-backoff-preserves-rotation` (merge `21f399a5`, [proposal](/openspec/changes/archive/2026-10-27-placement-backoff-preserves-rotation/proposal.md)). A decline for lack of fleet capacity does not back off the task: the decline is one of the reasons `quarantined`, `worker-not-eligible`, `worker-capacity-exhausted`, and `no-candidate`, which `lacksFleetCapacity` names (`packages/modules/scheduling/src/domain/capacity-reasons.ts:33`, `:58`). A decline for the task's own reason that leaves the task waiting backs off from 5 s to 60 s with jitter ([capacity reservation](/docs/contracts/capacity-reservation.md) section 5, `docs/contracts/capacity-reservation.md:90`). A rejecting outcome does not back off: it ends the attempt `not-started`, closes the task's delegation, and opens no retry (`endRejectedAttempt`, `apps/control-plane/src/application/placement-service.ts:219`, `:262`; capacity reservation section 11).
- **#348** `stop-placement-pass-at-fleet-decline` (merge `56346d92`, [proposal](/openspec/changes/archive/2026-10-27-stop-placement-pass-at-fleet-decline/proposal.md)). A placement pass makes no offer after its first decline for lack of fleet capacity. A decline for the task's own reason does not end the pass. A full fleet costs at most one rolled-back placement transaction per pass (`docs/contracts/capacity-reservation.md:235`).
- **#349** `persist-placement-rotation-cursor` (merge `eda6c283`, [proposal](/openspec/changes/archive/2026-10-27-persist-placement-rotation-cursor/proposal.md)). A `PlacementRotation` port in Scheduling (`packages/modules/scheduling/src/ports/placement-rotation.ts`), exposed as `ControlPlaneTransaction.rotation`, keeps one cursor per installation. PostgreSQL stores it in the one-row table `placement_rotation` (`packages/adapters/postgres/migrations/1792932500000_placement-rotation.sql`). Each placement stores the cursor in its own transaction; control-plane instances share it and the last writer wins (`docs/contracts/capacity-reservation.md:236`).

G2 facts that the items' checks name, at `eda6c283`:

- **Supervisor and launch command.** In G2 the child is a test-only scripted process ([supervisor identity](/docs/contracts/supervisor-identity.md) section 1). The worker reads one fixed `Command` (`executable`, `arguments`) per worker from `TASKELITH_WORKER_COMMAND`, plus, on Linux, the execution account `TASKELITH_EXECUTION_UID` and `TASKELITH_EXECUTION_GID` (`apps/worker/src/settings.ts:33`, `:144`). `NodeSpawner` spawns it detached, as the leader of a new session and process group, with `stdio: 'ignore'` and no `env` or `cwd` of its own (`packages/adapters/worker-supervisor/src/node-spawner.ts:10`). The offer does not carry the harness invocation; that joins in G3 ([execution wire contracts](/docs/contracts/execution-wire-contracts.md) section 4, `docs/contracts/execution-wire-contracts.md:47`). `ExecutionSupervision` (`apps/worker/src/execution-supervision-port.ts:47`) is the per-execution port that the `LaunchOrchestrator` drives (`apps/worker/src/launch-orchestrator.ts:82`). Recovery yields `not-started`, `exited`, `observe`, `adopted`, `retry`, or `uncertain`.
- **Exit and retry.** An attempt's outcome is `exited` (with `status` and `startProven`), `operator-resolved`, or `not-started` (`packages/modules/execution/src/domain/attempt.ts:36`). An exit with an unknown status is uncertain and opens no automatic retry: `automaticRetryOf` refuses it (`packages/modules/scheduling/src/domain/automatic-retry.ts:6`, `:20`), so the attempt ends without a successor (`apps/control-plane/src/application/task-ending.ts:11`). `retry-budget-exhausted` is the capacity contract's guard for that case, which no path reaches (#332, #342; ADR 0015 decision 5).
- **Admission pressure.** `AdmissionPressure` (`apps/worker/src/admission-pressure.ts:72`) checks a disk floor of 5 GiB or 10 %, an outbox backlog of 10,000 entries or 256 MiB, the daemon's resident memory, and a 200 ms event-loop lag, every 5 s. Under pressure the orchestrator requests no launch authorization (`apps/worker/src/launch-orchestrator.ts:56`) and only `worker/logs/` is truncated ([worker journal](/docs/contracts/worker-journal.md) section 7).
- **Worker directory layout.** The [worker journal](/docs/contracts/worker-journal.md) section 2 defines `worker/lock`, `identity`, `credentials/`, `journal/`, `journal-fault`, `executions/<executionId>/`, `logs/`, and `workspaces/` (`docs/contracts/worker-journal.md:20` to `:27`). `worker/` and its control-record directories have mode `0700` and belong to the worker's account, the running one (`packages/adapters/worker-journal/src/worker-paths.ts:21`). Enrollment creates `worker/workspaces/` with the journal directories (`packages/adapters/worker-journal/src/worker-root.ts:131`). On Linux the worker runs as root (uid 0) under `setpriv`, with the bounding set `setuid`, `setgid`, and `kill` only, and its entrypoint hands the data root `/var/lib/taskelith`, of mode `0700`, to root (`infra/installation/worker-entrypoint.sh:37`, `:40`; `infra/installation/compose.yaml:102`; [local installation](/docs/local-installation.md)). `taskelith` (uid 10001) is the control plane's account; each execution runs as `taskelith-exec` (uid 10003) (`infra/installation/Dockerfile:38`, `:39`, `:57`). Attempt identities are `t` followed by a SHA-256 hex digest (`apps/control-plane/src/application/attempt-identities.ts:8`).
- **Cgroup containment and home layout.** On Linux each execution has a cgroup v2 directory under the containment parent `/sys/fs/cgroup/executions`; the worker's home cgroup is the sibling `/sys/fs/cgroup/init` (`infra/installation/worker-entrypoint.sh:8`, `:20`, `:28`). The self-check refuses a home at or under the parent (`packages/adapters/worker-supervisor/src/linux-self-check.ts:27`, change `harden-worker-linux-self-check-home-layout`). No production code calls the self-check yet; its admission wiring is G3 item 27. The worker container has `cap_drop: [ALL]` plus seven capabilities, `apparmor=unconfined`, and the seccomp profile `seccomp/worker.json`, which refuses namespaces (`infra/installation/compose.yaml:104` to `:108`).
- **Credential model.** The [installation and enrollment contract](/docs/contracts/installation-and-enrollment.md) defines it:
  - the operator credential `tkop_` (section 4);
  - single-use enrollment tokens `tken_` (section 5);
  - per worker, a bearer secret `tkwk_` and a NATS `.creds` file under `worker/credentials/`, which share a generation (section 6);
  - a rotated generation is never delivered to the worker in G2;
  - workers get no database credential;
  - no TLS (section 7);
  - `@taskelith/secrets` redacts the installation's secret shapes, and its `scrubEnvironment` (`packages/adapters/secrets/src/scrub.ts:24`) is not called by any production spawn path at `eda6c283` (section 8).
  - No per-run or per-attempt credential exists in G2.
- **Item 23 installation.** `infra/installation/compose.yaml` runs PostgreSQL, NATS, the control plane, an admin entry, and one worker. NATS and the API publish only on `127.0.0.1` ports (`:50`, `:70`); the worker reaches `http://control-plane:8080` and `nats://nats:4222` in plain text. There is no ingress for webhooks. The `worker-harnesses` image variant (G2 item 26) adds `@anthropic-ai/claude-agent-sdk` `0.3.308` and `@openai/codex` `0.164.0`, owned by root, with `DISABLE_AUTOUPDATER=1` (`infra/installation/harnesses/package.json`, `infra/installation/Dockerfile:72` to `:74`).
- **PostgreSQL schema.** Thirteen migrations under `packages/adapters/postgres/migrations/`, the last being `1792932500000_placement-rotation`. Reservations keep `provider_credentials text[]` on `assignments`, with a GIN index over held reservations (`packages/adapters/postgres/migrations/1792930000000_resource-admission.sql:12`, `:31`). The `workers` table counts generic `slots` (`:75`). No table holds account slots, slot credentials, or harness identifiers.
- **Task lifecycle.** The [execution domain](/packages/modules/execution/src/domain/task.ts) defines a `Task` with an admission, an ownership generation, and attempts, at most one of them active (`packages/modules/execution/src/domain/task.ts:36`). Other states:
  - attempt phases: `awaiting-launch`, `launch-authorized`, `running`, `ended` (`packages/modules/execution/src/domain/attempt.ts:8`);
  - cancellation reasons: `requested`, `launch-revoked`, `assignment-ended`;
  - execution states: `authorized`, `started`, `exited`, `not-started` (`packages/modules/execution/src/domain/execution.ts:8`);
  - assignment states: `offered`, `accepted`, `ended` (`packages/modules/scheduling/src/domain/assignment.ts:22`).

  In SDLC:
  - lifecycle obligations: `intake`, `specification`, `implementation`, `review`, `verification`, `closure` (`packages/modules/sdlc/src/domain/lifecycle.ts:5`);
  - stage states: `not-started`, `in-progress`, `completed` (`packages/modules/sdlc/src/domain/stage-progress.ts:6`);
  - gate states: `pending`, `passed`, `failed`, `stale`, `blocked` (`packages/modules/sdlc/src/domain/gate.ts:12`).

  A clean exit is not completion: gates decide. The writers that invalidate launches are deferred to G3: those of artifact revisions, which extend `CurrentRevisions`, of gates, and of policy revisions (ADR 0015 decision 5).

A reviewer who finds the baseline above wrong reports that as a record finding of this change.

### D2. Checks per item

Every item is reviewed against `AGENTS.md`, [ADR 0004](/docs/decisions/0004-first-class-engineering-principles.md), the [review process](/docs/governance.md#independent-review-process), the artifact's living spec under `openspec/specs/<capability>/spec.md`, and its contract. The checks particular to each item are:

| Item | Checks |
| --- | --- |
| 1 | Each library and tool is still current and qualified on 2026-10-27: its latest version, license, security reporting route, advisories since 2026-10-25, and maintenance evidence. Reviewers must check the facts on the web and cite each URL with its access date. Also check the pins that G2 item 26 shipped in the worker image against the versions item 1 recorded, and the dependency register's `candidate` entries. |
| 2 | The Anthropic, OpenAI, and GitHub terms that item 2 cited are unchanged: each URL still resolves, the quoted or paraphrased wording still matches, and no newer terms or policy page supersedes it, including on pooled subscriptions and automated use. Reviewers must check the current pages on the web and cite each URL with its access date. |
| 3 | The port against the G2 supervisor (process group and session, the macOS process-group obligation, containment, exit facts, `uncertain`, and adoption), against the launch orchestrator (one fixed `Command` per worker, no harness invocation in the offer, no `env` or `cwd` given to the child, launch authorization, and the no-automatic-retry rule for an unknown exit), and against admission pressure (no new launch authorization under pressure; what a turn, a native request, or a terminal does under it). |
| 5 | The identifiers that `align-harness-identifiers` aligned (`HarnessPluginId` from Execution, `SubscriptionMechanismId` in Scheduling) in the contract, the spec, and the code. Check the contract against the G2 PostgreSQL schema (`provider_credentials`, `workers.slots`, no slot tables) and the reservation transaction. Check how a `provider-concurrency-exhausted` wait behaves under #344, #348, and #349: it is not a fleet capacity decline, so it backs off the task and does not end the pass. |
| 6 | The layout against the G2 worker directory layout and its modes. Check whether the execution account (uid 10003) can use `worker/workspaces/<attemptId>/checkout/` under a `worker/` of mode `0700` owned by root (uid 0), the Linux worker's account. Check whether the cgroup containment and the home layout constrain the Git processes of a workspace operation. Check the `<attemptId>` safe-name rule against G2's derived attempt identities, and cleanup against the control records. |
| 7 | The per-run credential model against the G2 credential model (long-lived worker credentials only, no per-run credential, no delivery of a new generation, the redaction shapes, and `scrubEnvironment` unused by any spawn). Check webhooks and token refresh against the G2 item 23 installation: localhost ports, plain HTTP, and no ingress. |
| 8 | The board read model, the "Needs you" inbox, standing approval rules, intake, write-back, and auto-merge against the task lifecycle as G2 built it: task, attempt, execution, and assignment states; SDLC obligations, stage states, and gate states; and the waiting and rejecting reasons that a card or blocked reason shows. |

### D3. Reviewers

Confirmed by the coordinator. A and B are of different harnesses for every item, except where a replacement below records why not. Items 1 and 2 depend on external facts, so both of their reviewers have network access ("External facts").

| Item | A (original) | B (original) | A (replacement) | B (replacement) |
| --- | --- | --- | --- | --- |
| 1 | OpenCode `kimi-k3.1-pro` | Claude Code `claude-fable-5-1` | Claude Code `claude-fable-5-1` | Claude Code `claude-opus-5-5` |
| 2 | OpenCode `deepseek-v4-pro` | Claude Code `claude-opus-5-5` | Pass 3: Claude Code `claude-fable-5-1` | Unchanged |
| 3 | OpenCode `kimi-k2.7-code` | Codex `gpt-6-astra` | Unchanged | Unchanged |
| 5 | OpenCode `qwen3.8-max` | Codex `gpt-6.1-sol` | Codex `gpt-6.1-sol` | Claude Code `claude-opus-5-5` |
| 6 | OpenCode `kimi-k3.1-pro` | Claude Code `claude-fable-5-1` | Pass 3: Codex `gpt-6-astra` | Unchanged |
| 7 | OpenCode `deepseek-v4-pro` | Codex `gpt-6-astra` | Pass 3: Claude Code `claude-fable-5-1` | Unchanged |
| 8 | OpenCode `kimi-k2.7-code` | Claude Code `claude-opus-5-5` | Codex `gpt-6-astra` | Unchanged |

The OpenCode Go weekly quota paused all OpenCode reviewers on 2026-10-27, after pass 1 of items 2, 3, 6, and 7. The coordinator, Niki, assigned the replacements under "Unavailable reviewer"; it confirmed the pass 3 replacements the same day. Items 1 and 2 keep both reviewers in Claude Code, the only available harness with network access ([verification](verification.md), "Reviewers and replacements").

Each reviewer runs with the invocation of the [agent task protocol](/docs/agent-task-protocol.md#reviewer-invocations), from this change's worktree. Prompt files, logs, and snapshots stay outside the worktree.

### D4. Review governance

Each item follows the [review process](/docs/governance.md#independent-review-process) version 5 on its own:

- **Pass 1** is reviewer A's full review of the artifact against the baseline and its checks.
- **Pass 2** is reviewer B's pass: it checks the resolution of each pass 1 finding, then reviews the artifact independently.
- **Pass 3** is reviewer A's confirmation of the pass 2 resolutions only, with no new scope.
- **Cap.** At most three passes per item.
- **Low only.** A pass with only Low findings ends that item's review. After a Low-only pass 1, reviewer B is not used.
- **Unavailable reviewer.** The replacement rule applies per item, keeping A and B of different harnesses.
- **Snapshot.** A SHA-256 snapshot is taken of the worktree before and after each pass.

Here a "fix" between passes is a correction of this change's own records only. A substantive finding about an artifact is resolved as `deferred`, with its follow-up change named in the resolution. A record correction is `fixed`, with its commit. The next pass checks that each deferred finding names a follow-up that covers it, and that each record correction is right. Deferring a finding does not end the review: pass 2 runs after any pass 1 with a Medium or worse finding, as version 5 requires, so that every such item gets reviewer B's independent review. Pass 3 runs after a pass 2 with a Medium or worse finding, to confirm its record corrections and deferrals. Findings that remain unresolved after pass 3 go to the owner under "At most three passes per task".

### D5. Records

- **`findings.jsonl`** holds one line per finding, per the [review findings record](/docs/agent-task-protocol.md#review-findings-record), with an `artifact` property, `item-1` to `item-8`, that names the reviewed item. The capability is the artifact's (for item 2, `harness-qualification` or `scm-qualification` per file), or none for a record finding of this change.
- **`passes.jsonl`** holds one summary per pass, keyed by (`artifact`, `pass`), so that pass 1 of item 3 and pass 1 of item 5 are distinct.
- **Prerequisite.** The tooling change `scope-review-passes-by-artifact`, merged into `dev` as #353, adds the `artifact` property to both schemas and keys passes by (`artifact`, `pass`). It was merged into this branch before the first finding or pass line was written ([verification](verification.md), "Revision").
- **`verification.md`** records each pass per item, with the reviewer, invocation, model confirmation, session, snapshots, and findings. It also holds the summary per item and the follow-up table.

### D6. Follow-up changes

Each substantive finding is assigned to a follow-up change. One follow-up change may resolve several findings of one item. Each follow-up has:

- a proposed name, in kebab case;
- its item;
- a size: S (records or one contract section), M (a contract, its spec, and its port types), or L (several capabilities, or code beyond port types);
- the findings it resolves.

A port's own readers and conformance cases under `src/ports/**` count as port types.

The coordinator distributes them to workers. Item 0 is done when each of them has landed in `dev`.

## Risks / Trade-offs

- **Stale baseline.** A change that lands in `dev` during the review moves G2 as built. Mitigation: the baseline is fixed at `eda6c283`. A later change that affects an artifact is named in that item's pass record.
- **External facts move.** Items 1 and 2 depend on pages that may change between passes. Mitigation: each fact cites its URL and access date, and pass 2 rechecks the facts itself.
- **Deferral without re-review.** A Medium or higher finding that is deferred is not re-reviewed in this change. Mitigation: its follow-up change gets its own independent review.
