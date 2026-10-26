## 1. Specification

- [x] 1.1 Spec delta adding requirement "Control-plane failure cause" to `worker-runtime`
- [x] 1.2 Name the details and the log line in `docs/contracts/launch-authorization.md` section 11

## 2. Tests first

- [x] 2.1 Client tests for a reset, refused, and closed connection, redaction, bounds, and a missing cause
- [x] 2.2 Worker test that a failed authorization request is logged with its details
- [x] 2.3 Run them against the unfixed code and record the failure

## 3. Fix

- [x] 3.1 `failure-cause.ts`: describe the cause chain, bounded and sanitized
- [x] 3.2 `control-plane-http.ts`: report the described cause
- [x] 3.3 `launch-orchestrator.ts`: log each failed authorization request

## 4. Verification

- [x] 4.1 `npm run openspec -- validate report-control-plane-failure-cause --strict`
- [x] 4.2 Archive dry run in a scratch copy, then `validate --all --strict`
- [x] 4.3 `make verify` passes
- [ ] 4.4 Independent review and its record in `verification.md`
