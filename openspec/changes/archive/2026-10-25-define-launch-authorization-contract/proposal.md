## Why

Architecture section 15 requires launch linearization and expiry to be a reviewed protocol contract before G2 execution code. G2 work plan item 3 asks for it: the authorization transaction as the linearization point, the values it compares, the journaled operation ID, TTL and skew, expiry and re-authorization, invalidation ordering, and safety that does not depend on the worker's clock.

## What Changes

- Add `docs/contracts/launch-authorization.md`, the launch authorization contract.
- Add the `launch-authorization` capability with the contract's normative rules.

## Capabilities

### New Capabilities
- `launch-authorization`: online, transactional, single-execution launch authorization, its invalidation ordering, idempotency, expiry, and fail-closed behavior.

### Modified Capabilities

## Impact

Documentation and specification only; no code. G2 items 8, 14, 15, 17, and 24 build on it.
