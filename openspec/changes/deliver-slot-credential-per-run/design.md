## Context

G3 item 12 implements the account pool contract (`docs/contracts/account-pool.md`). The coordinator's split (contract section 11): 12a the slot records, the credential store, the add-slot command, and the `new-session` selection; 12b the cooldown, affinity, and the selection after a limit (section 12); 12c, this change, the per-run delivery of a slot credential to the worker; 12d `wire-account-pool-into-control-plane`. The wire form already exists: `fetchSlotCredential`, a `GET` of `/executions/{executionId}/slot-credentials/{slotId}` with the attempt, the ownership generation, and the recovery epoch as query parameters, answers `200` `SlotCredentialDelivery` or `422` `SlotCredentialRefusal` with a typed reason (execution wire contracts section 8.6, `execution.openapi.json` 0.8.0). Contract section 7 fixes the checks, their order (section 7.3), the reveal after the check transaction commits, the transport (section 7.2), and the worker's handling (section 7.3). No new third-party dependency and no wire change are needed.

## Decisions

1. **Layers.** The checks are pure functions of the Scheduling domain, `checkSlotDeliveryOwnership` and `checkDeliveredSlot`, beside the slot records they read. The service that runs them, `SlotCredentialDeliveryService`, is in the control plane's application layer beside `LaunchAuthority`, whose `installationState` and `isCurrentWorker` it reuses, because the checks read the installation, the worker, the assignment, and the task in one `ControlPlaneTransaction`. The worker's port `RunSlotCredentials` and the client port `SlotCredentialClient` are in the Execution module; the HTTP adapter is in `@taskelith/worker-control-plane-client` and the worker's implementation in `@taskelith/worker`.
2. **Check order.** Contract section 7.3: `quarantined`, `stale-recovery-epoch`, `worker-not-authorized`, `assignment-not-active`, `stale-ownership-generation`, `attempt-not-launchable`, `execution-conflict`, `capacity-not-reserved`, then the slot's state, `revoked` or `removed`, and `delivery-not-admitted`. `assignment-not-active` also covers an attempt or execution that the task does not hold, an execution of another assignment or worker, and an ended assignment. `execution-conflict` covers an execution that is not the attempt's owning one, a terminal one, one with a `revoked` grant, and, for the first delivery to an `authorized` execution, one whose latest grant is missing or expired (section 7 and wire section 8.6). A started execution, or one that had a delivery of the slot, passes without a live grant: this is the re-delivery of section 7.3.
3. **Reveal after commit.** One `SERIALIZABLE` transaction reads, checks, and writes the delivery record; the service calls `SlotCredentials.reveal` for the slot's `credentialVersion` only after it commits (section 7). A failing check writes nothing and reveals nothing. Every reveal failure gets a local message that names only the slot, because an adapter's diagnostic may hold the credential: a throw or an `unavailable` failure is `unavailable`, any other failure `internal` (review pass 1, finding 4).
4. **Delivery record.** `slot_credential_deliveries` keeps one row per task, execution, and slot: the attempt and worker of the latest delivery, the credential version, the first and latest delivery times, and the count, never the credential. It is written in the check transaction, before the reveal, so every revealed credential has a record. `listByExecution` gives the deliveries of one execution in slot order, for 13c. The shared suite `SLOT_CREDENTIAL_DELIVERIES_CONFORMANCE` checks the in-memory and PostgreSQL adapters for the lookup by the whole key, the replacement, and the order by code point (ADR 0004 principle 2; review pass 1, finding 6).
5. **Races.** Two first fetches for one execution and slot both read no record; the upsert of the second to commit conflicts with the first, PostgreSQL fails it with a serialization failure, and the transaction is retried, reads the first record, and counts the second delivery. A test gates the first attempt of each racer after its read and asserts that one of them retried.
6. **Transport.** The route is marked confidential, and the API server answers a confidential route on a connection without TLS with `500` `internal` before it reads the bearer, so a credential never leaves over plain HTTP, to a co-located worker neither (Q3). Every response already carries `Cache-Control: no-store`. The client refuses a base URL that is not `https:` and sends nothing.
7. **Redaction.** `DeliveredSlotCredential` (worker) and `SlotSecret` (control plane) return `[redacted]` from `toString`, `toJSON`, and inspection; only `reveal` returns the text. In the control plane only `slotCredentialBody` puts it into a response body. A client failure names the violation count or the status, never the body; a refusal carries its listed reason and a local message, and an error answer only its status, because a subscription credential has no shape that sanitizing could match (review pass 1, finding 2). The worker's logs name identifiers and the reason or code only.
8. **Worker.** `FetchedRunSlotCredentials` fetches through `SlotCredentialClient` with the worker's current recovery epoch, holds one delivery per attempt, execution, and slot in memory, gives the held one back to later calls for the same run, and drops what ended on the harness host's call: `forgetRun` when the run ends, `forgetOwnershipGeneration` when an attempt's generation ends, and `forgetRecoveryEpoch` when the worker's epoch ends (Q7; review pass 1, finding 3). Each held delivery keeps the ownership generation and recovery epoch of its fetch, so a call that reads another recovery epoch, or names another generation of its attempt, also drops the stale ones before it looks for a held one. A forget also ends the fetches in flight for what ended: their delivery is neither held nor returned, and the call fails with `conflict`; so does a fetch during which the epoch changed (review pass 1, finding 1). A refusal or failure is held by nothing, so the next call fetches again.
9. **Not wired.** `ApiServices.slotCredentials` is optional and the composition passes none, because 12d supplies the key, `PostgresSlotCredentials`, and the admitted pairs; until then the route answers `503` `unavailable`.

