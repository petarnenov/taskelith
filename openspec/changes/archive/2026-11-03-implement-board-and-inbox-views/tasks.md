## 1. Change

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, save the brief's checklist as `checklist.json`, and summarize it in `design.md`
- [x] 1.2 Write the design with the coordinator's decisions Q1 to Q6

## 2. Modules

- [x] 2.1 Execution: the card store port with conformance cases and the in-memory adapter, and the stage rules
- [x] 2.2 Integrations: the empty merge queue adapter

## 3. PostgreSQL

- [x] 3.1 Migration `1792934100000`, the card store and projection state over PostgreSQL, the touch triggers, and the crash point `CardProjectionCommit`

## 4. Control plane

- [x] 4.1 The board, task detail, and inbox read models over one snapshot per view
- [x] 4.2 The card projector in the numbering pass
- [x] 4.3 The six routes, their handlers, and the composition

## 5. Tests

- [x] 5.1 Module, conformance, PostgreSQL, crash-point, view, projector, and HTTP tests of the design's test plan, with fail-before evidence

## 6. Verification and review

- [x] 6.1 Route the change, run `make verify`, and record `verification.md` with `make record` and `make record-check`
- [x] 6.2 Review pass 1 by reviewer A, and its fix round
- [x] 6.3 Review pass 2 by reviewer B, unless pass 1 is Low-only, and its fix round
- [x] 6.4 Review pass 3, which governance "Review sequence" runs when pass 2 reports a Medium-or-higher finding

## 7. Archive

- [x] 7.1 Archive the change in the last commit of the branch
