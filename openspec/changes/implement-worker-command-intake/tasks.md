## 1. Journal

- [x] 1.1 Add format 2 with its migration from format 1.
- [x] 1.2 Journal the acceptance, refusal, and rejection observations in W1, and assignment ends.
- [x] 1.3 Add `recordCapacity` and `takeInventory`.

## 2. Worker application

- [x] 2.1 Add `CommandIntake` with the order of wire contracts section 3 and the admission limits.
- [x] 2.2 Add the observation publisher, the confirmation, and the inventory answer.
- [x] 2.3 Declare the capacity and run the consumer and the publisher from `startWorker`.

## 3. Control plane

- [x] 3.1 Ensure the worker's command consumer at enrollment and at start (review pass 1, H1).

## 4. Contract

- [x] 4.1 Correct the `EnrollmentRequest` description and run `make contract-compatibility`.

## 5. Verification and review

- [x] 5.1 Run `make verify`.
- [ ] 5.2 Run the independent review and record it in `verification.md`.
