## 1. Implement

- [x] 1.1 Add the `Makefile` with `verify`, `toolchain`, and `hooks`.
- [x] 1.2 Add the executable `.githooks/pre-push` hook.
- [x] 1.3 Restrict workflow triggers to `main` and replace the check steps with `make verify`.
- [x] 1.4 Update `docs/releases.md`, `AGENTS.md`, `README.md`, and `docs/governance.md`.

## 2. Verification and review

- [x] 2.1 Run `make verify` with the pinned toolchain, show the mismatch failure, demonstrate the hook blocking a push, and check the workflow YAML and trigger semantics.
- [x] 2.2 Obtain independent review (Antigravity Argon medium; one pass, 0 findings) and record results.

## 3. Rollout

- [ ] 3.1 Merge into `main` through the current flow.
- [ ] 3.2 Create and push `dev` from the updated `main`.
- [ ] 3.3 Make `dev` the default branch and confirm that a push to `dev` starts no workflow.
