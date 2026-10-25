# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

G2 work item 18 in [docs/g2-plan.md](../../../docs/g2-plan.md), assigned by the coordinator under the agent task protocol. The branch was created from `origin/dev` at `a1a27a1`, which contains items 6, 7, 10, and 11. Scope: the Scheduling domain, ports, in-memory adapters, conformance suites, and application services for resource admission; the second `@taskelith/postgres` migration and the repositories of the capacity ports; integration tests against PostgreSQL; and provisional values in `docs/operational-targets.md` and the capacity contract. The change adds the `resource-admission` capability.

The coordinator decided the design questions before implementation: Scheduling owns narrow read ports for workers, installation, quotas, lineage, and the ledger, with lineage, charges, delegations, and quotas as its own tables and minimal `workers` and `installation` tables that item 13 owns and extends (Q1 a); delegation admission is a Scheduling service called in the creating transaction (Q2 a); and the author's defaults, including the provisional bounds, which are to be recorded in the operational targets.

## Author self-check before review

Checked against the ADR 0004 principles:

- Clean Code: pure decision functions with one check each, application services that read, decide, and write in that order, and comments only for rationale and contracts.
- SOLID and hexagonal architecture: the decisions are pure domain; the services depend on Scheduling's ports only; `@taskelith/postgres` implements them; the boundary check passes.
- Microkernel: no harness, provider, or vendor is named; provider credentials stay an empty list in G2.
- Docker and Makefile: the integration tests run against the digest-pinned PostgreSQL of the Compose project through `make test` and `make verify`.
- OpenAPI: no wire contract changes; the command payloads are marked provisional until item 8.
- OpenSpec: this change tracks the work; strict validation passes.
- Coverage: every new Scheduling module has 100% line coverage; branch coverage is 80% for the service, 88.89% for the fair order, and 93–100% elsewhere.
- Dependencies: none added.

Evidence check: the reasons, budgets, and transaction steps follow [the capacity reservation contract](../../../docs/contracts/capacity-reservation.md) sections 2 to 7 and 11, and the owner decisions D-A, D-B, and D-C recorded in the archived `define-capacity-reservation-contract` change. One deviation from the brief: the coordinator accepted "full jitter" for the backoff, but full jitter can wait less than the contract's initial `5s`, so each delay is the doubling base plus jitter of up to one more base below the `60s` cap, which keeps it within `[5s, 60s]`.

## Checks

Environment: macOS (Darwin 25.6.0, arm64), Node v24.22.1, npm 12.2.1 (through `make verify`), Docker Engine 29.6.1, Docker Compose v5.2.0, PostgreSQL 18.6 from the pinned image.

On `28338ff`, before review: `make verify` passed: comment rule, workspace package contract and boundary checks, 540 tests (including 15 resource admission and 13 capacity conformance integration tests), coverage 99.70% lines, 95.97% branches, 99.56% functions, contract compatibility, the dependency inventory (710 package paths), strict OpenSpec validation (45 items), the archive dry run, and package verification.

On `dbdf9a6`, after the pass 1 fixes: `make verify` passed with 542 tests, coverage 99.70% lines, 95.93% branches, 99.57% functions; the Scheduling operations have 100% line and 80–94% branch coverage.

On `abf7034`, after the pass 2 fixes: `make verify` passed with 544 tests, coverage 99.66% lines, 95.87% branches, 99.46% functions.

On `e3b6e19`, after the pass 3 fixes: `make verify` passed with 546 tests, coverage 99.67% lines, 95.93% branches, 99.47% functions.

### Required tests of contract section 12

| Required test | Where |
| --- | --- |
| Replicas racing for the last worker slot and the last project unit | Covered: `resource-admission.integration.test.ts` |
| Replicas racing for the last run or credential unit, or the last delegation attempt | Run and credential exhaustion and the ninth tree attempt are covered sequentially; their races deferred to item 24 |
| Two replicas placing the same attempt | Covered |
| Crash before commit leaves nothing; a commit leaves all three | Covered (crash); the commit case is the placement test |
| Disconnected, revoked, or crashed worker keeps its reservations | Partly: supersession only without a grant and a granted assignment is not superseded; the rest needs items 20 and 21 |
| Ending an assignment raced with launch authorization; operator release | Deferred to items 17, 21, and 24 |
| Grant, crash, seal, `not-started`, then a new execution under the same reservation | Deferred to items 15, 17, and 24 |
| A refused attempt placed again charges nothing | Covered for a cancelled assignment placed again; refusal handling belongs to item 21 |
| Supersession of an unacknowledged, unreachable, or pressured assignment; none with a grant | Covered: an unreachable worker, admission pressure before and after its bound, and a grant against PostgreSQL; both time bounds in `isSupersessionDue` unit tests |
| Expiry or revocation of a grant, a cancellation request, a failover release nothing | Covered for a cancellation with a running execution; the rest belongs to items 17 and 24 |
| Delegation depth, chain, budget, and shared budgets | Covered for depth 4, the chain rule, and the ninth attempt; session identities belong to G3 |
| Third automatic retry and retry of uncertain execution; backoff | Covered |
| Worker-side slot, journal, and disk limits | Item 20 |
| Hard controls placed only on declaring workers; spend limit | Covered |
| Lowered quota or capacity releases nothing | Covered implicitly: quota changes release nothing because nothing but a release transition writes a reservation |
| Four delegating roots and waiting parents on every slot | The waiting-parent rule is covered with the last slot; the four-root scenario is deferred to item 24 |
| Cancelling an acknowledged assignment without a grant; with a started execution | Covered (offered without a grant, authorized execution) |
| One project's retries do not starve another | The fair order is unit-tested; the scheduling loop belongs to a later item |
| Exhausted provider credential makes the next attempt wait | Covered |

