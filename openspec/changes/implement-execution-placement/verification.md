# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 21, part 21a. The coordinating session (Niki) assigned it to the worker session Maki. The reviewer is Codex CLI `gpt-6.1-sol` (medium), assigned by the rotation.
- **Base revision:** `ee7936e` on `dev`. `origin/dev` at `f83e36d` was merged in before review pass 1 to take item 17 (launch authority), as the coordinator asked.
- **Scope:** the placement loop, the candidates query, the placement queue and its query columns, and `requestDelegation` with its persisted state.
- **Out of scope:** 21b, 21c, 21d, and items 20 and 24, as the proposal lists.

## Coordinator decisions

All are from 2026-10-25 and are recorded in the design:
- Split into 21a to 21d (proposal A);
- Q1 (a) to Q6 (a);
- the sequence-gap note.

Later the same day:
- **First contact.** First contact as reachability moves from 21a to 21b for an observation and to 21c for an inventory report, because the consumers that see it come there. The proposal records the move.
- **B8.** Item 18's attempt records `launch-revoked` while its command says `assignment-ended`. This goes to 21d.
- **Merging `dev`.** Merge `dev` before review pass 1, so that the merged diff is reviewed.

## Obligations met

From item 16:
- **Q1:** the placement loop opens the first attempt, picks a worker, and calls the reservation.
- **Q7:** the control-plane side of `requestDelegation`.

From item 18:
- the scheduling loop;
- the persisted wait of a delegation.

## Evidence

- **Environment:** macOS 26.6.2 arm64, Node v24.22.1 (`.nvmrc`), and Docker with the Compose services of `make verify` (PostgreSQL, NATS, Toxiproxy).
- **Dependencies and contracts:** no dependency was added, and no contract changed.
- **Test grants:** they are seeded with `authorizedUnder` (decision Q6) where an execution is needed.
- **Merge resolution:**
  - `ControlPlaneTransaction` extends `CapacityTransaction`, keeps `placements` and `delegations`, and adds item 17's `revisions` and `launches`.
  - Item 17's `revisions.seed` moved into the shared task creation, so delegated children seed their artifacts too.
  - The migration lists order launch authority before execution placement.

## Author self-check

Recorded before pass 1.

- **Placement transaction:**
  - Each task is placed in its own SERIALIZABLE transaction, which reloads it and checks `placementNeed` again.
  - When nothing is placed, the transaction returns an `Err` and rolls back, so the ownership generation does not rise on idle passes.
  - Identities are derived from the task, the attempt number, and the ownership generation, so a rerun reuses them.
  - Tests:
    - a single pass that writes the attempt, the assignment, and the offer once;
    - no capacity;
    - no candidate, where no transaction is opened;
    - a full first candidate;
    - an exhausted quota;
    - a re-placement that claims the next generation;
    - an unplaced active attempt;
    - fair order across projects.
- **Queue:**
  - The columns are derived from `placementNeed` on every task write.
  - The migration backfills them; its test covers a fresh task, a placed attempt with a backslash in its identifier, a running attempt, and an ended attempt.
- **Delegation:**
  - The worker credential is checked again in the transaction.
  - The parent is the task of the attempt for which this worker's assignment holds a reservation at the named generation; otherwise the answer is `forbidden` (403).
  - SDLC admission runs before `admitDelegation`, and only an admitted child is created.
  - A repeat with other values is `conflict`.
  - The author found that a repeat of a decided delegation checked the held reservation first, so it would have answered 403 after the parent ended. Fixed in `d0958be`: a decided delegation is answered as stored, and the integration test releases the parent before repeating.
- **Against ADR 0004:**
  - Hexagonal: pure rules are in the execution and scheduling domains, ports in their modules, adapters in PostgreSQL and in memory with shared conformance suites, and use cases in the control-plane application layer. `make check-boundaries` passes.
  - Coverage: see the checks.
- **Evidence check:** every scenario of the spec delta has an integration test in `apps/control-plane/test/placement.integration.test.ts`. The change validates strictly.

## Checks

`make verify` ran in the worktree with every file tracked:
- At `dc49bcd`, after the merge: 1025 tests passed, 0 failed. Coverage 99.25% lines, 91.61% branches, 99.01% functions. The comment, boundary, coverage-scope, dependency-inventory, contract-compatibility, OpenSpec, and package checks pass.
- At `d0958be`, before pass 1: 1025 tests passed, 0 failed. Coverage 99.25% lines, 91.61% branches, 99.01% functions. Every other check passes.

## Independent review

Pending.

## Limitations

- **No reachable worker until 21b.** No production path marks a worker reachable before 21b, so only tests that seed reachable workers place anything. The HTTP test of `requestDelegation` therefore answers `awaiting-capacity`.
- **Rejected tasks keep waiting.** A task rejected for capacity is tried again on each pass until 21b ends the attempt on a rejecting reason.
- **Task identity collision.** A `submitTask` with the task identity of a delegated child returns the child's admission as a repeat, because the admission identity derives from the run and the task.

## Remaining gates

- Independent review.
- Integration into `dev` and archiving, by the coordinator.
- No deployment validation is claimed.
