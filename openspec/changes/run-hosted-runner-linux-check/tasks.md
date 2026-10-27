## 1. Change

- [x] 1.1 Create the change `run-hosted-runner-linux-check`, with empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Spec deltas for `integration-flow` and `native-worker-acceptance`, written before the workflow

## 2. Implementation

- [x] 2.1 Add `.github/workflows/linux-acceptance.yml`, dispatch only, with actions pinned by full commit SHA
- [x] 2.2 Check that the npm pin readers read only `release.yml`
- [x] 2.3 Update `docs/foundation.md`, `docs/releases.md`, and `docs/dependencies.md`

## 3. Evidence

- [x] 3.1 Parse the workflow and check its comments
- [x] 3.2 `make verify`
- [x] 3.3 Record `verification.md`

## 4. Review and archive

- [ ] 4.1 Independent review (pass 1 reviewer A, pass 2 reviewer B, pass 3 reviewer A)
- [ ] 4.2 Archive the change
