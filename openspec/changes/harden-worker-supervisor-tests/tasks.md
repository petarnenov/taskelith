## 1. Reaped real-process tests

- [x] 1.1 Reproduce the hang with a deliberately wrong assertion (not committed)
- [x] 1.2 `ProcessReaper`: kill recorded supervisors and children with a matching identity, then tracked scenarios, with a bounded wait
- [x] 1.3 macOS and Linux privileged tests: track scenarios, watch record stores, reap after each test, bound each test
- [x] 1.4 Prove a fast failure with the same wrong assertion and with a stuck wait (not committed)

## 2. Narrowed exit types

- [x] 2.1 `ExecutionExit` and `ExitRecord` as unions of two exit ends
- [x] 2.2 `readExit` builds the narrowed type through a type guard
- [x] 2.3 Callers: a test that spread a clean exit with another status
- [x] 2.4 Type-level negative tests for both types

## 3. Records

- [x] 3.1 Spec deltas, `verification.md`, `make verify`
