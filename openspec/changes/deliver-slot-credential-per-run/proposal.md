## Why

G3 item 12 (`implement-account-pool`, `docs/g3-plan.md`, row 12) implements the account pool contract (`docs/contracts/account-pool.md`). Sub-changes 12a and 12b store the slots, select them inside the reservation transaction, and cool them on a limit (contract sections 11 and 12). The coordinator's brief scopes 12c as the per-run delivery of a reserved slot's credential: the control plane releases it for one run, over HTTPS only, to the worker that holds the reservation, decrypts it only at release time, and keeps it out of every log, record, and broker message (contract section 7; execution wire contracts section 8.6). The worker fetches it per run and hands it to the run only through a port that the harness host calls (item 18). A per-run delivery record without the credential lets 13c redact the run.

## What Changes

- `@taskelith/execution`: `DeliveredSlotCredential`, a delivered credential whose string, JSON, and inspection forms are `[redacted]`; the refusal reasons of a delivery; the client port `SlotCredentialClient`; and `RunSlotCredentials`, the port through which the harness host obtains and forgets a run's credential.
- `@taskelith/scheduling`: the pure checks `checkSlotDeliveryOwnership` and `checkDeliveredSlot` in the order of contract section 7.3, with the first delivery's grant check of wire section 8.6; `SlotDeliveryRecord` and `nextDeliveryRecord`; the port `SlotCredentialDeliveries` and its in-memory double.
- `@taskelith/postgres`: migration `1792933300000_slot-credential-deliveries.sql` and `PostgresSlotCredentialDeliveries`, the `slotCredentialDeliveries` member of the capacity transaction.
- `@taskelith/control-plane`: `SlotCredentialDeliveryService`, which checks and records a delivery in one `SERIALIZABLE` transaction and reveals the credential only after it commits; the route `fetchSlotCredential` of `execution.openapi.json` 0.8.0, which answers over TLS only, to a co-located worker too, and `503` until a delivery service is configured.
- `@taskelith/worker-control-plane-client`: `HttpSlotCredentialClient`, which fetches over HTTPS only and checks the answer's schema and binding.
- `@taskelith/worker`: `FetchedRunSlotCredentials`, which implements `RunSlotCredentials`, holding one delivery per run in memory until the run ends or the attempt's ownership generation or the worker's recovery epoch changes.
- Documents: account pool contract status, sections 7.2 (TLS for a co-located worker too), 7.3, and 11, and a new section 13; execution wire contracts section 9; `docs/g3-plan.md` row 12 names 12c.

## Capabilities

### New Capabilities

### Modified Capabilities

- `account-pool-port`: adds "Slot credential delivery service", "Slot credential delivery record", "Slot credential delivery over TLS only", and "Run slot credential port on the worker"; modifies "Confidential credential transport", which drops the plain-HTTP allowance for a worker co-located with the control plane (coordinator's answer Q3). No requirement is removed.

## Impact

Private packages only; no new third-party dependency. No wire document changes: `fetchSlotCredential`, `SlotCredentialDelivery`, and `SlotCredentialRefusal` are already in `execution.openapi.json` 0.8.0. One PostgreSQL migration, `1792933300000`. Nothing is wired into the composition: the control plane passes no delivery service, so the route answers `503`, and no harness host calls `RunSlotCredentials` yet. Out of scope: 12d (the other slot commands, the sweep, the HTTP operations of the account slots, the wire's slot rejecting reasons, the composition of the key and the admitted pairs, the default cooldown setting, and key rotation), 12e, and item 18.

## Follow-ups

- 12d wires `SlotCredentialDeliveryService` with `PostgresSlotCredentials` and the admitted pairs into the control plane's composition.
- Item 18: the harness host obtains the run's credential through `RunSlotCredentials`, injects it, redacts the run by its value, and forgets it when the run ends.
- 13c wires the run's revealed credentials from the deliveries that `SlotCredentialDeliveries.listByExecution` names into the session output redactor (design, Q1).
- 12d, or 12f if split: key rotation defines a change of a slot's credential version during a run and its typed outcome; until then 12c answers it `internal` (design, Q2).
