## 1. Native run

- [x] 1.1 Run `make qualify-harnesses OUT=<dir> PLATFORMS=linux/arm64` natively on the Apple Silicon host, outside the worktree

## 2. Records

- [x] 2.1 Add the linux/arm64 results to `docs/qualification/claude-code.md` and remove native linux/arm64 from its open gates
- [x] 2.2 Do the same in `docs/qualification/codex.md`
- [x] 2.3 Drop linux/arm64 from the open Linux gates of both harness rows in `docs/dependencies.md`

## 3. Checks

- [x] 3.1 Strict OpenSpec validation, `make verify`, and `verification.md`
- [ ] 3.2 Independent review (pending)