## Independent review

Assigned reviewer: Claude Code with `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, the prompt on stdin, run from the worktree; prompt and output files were kept outside the worktree.

- **Pass 1 — session `bac88f9d-0cd2-40f4-8457-6178e97d125c`, reviewed `77f89a5` (diff `a1a27a1...HEAD`).** A first invocation ended with `Error: No messages returned from query` and produced no session, output, or review, so it is not counted; the same prompt was run again. `modelUsage` lists `claude-fable-5-1`. SHA-256 snapshots before and after were equal (`0a89e1a8…f6dda`). The reviewer reran strict validation, the boundary and comment checks, and the 19 Scheduling unit tests. Findings: 0 Critical, 2 High, 3 Medium, 13 Low. Resolutions, in `dbdf9a6`:
  1. High: cancelling with a running execution requested cancellation but left the grant standing. The cancellation now revokes the owning execution's grants with `attempt-not-launchable` (an invalidating writer), which also requests the attempt's cancellation; the test checks the revoked grant.
  2. High: `releaseAfterTerminalFact` opened its own transaction, so it could not run in the one recording the terminal fact. The operations are now `placeInTransaction`, `cancelInTransaction`, `releaseInTransaction`, and `supersedeInTransaction` on a `CapacityTransaction`, which the service wraps; the test records `not-started` and releases in one transaction.
  3. Medium: provider credentials were stored but not counted. Each credential is checked against its default concurrency of 4 (`provider-concurrency-exhausted`), from a new `provider_credentials` column, with a test.
  4. Medium: the automatic retry rule only checked that the earlier attempt ended. It now needs an outcome of `not-started` or `exited` with a proven start and a released reservation, with tests for the allowance, an unknown earlier attempt, and an accepted retry.
  5. Medium: delegation admission trusted the parent task and attempt pair. It checks that the attempt is the parent's active, uncancelled attempt, with a test.
  6. Low: the request checks precede the worker checks. Recorded with the reason in the contract's section 13.
  7. Low: any task read failure became `attempt-not-reservable`. Only `not-found` does.
  8. Low: a missing root lineage fell back to the child's run. It is `attempt-not-reservable`.
  9. Low: a loser stopped by the held-reservation index got `conflict`. It is mapped to `attempt-already-reserved`.
  10. Low: `task_lineage` had no index by run. Added.
  11. Low: `chargedRuns` was written three times. One domain export serves all.
  12. Low: placement read lineage and charges twice. They are read once.
  13. Low: the in-memory ledger deleted closed delegations and took the concrete lineage class. Closed delegations stay recorded, the port is accepted, and the suite reopens a closed one.
  14. Low: a derived parameter type stood for `ProjectId`. Replaced.
  15. Low: the contract's status still said no code implemented it. Updated.
  16. Low: task 3.2 was open. Ticked after `make verify`.
  17. Low: no mapping of contract section 12's tests. The table above records what is covered and deferred.
  18. Low: `SELECT *` on tables item 13 will extend. Columns are listed.

- **Pass 2 — session `4a7d050a-cb65-4398-a780-55de51f3dd30`, reviewed `c7cef3c` (diff `a1a27a1...HEAD`).** A first invocation again ended with `No messages returned from query` and no session, and is not counted. `modelUsage` lists `claude-fable-5-1`. Snapshots before and after were equal (`83fa6330…079a1`). The prompt named pass 1's session; the reviewer confirmed all 18 resolutions, reran strict validation, the boundary and comment checks, and the Scheduling unit tests. Findings: 0 Critical, 1 High, 2 Medium, 14 Low. Resolutions, in `abf7034`:
  1. High: the delegation test's last call waited from a fixed instant, so it would turn from waiting to rejected after 09:10 UTC that day. Every delegation in the test now waits from the database clock's time.
  2. Medium: placement did not check the ownership generation. The request carries the generation the scheduler claimed, and a stale one fails with `conflict` before anything is written, with a test.
  3. Medium: an active assignment whose attempt ended had no release path. `releaseInTransaction` ends it with `attempt-ended`, releases, and tells the worker, with a test in the transaction that records the attempt's end.
  4. Low: the credential count could not use the GIN index. It uses `@>`.
  5. Low: an automatic retry need not name the attempt it retries. It must equal the active attempt's `retryOf`, or the placement fails with `precondition-failed`; the fixture opens the retry with `retryOf`.
  6. Low: an `exited` attempt whose spawn failed counts as uncertain. Kept as a conservative choice and recorded in the contract's section 13.
  7. Low: every `conflict` from adding the assignment became `attempt-already-reserved`. Only one naming the attempt does.
  8. Low: a delegating attempt without a reservation could delegate. It fails with `precondition-failed`, with a test.
  9. Low: the contract and the operational targets omitted an unknown worker from supersession. Added.
  10. Low: the proposal promised a suite for every port. It names `InstallationGuard` as tested directly.
  11. Low: the placement requirement did not list lineage, ownership, and credentials. It does.
  12. Low: `reserveWithRetry` took two functions as parameters. A `RetryTiming` goes to the constructor.
  13. Low: a commit of unknown outcome was retried. It is not.
  14. Low: a local name shadowed the `outcome` helper. Renamed.
  15. Low: a dead fallback for the end reason. Callers pass the reason.
  16. Low: the delegation decision used non-null assertions and lookup closures. The chain is a non-empty tuple and each charged run is passed with its quota and waiting units.
  17. Low: `task_lineage` allowed a parent at depth 0 or none below it. A CHECK requires a parent exactly below depth 0.

- **Pass 3, the last allowed pass — session `b155c2e8-dddc-4e9f-9e76-d9d45989920f`, reviewed `e531ce6` (diff `a1a27a1...HEAD`).** `modelUsage` lists `claude-fable-5-1`. Snapshots before and after were equal (`b9b9983a…979e1`). The reviewer confirmed all 17 pass 2 resolutions and reran strict validation, the boundary and comment checks, and the Scheduling unit tests. Findings: 0 Critical, 0 High, 2 Medium, 12 Low. Fixed in `e3b6e19`; **these fixes have not been independently reviewed**, and because Medium findings remain after the third pass, the governance process sends them to the owner through the coordinator:
  1. Medium: `attempt-already-reserved` and `attempt-not-reservable` were rejecting reasons, though the contract gives them no outcome. They are standing reasons with the outcome kind `standing`; the specification, the contract's section 13, and the tests say so.
  2. Medium: the supersession time bounds had no test. The rule is the pure `isSupersessionDue`, unit-tested at both bounds and for gone workers, and an integration test supersedes an accepted assignment only after 10 minutes of admission pressure.
  3. Low: delegation read the database clock twice. Once.
  4. Low: delegation did not check the parent's ownership generation. The request names it, and a stale one fails with `conflict`, with a test.
  5. Low: the delegation requirement omitted the reservation condition. Added.
  6. Low: the in-memory ledger ignored the close time. It records `closedAt`.
  7. Low: a root's lineage need not name itself as root. A CHECK requires it.
  8. Low: an automatic retry was compared with the active attempt's `retryOf`. It is compared with the requested attempt's.
  9. Low: safe retries are judged by a certain outcome only. The contract's section 13 says that side effects are not judged in G2.
  10. Low: the placement snapshot was built inline. `readPlacementSnapshot` and `retryStanding` build it.
  11. Low: a test helper took untyped overrides. They are `Partial<WorkerPlacementRecord>`.
  12. Low: `value`, `must`, and `id` helpers are repeated in four test files. Not changed in this diff: a shared helper in `@taskelith/testing` is a follow-up.
  13. Low: `releaseInTransaction` reports `precondition-failed` when nothing is due. Its comment states when to call it; an outcome that distinguishes kept from released is left to item 21, its caller.
  14. Low: the section 12 table called the time bounds unit-level constants. It names the new tests.

## Limitations

- Checks ran on macOS arm64 only; Linux runs in CI.
- Items 13, 20, and 21 do not yet write the workers, installation, and delegation records; tests seed them.
- The scheduling loop that drives waiting tasks and picks candidate workers, and refusal handling, belong to later items.

## Decision on the pass 3 findings

On 2026-10-25 the coordinator reported the decision on the findings left after the third pass, made not by the owner but by a Fable 5.1 (medium) subagent acting on the owner's delegation: option (a), accept the fixes in `e3b6e19` as they are, without a fourth pass, and merge. The delegate checked the `e3b6e19` diff and found it bounded. The fixes in `e3b6e19` remain **not independently reviewed**. Two Low findings of pass 3 are follow-ups for later items, not part of this change: shared `value`, `must`, and `id` test helpers in `@taskelith/testing` (finding 12), and a release outcome that tells kept from released for item 21, its caller (finding 13).

## Remaining gates

Follow-ups for later items: shared test helpers in `@taskelith/testing` (pass 3 finding 12) and a release outcome that distinguishes kept from released (finding 13, item 21); integration into `dev` and archive by the coordinator; promotion to `main`.
