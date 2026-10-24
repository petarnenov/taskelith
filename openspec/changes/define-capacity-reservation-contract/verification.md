# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

G2 work plan item 6, assigned by the coordinator under the owner's decision of 2026-10-25 that G2 starts when the G1 closure merges and decision D14 (a). Base revision: `ddef6d2` on `dev`. Scope: `docs/contracts/capacity-reservation.md` (new), the `capacity-reservation` spec, and this change. Documentation and specification only. Prepared in a git worktree.

## Author self-check before review

- Every element of item 6's scope has a section: transactional reservation of worker slots and requested resources (3, 4), project and run quotas (2, 4), delegated child budgets (7), release only with a justified lifecycle transition (6), capacity held by lost-contact attempts (6), races between scheduler replicas (4), worker-side hard admission limits (8), fail-closed behavior for unenforceable controls (9), the numbers of the operational targets (2, 8), and subscription account slots as the G3 extension point (10).
- Consistency with the merged launch authorization contract: the compared value "the reservation the assignment holds, still held for this attempt on this worker" is defined in section 3; release is a `SERIALIZABLE` invalidating writer that reads grants and non-terminal executions by assignment and writes cancellations (section 6); the rejection reason stays `capacity-not-reserved`. No name changed.
- Items 4 and 5 are referenced by item name, not by file, because they are written in parallel.
- Each requirement is under 500 characters (489 at most after pass 2).
- Evidence check: the only external link is the PostgreSQL 18 documentation of serializable isolation (the decided major version, D1), official upstream documentation; every number is taken from `docs/operational-targets.md` section 1.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed, including strict validation and the archive dry-run of this change; re-run after the pass-1 and pass-2 fixes and after the unreviewed pass-3 Low fixes with the same result.

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
- **Pass 2 — session `735d0ccc-c5ce-4e31-be46-be01848100f9`, on `d6ebfd2`.** A first invocation ended with "No messages returned from query" and no review output; it is not counted as a pass, and the invocation was repeated unchanged. Snapshot before and after: `7d67d36af31bf31eddf9e8159c6f764ae8a026a5f554dea6443d7ddf02b415b0`, equal. Pass-1 findings 1–5, 7, and 9–11 confirmed resolved; 6, 8, and 10 resolved with follow-ups below. Findings: 0 Critical, 0 High, 2 Medium, 12 Low. All accepted and resolved:
  1. Medium: a delegating attempt waiting for its child keeps its reservation, so under the default run quota of 2 a chain deeper than 1 could wait forever. A child whose chain of `d + 1` units exceeds the smallest of the project, root run, and own run quotas is rejected at creation with `delegation-depth-exceeded`; the effective default depth of 1 is raised with the owner through the coordinator. Test and scenario added.
  2. Medium: a grant-less assignment whose worker never acknowledges it, or becomes unreachable, draining, or revoked, held capacity without an automatic path. Bounded supersession (section 6) now covers every assignment with no grant, with bounds fixed by item 18; test and scenario added.
  3. Low: reachability was read but not in the serializable-writer list. Added.
  4. Low: one reason carried a waiting and a rejecting outcome. The spend case is now `spend-limit-not-enforceable`.
  5. Low: "waits if a declaring worker may enroll" was not checkable. Now an unconditional wait with `control-not-enforceable`.
  6. Low: the daemon-overhead row did not report admission pressure. It does.
  7. Low: the authentication of the delegating attempt was undefined. The request is authenticated as the worker principal and names an attempt that worker owns at the current generation.
  8. Low: "a session has at most one active attempt" was asserted. It is an obligation on item 7, or G3 counts sessions.
  9. Low: the design did not record that each child attempt holds its own reservation. Design decision 5 records it.
  10. Low: a scenario counted reservations, not held ones. Fixed.
  11. Low: a requirement read as charging quotas once. Split into the once-only budget charge and per-reservation occupancy.
  12. Low: the spec's disk floor omitted "free" and "whichever is larger". Fixed.
  13. Low: task 2.1 was unchecked. Checked.
  14. Low: the worker `control-not-enforceable` row narrowed section 6. Now "release under section 6".
- **Pass 3 — session `37728f66-94ac-4672-aa3e-820054571f6a`, on `c6f5a1e`.** Snapshot before and after: `85c847e4c4d384edebdc94ed16be85ab4410cf33de39e0215d5b7d89b0f74677`, equal. Every pass-1 and pass-2 finding confirmed resolved, pass-2 finding 1 for a single chain only (new finding 1). Findings: 0 Critical, 1 High, 1 Medium, 7 Low.
  1. High, open: several delegating attempts waiting for their children can hold every unit of a project or run quota, or every fleet slot, so that no child can be reserved; nothing supersedes a waiting parent. The reviewer proposes admitting a delegation only while waiting parents leave at least one unit free in every scope it charges. Sent to the owner through the coordinator.
  2. Medium, open: cancelling an acknowledged assignment with no grant on a healthy, reachable worker has no defined release path, and "a cancellation request on its own" reads as contradicting the list of assignment ends. The reviewer proposes that the cancellation transaction read grants at `SERIALIZABLE` like supersession and release when there are none. Sent to the owner through the coordinator.
  3. Low, unreviewed fix: operator reconciliation released without ending the assignment. It now records the outcome and ends the assignment in the same transaction.
  4. Low, unreviewed fix: supersession of an acknowledged assignment did not reach the worker. It writes an assignment-ended command, and the worker also ends the assignment on `assignment-not-active`.
  5. Low, unreviewed fix: the refusal clause excluded refusals after an earlier grant. A refusal ends the assignment and release follows section 6.
  6. Low, unreviewed fix: the chain check compared `d + 1` with the child's own run quota. It now counts per scope the units the chain holds there, with its own reason `delegation-chain-exceeds-quota`.
  7. Low, unreviewed fix: `worker-slots-exhausted` did not affect eligibility. A slot or capacity refusal makes the worker ineligible until its next declaration or a terminal execution.
  8. Low, unreviewed fix: the writer list omitted the attempt's admission and terminal state. Added.
  9. Low, unreviewed fix: the worker did not check the sum of CPU and memory. It refuses with `worker-capacity-exhausted` when the sum exceeds its host capacity less the daemon ceiling.

## Remaining gates

The owner's decision on pass-3 findings 1 and 2, and on the effective delegation depth under the default run quota (pass-2 finding 1). Integration into `dev` and archive; items 18, 20, and 24 implement the section 12 tests; items 4 and 5 confirm the launch record seal and the journal counts this contract relies on.
