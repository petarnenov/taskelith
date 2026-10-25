## 1. Images and composition

- [x] 1.1 Add the control-plane and worker images in `infra/installation/Dockerfile`.
- [x] 1.2 Add `infra/installation/compose.yaml` and the broker configuration.
- [x] 1.3 Pin the linux-arm64 Node.js tarball and name the Ubuntu base once in the Makefile.

## 2. Operation

- [x] 2.1 Add `scripts/installation.sh` and the `installation-*` `make` targets.
- [x] 2.2 Add the opt-in `make verify-installation`.

## 3. Checks and documents

- [x] 3.1 Add the composition test to `make verify`.
- [x] 3.2 Add `docs/local-installation.md` and update the dependency record.

## 4. Verification and review

- [x] 4.1 Run `make verify` and `make verify-installation`.
- [ ] 4.2 Run the independent review and record it in `verification.md`.
