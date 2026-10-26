## 1. Inspection

- [x] 1.1 List the G2 rows of the native acceptance gates and the existing proof of each row and matrix entry (24a, 24b, 25a, items 14 and 15); identify D1 and the open rows

## 2. Recorder and runner

- [x] 2.1 Add the optional `acceptance` context (`TASKELITH_ACCEPTANCE`) and the targets `host-test-suite` and `linux-test-container` to the scenario recorder, with tests
- [x] 2.2 Add `scripts/native-acceptance.ts` (entry, platform, context, record) and `scripts/native-acceptance.sh`, with tests
- [x] 2.3 Build the Linux test image for the Docker host's architecture; add `make linux-test-image`, `make linux-test-suites`, and `PATTERN` for `make verify-linux-cgroup`
- [x] 2.4 Add `make native-acceptance`

## 3. Minimal proofs

- [x] 3.1 `make scenario-worker-lifecycle`, with stub tests
- [x] 3.2 `make scenario-native-worker-lifecycle`, with stub tests
- [x] 3.3 Journal tests for data roots with spaces and case-variant paths

## 4. Evidence and records

- [ ] 4.1 Run `make native-acceptance` on macOS 26 arm64 and Linux arm64 under Docker Desktop and commit `results.jsonl`
- [ ] 4.2 Write `acceptance.md`, the acceptance table
- [ ] 4.3 Update `docs/local-installation.md`, `docs/worker-platforms.md`, and the Ubuntu register row
- [ ] 4.4 Run `make verify` and record `verification.md`
- [ ] 4.5 Independent review (pending; assigned by the coordinator)
