# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

G2 work plan item 3, started under the owner's decision of 2026-10-25 that G2 starts when the G1 closure merges and decision D14 (a). Base revision: `2d3b175` on `dev`. Scope: `docs/contracts/launch-authorization.md` (new), the `launch-authorization` spec, and this change. Documentation and specification only. Prepared in a git worktree.

## Author self-check before review

- Every element of item 3's scope has a section: linearization point (3), compared values (2), journaled operation ID (5), TTL and skew (6), expiry and re-authorization (5, 6), invalidation ordering (4), clock-independent safety (6).
- The contract follows architecture sections 6 and 9, the trust model's `launchAuthId` binding, the operational targets, invariant 13, F17, R27, and decisions D7 (c) and D12 (a).
- Items 4, 5, and 6 are referenced by item name, not by file, because they are written in parallel.
- Each requirement is under 500 characters (394 at most after pass 3).
- Evidence check: the external links are the PostgreSQL 18 documentation of serializable isolation (added after pass 1; the decided major version, D1) and the Linux kernel timekeeping documentation (added after pass 5); both are official upstream documentation.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed, including strict validation and the archive dry-run of this change; re-run after the pass-1, pass-2, pass-3, pass-4, and pass-5 fixes with the same result; before the pass-3 fixes `origin/dev` (`7850c70`, including the comment length check) was merged in without conflicts.

## Independent review

Assigned reviewer (rotation): Codex CLI, `-m gpt-6.1-sol -c model_reasoning_effort="medium" -s read-only`; model and effort confirmed in the session header. SHA-256 snapshots of the worktree before and after each pass were equal.

- **Pass 1 — session `01a1700d-48af-7433-a227-aba19d86846b`.** Findings: 0 Critical, 5 High, 3 Medium, 2 Low. All accepted and resolved:
  1. High: a transport retry could extend the worker's deadline. The deadline now starts from the monotonic reading before the first request of an `operationId`, retries keep it, and a restart never uses a journaled authorization.
  2. High: a timely start reported late became an unauthorized start. Start observations are now decided by authorization and execution, not arrival time, and are idempotent.
  3. High: expiry let a second execution start while the first might be running. New section 4: expiry does not release execution ownership; another execution needs a recorded exit or reconciled `not-started`.
  4. High: a replayed grant could bypass revocation and quarantine. A replay re-checks quarantine, epoch, credential, and the grant's state.
  5. High: the policy comparison had no fixed expected side. The expected value is `admission.policyRevision`, and the request names the immutable expected set.
  6. Medium: the invalidating writers' predicate and retry were undefined. Section 5 defines the predicate per writer kind, the unconditional read, and whole-transaction retry; tests cover bulk writers, empty predicates, and either victim.
  7. Medium: rejection reasons did not cover every check. Section 9 maps each check to a reason, retryability, and scheduler action, adding `assignment-not-active` and `admission-not-current`.
  8. Medium: "not superseded" invented an admission state. Replaced by comparisons on a `used` admission (design decision 7).
  9. Low: the status claimed a reviewed contract. Now "proposed ... under independent review".
  10. Low: no evidence check was recorded. Recorded in the self-check.
- **Pass 2 — session `01a17012-072f-7e51-8166-953933d26ee3`.** Pass-1 findings 1, 2, 4, 5, 8, 9, and 10 confirmed resolved; 3, 6, and 7 partly. Findings: 0 Critical, 2 High, 3 Medium, 0 Low. All accepted and resolved:
  1. High: an execution started under an expired, unreported grant escaped invalidation. Writers now read every non-terminal owning execution and its grants whatever their expiry; expiry changes no recorded state; a test covers the sequence.
  2. High: `not-started` did not stop a later spawn. `not-started` is recorded only after the worker seals the launch record irreversibly; the supervisor spawns at most once per execution across grants; both are stated as obligations on items 4 and 5, with a paused-supervisor test.
  3. Medium: a known grant bound to another execution had no outcome. The start check verifies the binding first; any mismatch is `unauthorized-start`.
  4. Medium: G1 admissions store no gate identities. The relied-on gates are derived from the prerequisite stages of the admission's stage in the run's workflow definition version and recorded in the grant; writers find grants by them.
  5. Medium: generation and subject mismatches had no reason. Added to `admission-not-current` and `gate-not-passed`, with tests.
