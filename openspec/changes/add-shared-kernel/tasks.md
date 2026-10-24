## 1. Kernel package

- [x] 1.1 Add `packages/kernel` (`package.json`, `tsconfig.json`) with a single public export and no runtime dependencies.
- [x] 1.2 Implement opaque identifiers, the failure vocabulary, the result shape, instants, and event metadata.
- [x] 1.3 Add tests in `packages/kernel/test/` that import `@taskelith/kernel` and cover the compiled package fully.
- [x] 1.4 Add the `shared-kernel` capability.

## 2. Integration with the workspace

- [x] 2.1 Merge `origin/dev` after `establish-g1-workspace` is merged, refresh `package-lock.json` and the dependency inventory.
- [x] 2.2 Run `make verify` in the worktree.

## 3. Review

- [ ] 3.1 Obtain independent review (Claude Fable 5.1 medium, by rotation) and record results.
