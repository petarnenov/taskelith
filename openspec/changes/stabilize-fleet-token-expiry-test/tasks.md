## 1. Change

- [x] 1.1 Create the change `stabilize-fleet-token-expiry-test` and save the checklist

## 2. Diagnosis

- [x] 2.1 Find where `CommittingFleetRegistry.enroll` compares the expiry and against which clock
- [x] 2.2 Reproduce the failure of the old test with a lagging database clock

## 3. Implementation

- [x] 3.1 Derive the expiry from the database clock, wait for the enrollment's lock wait, and release the lock after the database clock passes the expiry
- [x] 3.2 Show that an enrollment that compares the expiry before the lock fails the new test

## 4. Verification

- [ ] 4.1 Five consecutive targeted runs under load, `npm run openspec -- validate stabilize-fleet-token-expiry-test --strict`, and `make verify`
- [ ] 4.2 Record `verification.md`

## 5. Review and archive

- [ ] 5.1 Independent review
- [ ] 5.2 Archive the change
