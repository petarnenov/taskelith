## 1. Change

- [x] 1.1 Create the change with proposal, design, the `local-installation` spec delta, the checklist, and empty `findings.jsonl` and `passes.jsonl`

## 2. Implementation

- [x] 2.1 Find the mechanism: SIGPIPE (status 141) of the writer of a tar pipe under `pipefail` when the reader exits at the end marker
- [x] 2.2 Drain the stream after `tar` in `unpack_context` and `saved_manifest`
- [x] 2.3 Add `FAKE_TAR_TRAILER` to the fakes and a test that fails before the fix on every run

## 3. Evidence

- [x] 3.1 Fail-before and pass-after of the new test, for each of the two pipes
- [x] 3.2 `make verify` on the clean committed tree: passed on `b350f8ce`

## 4. Review and archive

- [ ] 4.1 Review pass 1 (reviewer A) and its fixes
- [ ] 4.2 Review pass 2 (reviewer B) and its fixes
- [ ] 4.3 Archive the change