## Coordinator answers

The coordinator Niki (architect) answered the questions Q1 to Q8 that this design asked on 2026-10-29. The answers, verbatim:

> Q1 The text (my answer Q9 to Zaki on 13b's design): "Credentials revealed to a run: redact known shapes only for now, as a stated limit. Owner of the fix: 13c wires the run's revealed credentials (from 12c's per-run delivery record) into the session output redactor; note that obligation for 12c/13c in the design." Your record (task, execution, slot; attempt, worker, credential version, first/last time, count; listByExecution) is accepted, written before reveal, so a failed reveal leaves it: correct, since 13c must assume the worst.
>
> Q2 Keep internal 500 with nothing revealed for now, and note it for 12d: key rotation (12d, or 12f if split) defines the mid-run version change and its typed outcome.
>
> Q3 TLS-only, and amend the living requirement "Confidential credential transport" in this change (MODIFIED) and contract section 7.2: item 26 gives every installation its certificate authority, so a co-located worker uses TLS too. One less plain-HTTP path for a secret.
>
> Q4 Accepted: 12d wires it; the 503 without wiring stays, with a test.
>
> Q5 Accepted: an invariant break, internal.
>
> Q6 Accepted.
>
> Q7 Accepted, plus: the worker forgets the credential at the run's end and on a generation or epoch change, with tests for each.
>
> Q8 Accepted.

The questions, in short: Q1, the delivery record's shape and key, and whether 13c reads it by `listByExecution`; Q2, a slot whose credential version differs from the execution's earlier delivery; Q3, the plain-HTTP allowance of contract section 7.2 for a co-located worker; Q4, who wires the service into the composition; Q5, a missing slot or version after the checks; Q6, the scope of "first delivery" for the grant check; Q7, the worker's proof that it holds the reservation and its holding per run; Q8, the worker's log event names.

Applied:

- **Q1.** The record's shape (decision 4) stays. Obligation for 12c and 13c: 13c wires the run's revealed credentials from 12c's delivery record into the session output redactor, which until then redacts known shapes only, as a stated limit; contract section 13 states it.
- **Q2.** A changed version stays `internal` (`500`) with nothing revealed. Key rotation (12d, or 12f if split) defines the version change during a run and its typed outcome; contract sections 11 and 13 and the proposal's follow-ups state it.
- **Q3.** TLS-only (decision 6). The spec delta modifies the living requirement "Confidential credential transport" to TLS for a co-located worker too, and contract section 7.2 says why: item 26 gives every installation its certificate authority.
- **Q4.** 12d wires the service (decision 9); the API test `without a delivery service, as before 12d wires one, the route answers 503 unavailable` asserts the `503`.
- **Q5, Q6, Q8.** Accepted as designed; nothing changes.
- **Q7.** Accepted, plus the worker forgets a held credential at the run's end and on a change of the ownership generation or the recovery epoch (decision 8), with a test for each.

## Risks

- Until 12d wires the service, nothing delivers a credential, and until item 18 nothing calls `RunSlotCredentials`; the paths run only in tests.
- A reveal that fails after the commit leaves a delivery record (Q1); 13c assumes the worst and redacts by a value that the run never received, which hides nothing it should show.
- Until 13c, the session output redactor redacts known shapes only (Q1).
