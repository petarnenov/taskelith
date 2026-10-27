## 1. Fix

- [x] 1.1 One file system probe, `findmnt` with a `stat -f` fallback, in `scripts/native-acceptance.ts`
- [x] 1.2 The same probe in the `platform` row of `scripts/installation-scenarios.sh`
- [x] 1.3 `native-worker-acceptance` delta: the mount's type and the fallback

## 2. Tests

- [x] 2.1 The Linux platform test expects `ext4`; it failed on the `stat`-only code
- [x] 2.2 The probe against stub `findmnt` and `stat` programs, including the fallback
- [x] 2.3 The installation `platform` row names `ext4`, falls back to `stat`, and uses the same probe

## 3. Records

- [x] 3.1 Proposal, design, `verification.md`, and an empty `findings.jsonl`
- [x] 3.2 `npm run openspec -- validate fix-platform-probe-filesystem-label --strict` and `make verify`
- [ ] 3.3 Independent review pass 1
