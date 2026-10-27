## 1. Analysis

- [x] 1.1 Read capacity reservation sections 5 and 13, `RotationCursor`, and the requirement "Project rotation"
- [x] 1.2 Compare options (a), (b), (c), and (a'); the coordinator approved (a)

## 2. Implementation

- [x] 2.1 `PlacementRotation` port, in-memory adapter, and a conformance suite
- [x] 2.2 Migration `1792932500000_placement-rotation` and `PostgresPlacementRotation`, exposed as `rotation`
- [x] 2.3 `PlacementService` reads the stored cursor and writes it in the placing transaction or once at the end of the pass

## 3. Tests

- [x] 3.1 In-memory restart and crash tests, failing before 2.3
- [x] 3.2 Unit tests for a decline-only move, an unchanged cursor after a fleet decline, and a failed end write, failing before 2.3
- [x] 3.3 PostgreSQL restart, conformance, and migration tests
- [x] 3.4 Merge `origin/dev` with `stop-placement-pass-at-fleet-decline` (#348) and adjust to its stop rule

## 4. Records

- [x] 4.1 Contract section 13, spec delta, proposal, design, `verification.md`, empty `findings.jsonl` and `passes.jsonl`
- [x] 4.2 `make verify`
- [x] 4.3 Independent review pass 1 (1 High, 2 Low), fixed in `83c9f799`
- [x] 4.4 Independent review pass 2 (1 Medium, 6 Low), fixed in `d330063b`, L6 deferred
- [x] 4.5 Independent review pass 3 (no findings)
- [x] 4.6 Archive under worker step 7
