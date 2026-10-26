## 1. Specification

- [x] 1.1 Spec delta modifying requirement "Inventory request", with the scenarios "Answer to a superseded request" and "Overlapping requests settle"
- [x] 1.2 Clarify the request triggers in `docs/contracts/execution-wire-contracts.md` section 6

## 2. Tests first

- [x] 2.1 Update the integration test of two requests to expect no third request
- [x] 2.2 Add the integration test of two overlapping requests answered in turn
- [x] 2.3 Run both against the unfixed code and record the failure

## 3. Fix

- [x] 3.1 `receivePart`: only a part without a `requestId` is unsolicited (option A)

## 4. Residual risk

- [x] 4.1 Check the omitted-assignment request of `applySnapshot` under overlapping requests, for an active and for a finished assignment, and report it

## 5. Option 1: bound the omitted-assignment request

- [x] 5.1 Spec delta modifying requirement "Omitted assignments", with the scenarios "Superseded answer omits an offer" and "Omitted offer under overlapping requests"; align "Inventory request" and wire contract section 6
- [x] 5.2 Integration tests: a superseded answer omitting an offer, overlapping requests with an active offer always omitted, and a refused re-sent offer
- [x] 5.3 Run them against option A alone (`bf64a63`) and record the result
- [x] 5.4 `applySnapshot`: request inventory for an unclassifiable omission only for a snapshot without a `requestId`

## 6. Verification

- [x] 6.1 `npm run openspec -- validate fix-inventory-request-loop --strict`
- [x] 6.2 `make verify` passes
- [ ] 6.3 Independent review and its record in `verification.md`
