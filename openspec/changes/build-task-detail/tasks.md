## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json` (`--size M-L`), and add the empty `findings.jsonl` and `passes.jsonl`

## 2. Tests and implementation

- [x] 2.1 `readTaskDetail` in the board port and its control-plane adapter, with the body checks and the label records
- [x] 2.2 Task detail feed: re-read above the detail's position, one read at a time, no data after a failure
- [x] 2.3 Task detail route as a child of the board, its Drawer, content, and states
- [x] 2.4 Follow-ups: the address's project in the picker, the shared reduced-motion loading status in the shell, and card links
- [x] 2.5 Contrast pair of the card link
- [x] 2.6 Tests committed before the implementation, with fail-before evidence for the base and targeted mutations

## 3. Records and checks

- [x] 3.1 Write the proposal, the design, the spec delta, this task list, and the README status
- [x] 3.2 Route the change, run `make verify`, and write `verification.md`
- [x] 3.3 Fix the pass 1 findings with fail-before tests, route again, run `make verify`, and record them
- [x] 3.4 Fix the pass 2 findings with fail-before tests, route again, run `make verify`, and record them

## 4. Review and archive

- [x] 4.1 Review passes recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Architect check by the coordinator of any unreviewed fixes
- [ ] 4.3 Archive the change in the last commit of the branch
