## 1. Change

- [x] 1.1 Create the change `stabilize-admission-base-ten-test` and save the checklist

## 2. Diagnosis

- [x] 2.1 Find why the admission wait ends before its bound
- [x] 2.2 Reproduce it deterministically and record a fail-before run

## 3. Implementation

- [x] 3.1 Set the deadline of the admission wait one second past its bound (replaced in 5.2)
- [x] 3.2 Test a wait whose whole-second clock ticks right after it starts
- [x] 3.3 State the behavior in the `local-installation` spec delta and `docs/local-installation.md`

## 4. Verification

- [x] 4.1 Repeated runs of the tests under load, strict validation, and `make verify`
- [x] 4.2 Record `verification.md`

## 5. Review and archive

- [x] 5.1 Independent review pass 1 (codex gpt-6-astra, medium): 3 Medium, 1 Low
- [x] 5.2 Pass 1 fixes: a millisecond clock with reusable deadline functions and sleeps capped at the deadline, a test clock seam with deterministic tests, the fail-before against `fa3fbce7`, and corrected latency claims
- [x] 5.3 Independent review pass 2 (claude claude-fable-5-1, medium): 4 Low; the review ends there, pass 3 is not run
- [x] 5.4 Pass 2 fixes: an unread clock fails the wait, the capped-poll test sums its sleeps, comment placeholders, and line citations
- [x] 5.5 Archive the change (reverted in 6.1 for the return)
- [ ] 5.6 Independent review pass 3 of the return round and the archive

## 6. Return (2026-11-04)

- [x] 6.1 Revert the archive commit and merge `origin/dev`; reconcile the delta
- [x] 6.2 Reproduce the iMac failure with the `node` clock and record a fail-before
- [x] 6.3 Start the first read whatever the clock says; delay only decisions in the fake `node`
- [x] 6.4 Update the spec delta, docs, and design; run the admission tests on the `node` clock under load and `make verify`

## 7. Follow-up


Not a task of this change, out of scope (coordinator's architect decision, 2026-11-04): `await_served_certificates` (`scripts/installation.sh:505` at `fa3fbce7`) and `await_contact_since` (`:519` at `fa3fbce7`) still end up to 1 s early through the whole-second `SECONDS` clock; a later change can adopt `deadline_in`, `deadline_passed`, and `sleep_within`
