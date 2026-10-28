## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design with its coordinator questions, the spec deltas, and this task list
- [x] 1.3 Record the coordinator's answers to the questions of the design, and amend `docs/contracts/git-workspace.md` where an answer says so

## 2. Implementation and tests

- [x] 2.1 Settings: the separate-account slot rule, its start refusal with `TASKELITH_WORKER_SLOTS` above `1`, and one declared slot when the variable is unset, with fail-before tests
- [x] 2.2 The start check of `fs.protected_hardlinks` behind an injected reader, with fail-before tests
- [x] 2.3 The composition of the Git workspace adapter: the Git client gate, the reclaim host of the platform, the execution group of the worker journal adapter, the umask `0007`, and the `sweep` on start
- [x] 2.4 Slot admission: a handed-off workspace holds its slot until its reclaim, counted through `handedOff`, and the capacity is declared again after the reclaim, with fail-before tests
- [x] 2.5 `reclaim-failed` handling and the scan's exclusion of a recorded reclaim containment, with fail-before tests
- [x] 2.6 The worker container's start gives the worker identity the execution group as a supplementary group
- [x] 2.7 The macOS composition and its host tests; the Linux composition's tests in the worker image

## 3. Records and checks

- [ ] 3.1 Merge `origin/dev`, run `make verify`, route the change, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes with reviewers A and B, recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Archive the change in the last commit of the branch
