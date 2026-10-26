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

## 5. Review pass 1 fixes

- [x] 5.1 Redact the whole text with the logger's `redactText` plus the client's rules, then cut (findings 1 to 3, 6, 9)
- [x] 5.2 Known log fields after the details; bounded server message and reason (finding 4)
- [x] 5.3 Walk 16 links for `causeCode` (finding 5); accept a reset in the port test (finding 7)
- [x] 5.4 Spec: define the token run; move the log rule to "Journaled launch authorization" (finding 8)
- [x] 5.5 `make verify` passes after the fixes

## 6. Review pass 2 fixes

- [x] 6.1 Bound and sanitize the schema `violation` in every client (M1)
- [x] 6.2 Never throw while describing a cause (L1); redact quoted authorization, colon pairs, and base64 (L2 to L4); codes under 32 characters (L5)
- [x] 6.3 Readability of `causeChain` and `sanitizeFailureText` (L6); design and record fixes (L7, L8)
- [x] 6.4 `make verify` passes after the fixes

