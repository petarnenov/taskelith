## 1. Image variant

- [x] 1.1 Add `infra/installation/harnesses/package.json` and `package-lock.json` with the exact pins and integrity hashes
- [x] 1.2 Add the `harnesses` and `worker-harnesses` targets to `infra/installation/Dockerfile`; leave `worker` unchanged

## 2. Qualification steps

- [x] 2.1 Add `infra/installation/harnesses/qualify.sh` with the credential-free steps
- [x] 2.2 Add `scripts/harness-qualification.sh` and the opt-in `make qualify-harnesses` target
- [x] 2.3 Run it for linux/amd64 (native) and linux/arm64 (QEMU)

## 3. Checks and records

- [x] 3.1 Add `test/harness-image-pins.test.ts` and cover the variant in the composition test
- [x] 3.2 Update `docs/qualification/claude-code.md` and `codex.md`
- [ ] 3.3 `make verify`, independent review, and `verification.md`
