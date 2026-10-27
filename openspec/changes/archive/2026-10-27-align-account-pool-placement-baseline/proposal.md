## Why

The G3 item 0 revalidation (`revalidate-g3-foundations`, archived as `2026-10-27-revalidate-g3-foundations`) of item 5, `define-account-pool-contract`, review pass 2 by Claude Opus 5.5 (effort `high`) on the capability `account-pool-port`, found that the account pool contract does not fit the G2 reservation transaction as built:

- **M3 (Medium).** In G2 the caller supplies `providerCredentials` before the transaction, the placement service passes none, and each credential is checked against the fixed default `4`, so a slot whose `concurrencyLimit` is `8` would stop at `4`. Where selection sits in the order of `decidePlacement` is not stated, although it decides whether a `reject` policy rejects behind a full quota, and whether a slot wait is a fleet decline (#348) or a backed-off wait (#344).
- **L3 (Low).** The control plane tries every candidate worker of a task in one transaction. A selection that wrote `lastReservedAt` per candidate would leave a declined candidate's write in a transaction that commits on a later one.
- **L4 (Low).** The capacity reservation contract's list of writers that must run at `SERIALIZABLE` omits slot changes, which the reservation transaction reads.

Coordinator Niki assigned this follow-up to the worker session Maki.

## What Changes

- `docs/contracts/account-pool.md`: section 2, rule 3, requires every slot change to run at `SERIALIZABLE` and lists them (L4); section 3.2 compares held reservations with the slot's own `concurrencyLimit` (M3); sections 4.1, 4.2, and 4.6 point to a new section 4.7, "In the placement transaction", which states that selection replaces the caller's credentials inside `placeInTransaction`, decides the credential step after the worker and quota checks and before the charge check, maps `waiting` and `rejected` onto the placement outcome records and onto backoff rather than a fleet decline (M3), and makes the insert of the reservation the only slot write (L3); section 9 adds the item 12 placement test, a limit other than `4` and the check order among it.
- `docs/contracts/capacity-reservation.md`: the writers list of section 4 and the writers list of section 13 add slot changes (L4); section 13, "Provider credentials", states the G2 caller-supplied set and its G3 replacement (M3).
- Spec delta `account-pool-port`: three added requirements, "Slot selection at the credential step", "Single slot write per placement", and "Serializable slot changes", and the modified "Deterministic least-loaded order", whose reservation time is now written by the insert of the reservation.

## Capabilities

### New Capabilities

### Modified Capabilities

- `account-pool-port`: selection's place in the placement transaction, the single slot write, and serializable slot changes.

## Impact

Contract and specification only. G3 item 12, which builds slot selection, implements and tests section 4.7; no code changes here, because no selection code exists yet (`design.md`, D1). Capacity reservation section 10 and the `capacity-reservation` specification, which the parallel change `align-account-pool-signals` edits, are not touched. The decisions of #364 in the account pool contract are kept.
