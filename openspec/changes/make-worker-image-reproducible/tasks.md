## 1. Change

- [x] 1.1 Create the change `make-worker-image-reproducible`
- [x] 1.2 Diagnose: build the worker image twice from one clean commit, the second without the cache, and diff the layers (design, "Diagnosis")
- [x] 1.3 Record the gate decision (design, "Gate decision")

## 2. Contract first

- [x] 2.1 Spec delta of `local-installation`: modify "Pinned image inputs", add "Opt-in reproducibility check"
- [x] 2.2 Update `docs/local-installation.md`

## 3. Implementation

- [x] 3.1 Tests that fail before the change: the epoch of `build`, the harness build, the reproducibility check, and the Dockerfile clamp
- [x] 3.2 Dockerfile: `SOURCE_DATE_EPOCH` in every stage of the worker image, a clamp at the end of every `RUN`, Node.js unpacked in its download stage
- [x] 3.3 `scripts/installation.sh`: the epoch and `check-reproducible`; `scripts/harness-qualification.sh`: the epoch
- [x] 3.4 `make verify-worker-image-reproducible`

## 4. Verification

- [x] 4.1 Run `make verify-worker-image-reproducible` on a clean commit and record both image IDs
- [x] 4.2 `npm run openspec -- validate make-worker-image-reproducible --strict` and `make verify`
- [x] 4.3 Record `verification.md`

## 5. Review and archive

- [ ] 5.1 Independent review passes assigned by the coordinator (pass 1 done, pass 2 pending)
- [ ] 5.2 Archive the change
