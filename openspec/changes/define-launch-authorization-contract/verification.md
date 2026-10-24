# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

G2 work plan item 3, started under the owner's decision of 2026-10-25 that G2 starts when the G1 closure merges and decision D14 (a). Base revision: `2d3b175` on `dev`. Scope: `docs/contracts/launch-authorization.md` (new), the `launch-authorization` spec, and this change. Documentation and specification only. Prepared in a git worktree.

## Author self-check before review

- Every element of item 3's scope has a section: linearization point (3), compared values (2), journaled operation ID (5), TTL and skew (6), expiry and re-authorization (5, 6), invalidation ordering (4), clock-independent safety (6).
- The contract follows architecture sections 6 and 9, the trust model's `launchAuthId` binding, the operational targets, invariant 13, F17, R27, and decisions D7 (c) and D12 (a).
- Items 4, 5, and 6 are referenced by item name, not by file, because they are written in parallel.
- Each requirement is under 500 characters (379 at most after pass 1).
- Evidence check: the only external link is the PostgreSQL 18 documentation of serializable isolation, added after pass 1; it is the official documentation of the decided major version (D1).

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed, including strict validation and the archive dry-run of this change; re-run after the pass-1 fixes with the same result.

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
- **Pass 2.** Pending.

## Remaining gates

Independent review; integration into `dev` and archive.
