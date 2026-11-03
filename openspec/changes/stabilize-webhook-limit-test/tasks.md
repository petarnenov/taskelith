## 1. Change

- [x] 1.1 Create the change `stabilize-webhook-limit-test` and save the checklist

## 2. Diagnosis

- [x] 2.1 Find why a client writing an oversized body loses the 413
- [x] 2.2 Reproduce it deterministically and record a fail-before run

## 3. Implementation

- [x] 3.1 Answer first and close after a bounded drain of the unread body
- [x] 3.2 Test the sender that writes before it reads and both drain bounds
- [x] 3.3 State the behavior in wire contract section 5 and the `control-plane-api` spec delta

## 4. Verification

- [x] 4.1 Repeated runs of the test file under load, strict validation, and `make verify`
- [x] 4.2 Record `verification.md`

## 5. Review and archive

- [ ] 5.1 Independent review
  - [x] 5.1.1 Pass 1 (codex gpt-6-astra, effort medium): fix its 2 High, 5 Medium, and 1 Low findings, with the coordinator's decisions on the drain's worst case and a no-buffering test
- [ ] 5.2 Archive the change
