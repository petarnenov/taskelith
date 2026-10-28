## 1. Contract first

- [x] 1.1 Proposal, design with the review checklist, `checklist.json`
- [x] 1.2 Spec deltas: `local-installation`, `installation-enrollment`
- [x] 1.3 Installation contract section 4, worker admission contract section 8, local installation guide

## 2. Workers view

- [x] 2.1 `Administration.workerAdmission` and the `worker-admission` command with redacted details
- [x] 2.2 Unit test of the printed view; integration cases of the command

## 3. Bring-up check

- [x] 3.1 `scripts/installation-admission.ts` and its unit tests
- [x] 3.2 Bounded admission waits in `scripts/installation.sh verify`, `check-admission`, and their fake `docker` tests
- [x] 3.3 `infra/installation/verify/compose.yaml` and its composition test

## 4. Records and gates

- [x] 4.1 `npm run openspec -- validate assert-worker-image-admission --strict` and the checks without Docker
- [x] 4.2 `make verify` (coordinator's Docker slot), done on `431d1ddf`
- [x] 4.3 `make verify-installation` (coordinator's Docker slot), done on `431d1ddf`
- [x] 4.4 Review passes and their records
- [x] 4.5 Final `make verify` and `make verify-installation` on the fixes of review pass 2 (coordinator's Docker slot), done on `ecfe6222`
