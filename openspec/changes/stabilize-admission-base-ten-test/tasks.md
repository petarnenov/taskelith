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
- [ ] 5.3 Further passes as `route.json` assigns
- [ ] 5.4 Archive the change

## 6. Follow-up

Not a task of this change, out of scope (coordinator's architect decision, 2026-11-04): `await_served_certificates` (`scripts/installation.sh:508` at `fa3fbce7`) and `await_contact_since` (`:522` at `fa3fbce7`) still end up to 1 s early through the whole-second `SECONDS` clock; a later change can adopt `deadline_in`, `deadline_passed`, and `sleep_within`
