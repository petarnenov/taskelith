## 1. Change

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, save the brief's checklist as `checklist.json`, and summarize it in `design.md`
- [x] 1.2 Write the design with the coordinator's decisions Q1 to Q5

## 2. Modules

- [x] 2.1 Execution: the event records, the publishing port, the event log port with conformance cases and the in-memory adapter
- [x] 2.2 Execution: the session timeline's events in the transaction of each change
- [x] 2.3 Access: the principal changes in the transaction of the change, and `liveUntil`

## 3. PostgreSQL

- [x] 3.1 Migration `1792933900000`, the event log over PostgreSQL, the notifications, and the crash point `EventNumberingCommit`

## 4. Control plane

- [x] 4.1 The stream hub, the assigner and pruning loops, the view positions, and the retention setting
- [x] 4.2 The two routes, their handlers, the wire mapping, and the composition

## 5. Tests

- [x] 5.1 Module, conformance, PostgreSQL, crash-point, hub, HTTP, settings, and composition tests of the design's test plan, with fail-before evidence

## 6. Verification and review

- [x] 6.1 Route the change, run `make verify`, and record `verification.md` with `make record` and `make record-check`
- [x] 6.2 Review pass 1 by reviewer A, and its fix round
- [x] 6.3 Review pass 2 by reviewer B, unless pass 1 is Low-only
- [x] 6.4 Review pass 3, which governance "Review sequence" runs when pass 2 reports a Medium-or-higher finding

## 7. Archive

- [x] 7.1 Archive the change in the last commit of the branch and record the archive checks
