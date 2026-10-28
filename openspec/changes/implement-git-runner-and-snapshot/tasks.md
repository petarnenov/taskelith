## 1. Change

- [x] 1.1 Keep the brief's `checklist.json` and the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Record the coordinator's scope correction of 2026-10-28 in the proposal

## 2. Fail-before tests

- [x] 2.1 Add the package `@taskelith/git-workspace` with its API as stubs that throw
- [x] 2.2 Add the tests of the runner, the gate, the parsers, the checkout checks, the rewrite, the local operations, the crash points, and the conformance run, and record their failing run

## 3. Implementation

- [x] 3.1 Export `gitProcessProblems` and `ExpectedGitProcess` from `@taskelith/workspace`
- [x] 3.2 Implement `GitRunner`, `scrubCredential`, and `succeeded`
- [x] 3.3 Implement `verifyGitClient` and `VerifiedGitClient`
- [x] 3.4 Implement `parsePorcelainStatus`, `parseTreeListing`, `parseBatchObjects`, and `snapshotTree`
- [x] 3.5 Implement `checkCheckoutSafety`, `repositoryConfigText`, and `writeRepositoryConfig`
- [x] 3.6 Implement `GitWorkspaces`: `prepare`, `list`, `inspect`, `snapshot`, `remove`, and `sweep`, with the crash points `WS1` to `WS4`
- [x] 3.7 Regenerate the dependency inventory

## 4. Records and checks

- [x] 4.1 Write the proposal, the design, the spec delta, and this task list
- [x] 4.2 Run `make verify` and `npm run openspec -- validate implement-git-runner-and-snapshot --strict`, and check the archive in a scratch copy
- [x] 4.3 Write `verification.md`

## 5. Review and archive

- [x] 4.4 Fix the findings of review pass 1 with fail-before tests, amend contract sections 2, 3, 6, and 7, and modify the living requirements "Git directory safety" and "Git configuration scope"
- [ ] 5.1 Review passes with reviewers A and B, recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 5.2 Archive the change in the last commit of the branch
