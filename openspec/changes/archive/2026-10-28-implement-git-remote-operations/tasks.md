## 1. Change

- [x] 1.1 Save the brief's `checklist.json` and the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Record the coordinator decisions Q1 (a) and Q2 (a) of 2026-10-28 in the design

## 2. Fail-before tests

- [x] 2.1 Add the API as stubs that throw: `readRemoteHead`, `push`, `GitRunner.withTimeLimit`, `parseCommitParents`, `gitTimeLimitMs`
- [x] 2.2 Replace the dumb-HTTP fixture with a smart-HTTP server behind its own credential check, run the 9 deferred conformance cases, add the adapter, runner, and parser tests, and record their failing run

## 3. Implementation

- [x] 3.1 Add `http.followRedirects=false` to `GIT_COMMAND_SCOPE_SETTINGS`
- [x] 3.2 Add the time limit and the process group to `GitRunner`
- [x] 3.3 Implement `readRemoteHead` and the leased push with the verified ancestry check
- [x] 3.4 Amend contract sections 7 and 13

## 4. Records and checks

- [x] 4.1 Write the proposal, the design, the spec delta, and this task list
- [x] 4.2 Route the change, run `make verify` and `make record`, and write `verification.md`

## 5. Review and archive

- [x] 5.1 Review passes with reviewers A and B, recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [x] 5.2 Archive the change in the last commit of the branch
