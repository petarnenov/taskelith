# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

G2 work plan item 6, assigned by the coordinator under the owner's decision of 2026-10-25 that G2 starts when the G1 closure merges and decision D14 (a). Base revision: `ddef6d2` on `dev`. Scope: `docs/contracts/capacity-reservation.md` (new), the `capacity-reservation` spec, and this change. Documentation and specification only. Prepared in a git worktree.

## Author self-check before review

- Every element of item 6's scope has a section: transactional reservation of worker slots and requested resources (3, 4), project and run quotas (2, 4), delegated child budgets (7), release only with a justified lifecycle transition (6), capacity held by lost-contact attempts (6), races between scheduler replicas (4), worker-side hard admission limits (8), fail-closed behavior for unenforceable controls (9), the numbers of the operational targets (2, 8), and subscription account slots as the G3 extension point (10).
- Consistency with the merged launch authorization contract: the compared value "the reservation the assignment holds, still held for this attempt on this worker" is defined in section 3; release is a `SERIALIZABLE` invalidating writer that reads grants and non-terminal executions by assignment and writes cancellations (section 6); the rejection reason stays `capacity-not-reserved`. No name changed.
- Items 4 and 5 are referenced by item name, not by file, because they are written in parallel.
- Each requirement is under 500 characters (450 at most after pass 1).
- Evidence check: the only external link is the PostgreSQL 18 documentation of serializable isolation (the decided major version, D1), official upstream documentation; every number is taken from `docs/operational-targets.md` section 1.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed, including strict validation and the archive dry-run of this change; re-run after the pass-1 fixes with the same result.

## Independent review

Assigned reviewer (rotation): Claude Code, `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, with the prompt naming the criteria and asking for every instance with severity, file, line, and fix. The model is confirmed by `claude-fable-5-1` as the only key of the JSON `modelUsage`. SHA-256 snapshots of the worktree (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) before and after each pass are recorded below.

- **Pass 1 — session `35da931c-32f8-46cb-9d1c-9d6dd7fce4f1`, on `d86d44b`.** Snapshot before and after: `c230720f5d48280a76cb8eca500111d3c7c175b088496a9f7992665812589ddf`, equal. Findings: 0 Critical, 3 High, 3 Medium, 5 Low. All accepted and resolved:
  1. High: releasing at `not-started` while the assignment stayed active made the re-authorization that launch authorization allows fail with `capacity-not-reserved`. Release now needs both an ended assignment and no non-terminal execution under it; `not-started` alone keeps the reservation, with a test and a scenario.
  2. High: ending an assignment raced with an authorization could release capacity while a granted execution might spawn. The transaction that ends the assignment releases only when no execution under it is non-terminal; otherwise the end is a cancellation and the execution's terminal fact releases. The spec scenario of revocation on release is limited to operator reconciliation.
  3. High: consumption charged per reservation let refusals and re-placements exhaust the delegation budget. Consumption is charged once per attempt by a record unique per `attemptId`, with a test and a scenario.
  4. Medium: serializable ordering was claimed against writers not required to be serializable. Every writer of a value the reservation transaction reads now runs at `SERIALIZABLE`, in the contract and the spec.
  5. Medium: the worker's slot count ignored acknowledged assignments without an execution. It now counts them, once per attempt.
  6. Medium: an acknowledged assignment under admission pressure could hold capacity without bound. After a bounded wait (an item 18 parameter) the scheduler may supersede it, with release decided by section 6.
  7. Low: session affinity omitted ADR 0005's reconciliation by policy or an operator, and the spec wording was ambiguous. Both now name the slot the session started on and the reconciliation path.
  8. Low: slot load counted attempts while ADR 0005 counts sessions. Section 10 states that a session has at most one active attempt.
  9. Low: `delegation-depth-exceeded` was attributed to the scheduler, and section 1 said only reconciliation releases. Now task admission, and "only a transition of section 6".
  10. Low: the worker-side `control-not-enforceable` outcome was "wait". A separate row: release if no grant exists and place on another declaring worker.
  11. Low: the `make verify` result and the snapshots were not recorded. Recorded here.

## Remaining gates

Integration into `dev` and archive; items 18, 20, and 24 implement the section 12 tests; items 4 and 5 confirm the launch record seal and the journal counts this contract relies on.
