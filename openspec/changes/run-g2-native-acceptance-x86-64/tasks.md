## 1. Setup

- [x] 1.1 Create the change, mirroring 25b's records, with `skip_specs: true`
- [x] 1.2 Check the worker's disk floor on this host and decide on `NATIVE_DATA_PARENT`
- [x] 1.3 Check the runner's prerequisites on this host without writing evidence
- [x] 1.4 Build the checkout before the runner's seed, with a runner test
- [x] 1.5 Cite 25a's x86_64 confinement evidence in the seccomp line of `docs/local-installation.md`

## 2. Evidence and records

- [x] 2.1 Run `make native-acceptance` on macOS 26 x86_64 and Linux x86_64 under Docker Desktop and commit `results.jsonl`
- [x] 2.2 Run `make scenario-worker-namespace-confinement` into the same `results.jsonl` as a recorded extra
- [x] 2.3 Write `acceptance.md`, the acceptance table
- [x] 2.4 Report every failed proof to the coordinator as a candidate defect
- [x] 2.5 Add the x86_64 observations to `docs/worker-platforms.md`, `docs/local-installation.md`, and the Ubuntu register row
- [x] 2.6 Run `make verify` and record `verification.md`
- [ ] 2.7 Independent review by Claude Code (claude-fable-5-1)
