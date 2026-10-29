## Why

G3 item 12 (`implement-account-pool`, `docs/g3-plan.md`, row 12) implements the account pool contract (`docs/contracts/account-pool.md`). Sub-changes 12a to 12c store and select the slots, cool them on a limit, and deliver a slot's credential per run. The coordinator split 12d into three changes on 2026-10-29: A `apply-account-slot-commands` (this change), B `wire-account-pool-into-control-plane`, and C `rotate-account-pool-credential-key` (12f). A implements the slot commands besides adding, the orphan sweep of contract section 8.1, and the worker's recovery epoch rule of section 13, inside the Scheduling module, its PostgreSQL adapter, and the worker, with no change to the control plane.

## What Changes

- `@taskelith/scheduling`: `updateAccountSlot`, `revokeAccountSlot`, `reinstateAccountSlot`, `removeAccountSlot`, and `rotateSlotCredential` with the outcomes of the coordinator's answer Q2; the revocation cancels every attempt that holds the slot, reusing `invalidateLaunches` and `cancelInTransaction`; `sweepSlotCredentials` with a grace age of at least one hour (`SLOT_CREDENTIAL_SWEEP_MINIMUM_GRACE_MILLISECONDS`); the port operations `SlotCredentials.listStored` and `AssignmentRepository.listHeldForCredential`, their in-memory adapters, and their conformance cases.
- `@taskelith/postgres`: migration `1792933500000_slot-credential-stored-at.sql`, `PostgresSlotCredentials.listStored`, and `PostgresAssignmentRepository.listHeldForCredential`.
- `@taskelith/worker`: `FetchedRunSlotCredentials` forgets only the scopes of a lower recovery epoch, and a call whose epoch is lower than that of a held delivery or a fetch in flight fails with `conflict` and drops nothing.
- Documents: account pool contract status, sections 6.2, 8.1, and 13; `docs/g3-plan.md` row 12 records the split.

## Capabilities

### New Capabilities

### Modified Capabilities

- `account-pool-port`: adds "Slot commands besides adding", "Credential sweep with a grace age", and "Stored credential listing"; modifies "Run slot credential port on the worker" for the later-epoch rule (coordinator's answer Q7) and adds the scenario "Call of an older recovery epoch". No requirement is removed.

## Impact

Private packages only; no new third-party dependency and no wire change. One PostgreSQL migration, `1792933500000`. Nothing is wired into the composition: no route or loop calls the commands or the sweep yet. The only control-plane file touched is a test double of `SlotCredentials`, which gains the new port operation. Out of scope: B (HTTP operations, wire rejecting reasons, composition, admitted pairs, default cooldown setting, sweep loop, browser endpoint routes), C (key rotation, contract section 11), 12e, and item 18.

## Follow-ups

- B wires the commands into the 9a HTTP operations and runs `sweepSlotCredentials` every `SLOT_CREDENTIAL_SWEEP_MILLISECONDS` (3,600,000) in the control plane (coordinator's answer Q4).
- C defines key rotation and a version change during a run (contract section 11).
