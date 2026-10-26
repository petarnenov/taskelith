## 1. Contract

- [x] 1.1 Write `docs/contracts/git-workspace.md`
- [x] 1.2 Add the `git-workspace-port` spec delta
- [x] 1.3 Point the worker journal and source control contracts to it

## 2. Port types

- [x] 2.1 Add the `@taskelith/workspace` module with `CodeHeadIdentity`, the contract values, and the name, clean-head, and credential-scope rules
- [x] 2.2 Add the `WorkspaceLifecycle`, `WorkspaceHeads`, `TaskBranchPublisher`, and `WorkspaceProvider` ports, the `WorkspaceFixture`, and the conformance suite
- [x] 2.3 Add tests that pin the contract values and run the suite against a temporary-directory double and its defective variants

## 3. Verification and review

- [x] 3.1 Run `make verify`
- [ ] 3.2 Independent review by the assigned reviewer (Codex, `gpt-6.1-sol`, medium effort, read-only)
- [ ] 3.3 Record the review evidence in `verification.md`
