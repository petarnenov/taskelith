## Why

G3 item 12 (`implement-account-pool`, `docs/g3-plan.md`, row 12) implements the account pool contract (`docs/contracts/account-pool.md`). The coordinator split it into sub-changes; this one, 12a, is "the item 5 contract's slot records and their encrypted credential storage in the `control-plane/` namespace, behind the account-pool port of `packages/modules/scheduling`, with the Postgres adapter; selection of a slot inside the reservation transaction (capacity-reservation contract), least-loaded per ADR 0005; the Claude Code at-most-one-slot rule (contract section 7.1)", with the conformance suites passing on the in-memory double and the PostgreSQL adapter.

## What Changes

- `@taskelith/scheduling`:
  - `AccountSlots.countNotRemoved` (contract section 6.1), with its conformance case; the `AdmittedDeliveries` port with `SLOT_DELIVERIES` (`subscription-token`) and an optional slot limit per pair (section 7.1).
  - The test doubles `InMemoryAccountSlots` and `InMemorySlotCredentials` move from the test into `src/adapters/`, with `StaticAdmittedDeliveries`.
  - `CapacityTransaction` gains `accountSlots`.
  - The domain of eligibility and least-loaded selection (`least-loaded-selection.ts`) and `selectSlotInTransaction`, which selects a `new-session` request and fails the other kinds with `invalid` until 12b.
  - `placeInTransaction` takes `slotRequest` instead of `providerCredentials`; the selection decides the credential step of `decidePlacement`, and a reservation of the selected slot records it and sets its `lastReservedAt` (section 4.7).
  - `REJECTING_REASONS` includes `SLOT_REJECTING_REASONS` (section 4.5).
  - `addAccountSlot`: the admitted pair, the record, the credential store, and the add with the pair's slot limit in one transaction; an `Err` discards the stored version.
- `@taskelith/postgres`: migration `1792932900000_account-pool.sql` (`account_slots`, `slot_credential_counters`, `slot_credentials`), `PostgresAccountSlots` as `PostgresTransaction.accountSlots`, and `PostgresSlotCredentials` over `PostgresSlotCredentialRecords` with an injected `SlotCredentialCipher`.
- `@taskelith/secrets`: `AesGcmSlotCredentialCipher` (AES-256-GCM from `node:crypto`).
- `@taskelith/control-plane-store`: `openSlotCredentialKey`, the key document `control-plane/slot-credential-key`.
- `@taskelith/execution`: the board's `PLACEMENT_REJECTING_REASONS` mirror the two slot reasons, and `control-plane.openapi.json` goes to 0.4.0 with them in the `rejected` placement obstacle, declared in `packages/contracts/breaking-changes.json`.
- `apps/control-plane`: the placement service passes no slot request (it passed `providerCredentials: []`); test fixtures gain `accountSlots`.
- Documents: account pool contract sections 6.1 and 7.1 and a new section 11; capacity reservation contract section 13, "Provider credentials"; control-plane wire contracts version note; `docs/g3-plan.md` row 12 names the sub-changes.

## Capabilities

### New Capabilities

### Modified Capabilities

- `account-pool-port`: adds "Slot records on PostgreSQL", "Slot count of a harness", "Encrypted slot credential store", "Add-slot command with a pair limit", and "New-session selection in the placement transaction".

## Impact

Private packages only; no new third-party dependency (`node:crypto` provides the cipher). `control-plane.openapi.json` changes in a way that `make contract-compatibility` reports as breaking (two added response enumeration values), so its version goes from 0.3.0 to 0.4.0 with a declaration. Out of scope: 12b (cooldown from plugin signals, affinity on resume, the selection after a limit), 12c (per-run delivery), item 18, any wire operation beyond 9a's, the slot commands other than adding, the sweep of contract section 8.1, the HTTP operations of the account slots, and the control plane's composition of the key and the credential store (design, open questions).