- **Pass 3 — session `01a17016-eade-7041-83f4-77df56fb7170`.** Pass-1 findings 1 and 3–10 and pass-2 findings 1, 2, 3, and 5 confirmed resolved; pass-1 2 and pass-2 4 partly. Findings: 0 Critical, 2 High, 3 Medium, 0 Low. With the three passes used, the owner decided on 2026-10-25 to fix them and permit a fourth pass. All accepted and resolved:
  1. High: requiring every relied-on gate to have all bound revisions as its subject rejected valid G1 admissions whose gates have different subjects. Each gate's own subject is now compared, by artifact identifier and digest, with the admission's bound revisions.
  2. High: a duplicate start observation after a later execution was authorized could cancel that execution. A recorded start now returns the recorded fact before any ownership check, and an unauthorized start cancels only its own execution.
  3. Medium: planning admissions got prerequisite gates G1 never checked. Relied-on gates are now by admission kind: none for planning.
  4. Medium: start acceptance had no recovery fence. Start observations carry the epoch; outside the current epoch or in quarantine they are kept as evidence for reconciliation only.
  5. Medium: the spec missed four contract guarantees. Added: one spawn across grants, replay only while unexpired and non-terminal, the supervisor's spawn deadline, and no start after the seal, each with a scenario.
- **Pass 4 (permitted by the owner on 2026-10-25) — session `01a17020-9557-7573-94eb-4d0b54e57bff`.** Pass-3 findings 1–3 and 5 confirmed resolved, 4 resolved in the contract. Findings: 0 Critical, 2 High, 1 Medium, 0 Low. The owner decided on 2026-10-25 to fix them and permit a fifth pass. All accepted and resolved:
  1. High: a first start reported after the exit could move an `exited` execution back to `started`. Terminal states never change; a later start is recorded as history.
  2. High: adding a pending gate to a prerequisite stage escaped invalidation. Adding or removing a gate is a writer, found by run and dependent stages.
  3. Medium: the spec cancelled a current-epoch start received in quarantine, which the contract keeps as evidence. The spec now orders the evidence-only, history, and unauthorized cases as the contract does.
- **Pass 5 (permitted by the owner on 2026-10-25) — session `01a17024-9534-7052-946b-8afa426c1f93`.** Earlier findings confirmed resolved except pass-3 4 and pass-4 3, partly. Findings: 0 Critical, 3 High, 2 Medium, 0 Low. Each pass found new edge cases (10, 5, 5, 3, 5), so the owner decided on 2026-10-25 to fix these without another pass and merge; items 17 and 24 implement every scenario of section 10 as a test and pass their own reviews. These fixes are unreviewed:
  1. High: removing the last gate of a prerequisite stage left an empty, trivially passed set. Each prerequisite stage must still have a gate.
  2. High: a monotonic clock that stops during suspend could start under an expired grant. The deadline uses a suspend-inclusive clock (Linux `CLOCK_BOOTTIME`, the macOS continuous clock); without one, unused grants are void after suspend.
  3. High: replay and start observations did not check the grant's worker. Both are bound to the authenticated worker.
  4. Medium: a future epoch could be accepted. Any epoch other than the current one is evidence only.
  5. Medium: the unknown-grant scenario still cancelled in quarantine. Limited to the current epoch outside quarantine, with an evidence-only case.

## Remaining gates

Integration into `dev` and archive; items 17 and 24 implement the section 10 tests; item 4 records the qualified suspend-inclusive clock per OS.
