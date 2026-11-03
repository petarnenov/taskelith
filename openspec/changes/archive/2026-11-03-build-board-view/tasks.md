## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json` (`--size M-L`), and add the empty `findings.jsonl` and `passes.jsonl`

## 2. Tests and implementation

- [x] 2.1 Board port, the control-plane adapter of `listProjects`, `readBoard`, and `streamProjectEvents`, and the body checks
- [x] 2.2 Board feed: snapshot, stream after its position, skipped events, resync, stream-ended, closed stream with retry delay, and reads during events
- [x] 2.3 Board page: columns, merge gate, cards, session indicator with reduced motion, and the board states
- [x] 2.4 Project picker in the header and the navbar, kept per browser
- [x] 2.5 `expiryOfRequest` in the session provider and the routing of every unauthenticated board answer
- [x] 2.6 Reserved task-detail route
- [x] 2.7 Contrast pairs of the board and the label-to-enum test
- [x] 2.8 Tests committed before the implementation, with fail-before evidence for the base and targeted mutations

## 3. Records and checks

- [x] 3.1 Write the proposal with the 29a and 29b split, the design, the spec delta, this task list, the plan row, and the README status
- [x] 3.2 Route the change, run `make verify`, and write `verification.md`

## 4. Review and archive

- [x] 4.1 Review passes recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [x] 4.2 Architect check by the coordinator of any unreviewed fixes
- [x] 4.3 Archive the change in the last commit of the branch
