## 1. Contract

- [x] 1.1 Revise `docs/contracts/git-workspace.md`: identities and modes, workspace record, hand-off and reclaim, Git processes, Git directory and `safe.directory`, L1 and L2, item 16 tests and obligations
- [x] 1.2 Amend the worker journal and installation contracts for the execution group's traversal
- [x] 1.3 Add the `git-workspace-port`, `worker-journal`, and `worker-journal-adapter` spec deltas
- [x] 1.4 Name the obligations in G3 plan row 16

## 2. Code and tests

- [x] 2.1 Add `WORKSPACE_MODES`, the workspace record, the two failure reasons, and `handOff` and `reclaim` to `@taskelith/workspace`, with two conformance cases and their fixture helpers
- [x] 2.2 Make the test double keep its record outside the checkout, apply the modes, and hand off and reclaim, with three defective variants and its own tests
- [x] 2.3 Add the `executionGroup` option to the worker root with unit tests and a privileged Linux test with real uids

## 3. Verification and review

- [x] 3.1 Run `make verify` and `make verify-linux-cgroup`
- [ ] 3.2 Independent review: pass 1 by reviewer A, pass 2 by reviewer B, pass 3 by reviewer A
- [ ] 3.3 Record the review evidence in `verification.md`, `findings.jsonl`, and `passes.jsonl`
