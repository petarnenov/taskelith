## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Record the coordinator's answers to the open questions of the design

## 2. Implementation and tests

- [x] 2.1 Hand-off record, hand-off chain, `handOff`, `reclaim`, and `handedOff` with the crash points `WS5` to `WS10`
- [x] 2.2 The reclaim program, `LinuxReclaimHost`, and `ProcessGroupReclaimHost`
- [x] 2.3 Un-skip the 6 deferred conformance cases, retire the skip list, and run the hand-off cases with an execution account
- [x] 2.4 Adapter tests of the hand-off, the reclaim, and the failed, surviving, and abandoned program, and their failing run against the 16c adapter; on the host each of the 13 crash points `WS5.before` to `WS10.after` kills a worker process by SIGKILL and a new worker recovers, and in the worker image the `WS8` crash of a surviving program does (review pass 1, finding 2)
- [x] 2.5 The pinned Git in the worker image, `make verify-linux-git-workspace`, and the Linux tests, run in the worker image
- [x] 2.6 Rewrite `.git/config` with mode `0660`
- [x] 2.7 The reclaim program's window for `go` and the `abandoned` outcome, with their fail-before tests (coordinator decision Q3)

## 3. Records and checks

- [x] 3.1 Write the proposal, the design, the spec delta, and this task list
- [x] 3.2 Merge `origin/dev`, run `make verify`, route the change, and write `verification.md`

## 4. Review and archive

- [x] 4.1 Review passes with reviewers A and B, recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [x] 4.2 Archive the change in the last commit of the branch
