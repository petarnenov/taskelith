## 1. Fix

- [x] 1.1 Reproduce the silent skip by starting the script through a symlinked path.
- [x] 1.2 Compare the real path of `process.argv[1]` with the module path.
- [x] 1.3 Add a regression test that runs the CLI through a symlinked directory and fails on a violating fixture.

## 2. Verification and review

- [x] 2.1 Run `make verify` under the exact CI pins.
- [x] 2.2 Obtain independent review, resolve findings, and record reviewer, model, effort, session, and results.
