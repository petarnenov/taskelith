## 1. Fix

- [x] 1.1 One file system probe, `findmnt` with a `stat -f` fallback, in `scripts/native-acceptance.ts`
- [x] 1.2 The same probe in the `platform` row of `scripts/installation-scenarios.sh`
- [x] 1.3 `native-worker-acceptance` delta: the mount's type and the fallback
- [x] 1.4 Review pass 1 (M1): the same probe in `volume_of`'s Linux branch

## 2. Tests

- [x] 2.1 The Linux platform test expects `ext4`; it failed on the `stat`-only code
- [x] 2.2 The probe against stub `findmnt` and `stat` programs, including the fallback
- [x] 2.3 The installation `platform` row names `ext4`, falls back to `stat`, and uses the same probe
- [x] 2.4 `volume_of` names `ext4`; it failed on the `stat`-only code

## 3. Records

- [x] 3.1 Proposal, design, `verification.md`, and `findings.jsonl` with the review findings
- [x] 3.2 `npm run openspec -- validate fix-platform-probe-filesystem-label --strict` and `make verify`
- [x] 3.3 Independent review pass 1 (1 Medium), fixed
- [x] 3.4 Independent review pass 2 (pass 1 resolved; 1 Low), fixed without re-review
- [x] 3.5 Archive with the pinned CLI and the worker step 7 checks
