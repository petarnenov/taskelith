# Verification

Date: 2026-10-26. Author verification is recorded below; the independent review has not run yet.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 20, the third of the five changes the coordinator split it into (20c). The coordinating session (Niki) assigned it to the worker session Pepi. The reviewer is Claude Fable 5.1 (medium), as the coordinator assigned, with a cap of three passes.

- Base revision: `190e2cc` on `dev`.
- Scope: W2 and W3 of the worker journal contract, the `authorizeLaunch` retry loop (the same `operationId` without a decision, a backoff of 5 s to 60 s with jitter, a new `operationId` after the deadline), `workerLaunchDeadline` with its suspend cases, the supervisor's prepare, start, and seal, the observations `started`, `exited`, `not-started`, `uncertain`, and `launch.rejected`, cancellation forwarding, the offline rule, and the `publishEvidence` client (20a decision Q4 (b)). Obligations: item 17 (the retry loop, W2 and W3, the deadline) and R06.
- Out of scope: 20d and 20e, as the design's Non-Goals list.

### Coordinator decisions (2026-10-25)

- **Q1 (a):** 20c delivers the `EvidencePublisher` port and `HttpEvidencePublisher`; no launch calls it in G2. G2's result is the exit observation that 21b stores; evidence from a launch joins the harness in G3. Item 24's "persist its result" rests on that observation.
- **Q2 (a):** only the live termination evidence (`containment-empty`, `process-group-empty`, `never-spawned`) is mapped, and any other evidence fails its mapping explicitly. **Obligation on 20d:** the asyncapi amendment for `boot-changed` and `namespace-ended`, brought to the coordinator.
- **Q3 (a):** `TASKELITH_WORKER_COMMAND` and the Linux launch settings are optional. Without the command the worker accepts intents and never launches them, which a test shows. The settings are documented in `docs/local-installation.md`.
- Also accepted: the execution facts stored as JSON with their wire fields, and no journal format change; sealing before W4 and retrying with new identities; the record removal, a dead supervisor, and adoption left to 20d.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, Docker with the Compose services of `make verify`.
- Dependencies: no third-party package added. `apps/worker` gains the workspace dependency `@taskelith/worker-supervisor`; the regenerated inventory differs only by it.
- Contracts: no contract document changed.
- Journal: no format change. No execution fact was journaled before this change, so the facts' new fields need no migration.

## Author self-check

- **W2 and W3:** W2 commits before the first request of each operation; a grant, a rejection, and a revocation each commit W3 (`launch-orchestrator.test.ts`).
- **Retry loop:** requests without a decision repeat one `operationId`, with delays within [5 s, 60 s]; a retryable rejection gets a new `operationId` for the same execution; a final one is journaled with its observation and never retried; `revoked` maps to a rejection with its reason; `expired` abandons the execution.
- **Deadline:** from the deadline clock read before the operation's first request. A grant past it, a reading of another boot, and an unreadable clock never hand a grant out; a deadline passed without a decision seals the execution, reports `not-started`, and authorizes a new one.
- **Launch sequence:** `intent`, then W4, then the supervisor start; W5s then W5e; a supervisor seal gives W6 and a new launch; a failed supervisor start is decided by recovery; a corrupt record gives one `uncertain`; a failed `intent` write abandons the execution before W4.
- **Offline:** no supervisor starts while the authority is unreachable.
- **Cancellation:** during authorization the launch stops and is sealed; after W4 the `cancel` file is written; the evidence is recorded only when every targeted execution is terminal, and at once when none exists.
- **Executions left pending:** an execution that a stop or an earlier process left before its terminal fact is not launched again; 20d reconciles it.
- **Wire mapping:** each execution observation is checked against `execution.asyncapi.json`; a `boot-changed` exit fails its mapping (Q2).
- **Evidence client:** the multipart parts, the bearer, the 200 and 201 answers, `unavailable` for 502, 503, 504, and a timeout, and refusal of an answer that violates `EvidenceRecord` or names another record.
- **Against ADR 0004:** hexagonal: the orchestrator depends on the journal port, the `LaunchAuthorityClient` port, and the `ExecutionSupervision` port, whose file adapter wraps `@taskelith/worker-supervisor`; the evidence client implements an Execution port. Contract-first: every new observation is checked against its schema.

## Checks

`make verify` ran in the worktree with every file tracked: exit 0.

- `verify:comments`: no violation.
- `make test` (with its own PostgreSQL, NATS, and Toxiproxy): 1246 tests, 1246 passed, 0 failed; coverage of all files 99.19% lines, 91.61% branches, 98.76% functions, above the 75% floor.
- `make contract-compatibility`: 0 breaking changes in each of the four documents.
- `verify:dependencies`: the inventory is current after `make dependency-inventory`.
- `openspec validate --all --strict`: 60 passed, 0 failed; `verify:archive`: every active change archives into strictly valid specs; `verify:package`: passed.

An earlier run failed one test only because the build had preceded the fix that keeps an unsettled execution from being launched again; the run above includes it.

## Review passes

Not yet run. Reviewer: Claude Fable 5.1 (medium), with the protocol invocation; the prompt forbids writing any file in the worktree.

## Limitations

- A supervisor that dies while the worker runs leaves the execution `started` until a restart; liveness belongs to 20d.
- Execution records are kept after their terminal fact until 20d removes confirmed ones.
- The record is polled every second, so a fact reaches the outbox up to one interval late.
- Before a grant names its own `ttl` and `skew`, the retry loop bounds an operation with the provisional `30s` and `5s` of the operational targets.
- The supervisor version written in `intent` is the worker package's version, since the supervisor ships in the worker's build.
- An execution observation's `correlationId` is its `assignmentId`, because the journal keeps no offer correlation with the intent.

## Remaining gates

- The independent review (Claude Fable 5.1, medium), at most three passes.
- Coordinator integration into `dev` and archiving.
- 20d: start reconciliation, the asyncapi amendment of Q2, and record removal.
