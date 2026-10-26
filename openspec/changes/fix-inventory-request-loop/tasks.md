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

- [x] 4.1 Check the omitted-assignment request of `applySnapshot` under overlapping requests, for an active and for a finished assignment; record the result without changing it

## 5. Verification

- [x] 5.1 `npm run openspec -- validate fix-inventory-request-loop --strict`
- [x] 5.2 `make verify` passes
- [ ] 5.3 Independent review and its record in `verification.md`
