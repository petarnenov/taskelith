## Why

ADR 0005 fixes the harness account pools, and the capacity reservation contract section 10 leaves the account pool port and slot selection to G3. G3 items 11, 12, 14, 18, 28, and 36 need a reviewed contract and port types before they implement or use slots. On 2026-10-26 the owner started G3 for the wave 1 contracts (items 3, 5, 6, 7, and 8) in parallel with G2. This change is G3 work plan item 5.

## What Changes

- Add the account pool contract (`docs/contracts/account-pool.md`): the slot record, eligibility and its reasons, the three selection request kinds, the least-loaded rule, session affinity, the selection after a limit, the effect of the harness port's load, limit, and reset signals, the `AccountSlots` and `SlotCredentials` ports, per-run credential delivery, and revocation, reinstatement, and removal.
- Add domain types and contract constants to the Scheduling module: `AccountSlot`, `HarnessPluginId`, `SubscriptionMechanismId`, `SlotRequest`, `SlotSelection`, and `SlotSecret`, a credential value that discloses its text only through `reveal()`.
- Add the `AccountSlots` and `SlotCredentials` port types and their conformance suites, run against an in-memory test double.
- No selection or scheduler code, no adapter, no encryption implementation or key management choice, no wire schema, and no change to `CapacityTransaction`.

## Capabilities

### New Capabilities

- `account-pool-port`: the harness-neutral account pool port of the Scheduling module, its records and contract values, and its conformance suites.

### Modified Capabilities

None. The behavior stays in `harness-account-pools`.

## Impact

- New exports from `@taskelith/scheduling`.
- No runtime behavior changes; the published `taskelith` package is unchanged.
