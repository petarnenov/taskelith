## 1. Change

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, save the brief's checklist as `checklist.json`, and summarize it in `design.md`
- [x] 1.2 Write the design with the coordinator's decision Q3 (a)

## 2. Modules

- [x] 2.1 Execution: the source's item read and answer scope, the answer key and reconciliation answer ports with conformance cases and in-memory adapters, and the queue's unrecorded processes

## 3. PostgreSQL

- [x] 3.1 Migration `1792934200000` and the adapters of the answer keys and the reconciliation answers

## 4. Control plane

- [x] 4.1 The answer service with its idempotency keys, in one `SERIALIZABLE` transaction
- [x] 4.2 The reconciliation source and its transactional resolver
- [x] 4.3 The two routes, their handler, and the composition

## 5. Tests

- [x] 5.1 Module, conformance, PostgreSQL, concurrency, and HTTP tests of the design's test plan, with fail-before evidence

## 6. Verification and review

- [x] 6.1 Route the change, run `make verify`, and record `verification.md` with `make record` and `make record-check`
- [x] 6.2 Review pass 1 by reviewer A, and its fix round
- [x] 6.3 Review pass 2 by reviewer B, unless pass 1 is Low-only, and its fix round
- [ ] 6.4 Review pass 3, which governance "Review sequence" runs when pass 2 reports a Medium-or-higher finding

## 7. Archive

- [ ] 7.1 Archive the change in the last commit of the branch
