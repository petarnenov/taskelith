## 1. Change

- [x] 1.1 Create the change `stabilize-admission-base-ten-test` and save the checklist

## 2. Diagnosis

- [x] 2.1 Find why the admission wait ends before its bound
- [x] 2.2 Reproduce it deterministically and record a fail-before run

## 3. Implementation

- [x] 3.1 Set the deadline of the admission wait one second past its bound
- [x] 3.2 Test a wait whose whole-second clock ticks right after it starts
- [x] 3.3 State the behavior in the `local-installation` spec delta and `docs/local-installation.md`

## 4. Verification

- [x] 4.1 Repeated runs of the tests under load, strict validation, and `make verify`
- [x] 4.2 Record `verification.md`

## 5. Review and archive

- [ ] 5.1 Independent review
- [ ] 5.2 Archive the change
