# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

G2 work plan item 6, assigned by the coordinator under the owner's decision of 2026-10-25 that G2 starts when the G1 closure merges and decision D14 (a). Base revision: `ddef6d2` on `dev`. Scope: `docs/contracts/capacity-reservation.md` (new), the `capacity-reservation` spec, and this change. Documentation and specification only. Prepared in a git worktree.

## Author self-check before review

- Every element of item 6's scope has a section: transactional reservation of worker slots and requested resources (3, 4), project and run quotas (2, 4), delegated child budgets (7), release only with a justified lifecycle transition (6), capacity held by lost-contact attempts (6), races between scheduler replicas (4), worker-side hard admission limits (8), fail-closed behavior for unenforceable controls (9), the numbers of the operational targets (2, 8), and subscription account slots as the G3 extension point (10).
- Consistency with the merged launch authorization contract: the compared value "the reservation the assignment holds, still held for this attempt on this worker" is defined in section 3; release is a `SERIALIZABLE` invalidating writer that reads grants and non-terminal executions by assignment and writes cancellations (section 6); the rejection reason stays `capacity-not-reserved`. No name changed.
- Items 4 and 5 are referenced by item name, not by file, because they are written in parallel.
- Each requirement is under 500 characters (434 at most).
- Evidence check: the only external link is the PostgreSQL 18 documentation of serializable isolation (the decided major version, D1), official upstream documentation; every number is taken from `docs/operational-targets.md` section 1.

## Checks

In the worktree, Node v24.22.1: `make verify` (result below).

## Independent review

Assigned reviewer (rotation): Claude Code, `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`.

## Remaining gates

Integration into `dev` and archive; items 18, 20, and 24 implement the section 12 tests; items 4 and 5 confirm the launch record seal and the journal counts this contract relies on.
