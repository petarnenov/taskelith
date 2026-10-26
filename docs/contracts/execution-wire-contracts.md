# Execution wire contracts

Date: 2026-10-25. Status: proposed wire contract for G2 ([G2 work plan](../g2-plan.md) item 8), under independent review. It states the rules of the execution documents that their schemas cannot express. The documents are the source of the field definitions; this page never repeats a field list.

## 1. Documents

| Document | Version | Content |
| --- | --- | --- |
| [`execution.asyncapi.json`](../../packages/contracts/documents/execution.asyncapi.json) | 0.6.0 | Commands to a worker and observations from it, over NATS JetStream, and its heartbeats over core NATS |
| [`execution.openapi.json`](../../packages/contracts/documents/execution.openapi.json) | 0.3.1 | Enrollment, launch authorization, delegation with its 500 and 503 failures (item 21), task results, evidence with its 400, 500, and 503 failures (item 19), and the quarantine with its redrive (item 16), over HTTPS; G2 serves it as plain HTTP on loopback, and TLS is G3 item 26 (D11) |

Both live in `@taskelith/contracts` beside the SDLC documents. The package generates one type and one validator per schema name from all four documents, so a name that several documents define must name the same schema; the build and the package tests fail otherwise. The execution documents reuse `CommandMetadata`, the identifiers, `ArtifactRevision`, and `Admission` of the SDLC documents. `Admission` gains the optional `ownershipGeneration` that a used admission carries ([`sdlc-task-admission`](../../openspec/specs/sdlc-task-admission/spec.md)), which the SDLC documents declare with version 0.2.0.

## 2. Transport

By decision D3 (a), each worker has its own command subject, read through its own durable pull consumer, and its own observation subject; by D12 (a), launch authorization is the HTTPS operation `authorizeLaunch`, and commands and observations stay on NATS.

- **Subjects:** `taskelith.<installationId>.workers.<workerId>.commands` and `taskelith.<installationId>.workers.<workerId>.observations`. The per-worker broker credentials of D9 (a) let a worker read only its own command subject and publish only on its own observation and heartbeat subjects ([trust model](../trust-model.md)). The subject names are the author's proposal; item 2 confirms the topology, and item 12 owns the streams and consumers.
- **Heartbeats:** `taskelith.<installationId>.workers.<workerId>.heartbeats` carries `worker.heartbeat` (section 6) over core NATS. No stream holds it, so a heartbeat sent while no control plane listens is lost and the next one replaces it. Only the worker publishes on its own heartbeat subject.
- **Deduplication:** every command, observation, and inventory part is first published with the `Nats-Msg-Id` header set to its `commandId`, its `observationId`, or its `reportId` followed by `.` and its `part`. A redrive from quarantine needs a new header value inside the broker's window ([JetStream spike](../g2-jetstream-spike.md#consequences-for-later-items)), so the header is only a broker hint: the message's identity is the field in its body, which never changes. A confirmation has no identity and no header: it is cumulative, so a duplicate changes nothing. The broker window is an optimization; receivers deduplicate by the body identities for their whole lifetime (architecture section 9). The broker's stream sequence is not the producer sequence: a repeat after the window or a redrive gets a new one, so no rule depends on it.
- **Size:** a message's JSON encoding is at most `1 MiB`, the broker's maximum payload ([operational targets](../operational-targets.md)). The array bounds keep every message below it; a test checks the largest one, an inventory part with every identifier at its maximum length.
- **Malformed messages:** a message that fails its schema is not acted on and goes to quarantine with diagnostics (item 12); it is not rejected by an observation, because none of its fields can be trusted. A malformed heartbeat, which no stream holds, is dropped and logged instead.

## 3. Protocol version

Architecture section 13 requires compatible server and worker version windows and a worker that fails closed when it cannot execute the assigned protocol.

- **Version:** the execution protocol version is a positive integer, `1` in this contract, exported as `EXECUTION_PROTOCOL_VERSION`. Every execution command carries it as `payload.protocolVersion`, and every observation and report as `protocolVersion`.
- **Stable part:** `CommandMetadata` and `payload.protocolVersion` keep their meaning in every protocol version. The worker validates a delivered command against `VersionedCommand` first, then checks the version against its window, and only then validates the command's own schema.
- **Fail closed:** a worker that does not support the version, or that finds another `workerId` in the metadata, executes nothing of the command, an offer included. It rejects the command with `execution.command.rejected`, which names the command only by `commandId` and `commandType`, so that no field of an unknown payload is needed, and which carries the worker's window. It acknowledges the command only after that observation is committed, as for every rejected command ([worker journal](worker-journal.md) W1). For an offer, the control plane finds the assignment by its `commandId` and refuses it with `protocol-not-supported`, which ends it and releases its reservation (capacity reservation section 6).
- **Windows:** the worker declares its window at enrollment and in every `worker.capacity.declared` observation. The control plane stamps each command with the highest version both windows contain (`commonProtocolVersion`) and places no assignment on a worker whose window has no common version; enrollment of such a worker fails with 422.
- **Compatibility window:** the control plane supports the current and the previous protocol version, so that workers can be upgraded after the control plane. A worker that supports neither is drained and upgraded before it receives work (architecture section 13).
- **New versions:** a change that a worker of the current version could not execute correctly, such as a new required field or a changed meaning, needs the next protocol version. A change that the breaking-change check reports for a document also needs a new `info.version` of that document, as for every contract document.

## 4. Commands

Each command is a `CommandMetadata` envelope that also requires `attemptId`, `workerId`, and `ownershipGeneration`, with a fixed `commandType` and its own payload.

| Command | `commandType` | Written by |
| --- | --- | --- |
| Assignment offer | `execution.assignment.offer` | The assignment's creation, with its reservation (capacity reservation section 4); the requested CPU and memory are each at most `2147483647`, the largest PostgreSQL `integer`, and the per-attempt ceiling of capacity reservation section 8 still applies |
| Cancellation | `execution.cancellation.request` | A cancellation request, a revocation after authorization (launch authorization section 5), an `unauthorized-start` for that execution only, or an assignment end while an execution under it can run |
| Assignment end | `execution.assignment.end` | The cancellation and supersession transactions (capacity reservation section 6) |

- An offer names the `recoveryEpoch` the worker uses in its launch requests and in the observations about its executions. The admission and its generation are `metadata.sdlc.admissionId` and `metadata.sdlc.admissionGeneration`, which the worker journals with the launch intent ([worker journal](worker-journal.md) section 5).
- A cancellation without `executionId` targets the attempt; with it, only that execution. A cancellation is never proof of termination.
- What an offer executes is not part of G2: item 15 runs a test-only scripted process chosen by the worker's test configuration, and the harness invocation joins the offer with the agent harness port in G3.

The control plane also sends `execution.observations.confirmed` and `worker.inventory.requested` (section 6) on the command subject. Neither is a command: they have no `commandId`, the worker does not journal them in its inbox, and receiving either twice changes nothing.

## 5. Observations

Each observation is an `ObservationMetadata` envelope with a fixed `observationType` and its own payload. An observation about an attempt also requires `attemptId` and `ownershipGeneration`, the generation of the offer the worker journaled; only `execution.command.rejected`, which names its command by `commandId` alone (section 3), `execution.unrecorded-process`, `worker.capacity.declared`, and `worker.admission-pressure.changed` are about no attempt. Its producer is the pair `(workerId, journalId)`, and `sequence` is gapless per that pair ([worker journal](worker-journal.md) section 6). `observationId` is deterministic from its source: the `commandId` for a command outcome, the `executionId` and the fact for an execution fact, the `executionId`, the fact, and an evidence counter for a repeated `uncertain`, the `executionId`, the fact, and the cancellation's `commandId` for `cancellation.not-applied`, and the `journalId` and the containment for `execution.unrecorded-process`, which therefore has one identity per journal incarnation: a derivation after confirmation is published again under the same identity, and the receiver applies it without effect ([worker journal](worker-journal.md) section 6). `occurredAt` is the worker's clock and is informational only; no safety rule depends on it.

| Observation | `observationType` | Source |
| --- | --- | --- |
| Assignment accepted | `execution.assignment.accepted` | The offer was journaled and accepted |
| Assignment refused | `execution.assignment.refused` | A worker-side reason of capacity reservation section 11 |
| Command rejected | `execution.command.rejected` | Section 3 |
| Launch rejected | `execution.launch.rejected` | A non-retryable launch rejection (launch authorization section 9) |
| Started, exited, not started, uncertain, termination unproven, unrecorded process | `execution.started`, `execution.exited`, `execution.not-started`, `execution.uncertain`, `execution.termination-unproven`, `execution.unrecorded-process` | The facts of supervisor identity section 11 |
| Cancellation not applied | `execution.cancellation.not-applied` | An adopting supervisor on macOS (supervisor identity section 8) |
| Capacity declared | `worker.capacity.declared` | At enrollment and whenever the slot count, CPU, memory, enforceable controls, or protocol window change; each of the slot count, CPU, and memory is at most `2147483647`, the largest PostgreSQL `integer` |
| Admission pressure changed | `worker.admission-pressure.changed` | The causes of admission pressure changed; an empty list clears it |

The schemas also fix the dependencies between fields:

- A refusal is `retryable` exactly when its reason is `worker-admission-pressure`, and then it names at least one `pressureCauses` entry, such as `journal-backlog` or `disk-floor`; no other refusal names causes.
- An exit with `spawnFailed` has `startProven` false, a `spawnFailure`, and the termination evidence `never-spawned`; an exit without `spawnFailed` has no `spawnFailure` and another termination evidence. That it is `containment-empty` on Linux and `process-group-empty` on macOS is the worker's rule; recovery on start may instead prove the end by `boot-changed` or, on Linux, `namespace-ended` (supervisor identity section 6), with status `unknown`.
- `execution.started` carries the child's process identity; the control plane checks its `launchAuthId`, `executionId`, and `recoveryEpoch` as launch authorization section 7 states.
- Every other execution observation carries `recoveryEpoch` too: `execution.exited`, `execution.not-started`, `execution.uncertain`, `execution.termination-unproven`, and `execution.cancellation.not-applied` the epoch of the launch intent their execution belongs to, and `execution.unrecorded-process` the epoch of the worker's journal. The control plane checks it, and the quarantine state, as launch authorization section 7 states for these observations. This required field keeps protocol version 1 under a pre-release exception that ends at the first release of an execution package or the G2 closure (change `gate-stale-epoch-observations`, design D2).

## 6. Confirmation and inventory

- **Confirmation:** `confirmedThrough` is the end of the contiguous prefix of the journal's sequence that the control plane has applied. It only grows for a `(workerId, journalId)`; a lower value than the worker's local one is ignored. A broker acknowledgement confirms nothing (worker journal section 6).
- **Inventory:** on every reconnect the worker publishes `worker.inventory.reported` with the assignments it holds, their executions with their journal state and whether they are uncertain, and `throughSequence`, the last sequence the snapshot reflects. Uncertainty is evidence beside the state, as in the journal, and `launch-intended` is an execution without a journaled grant. One snapshot is sent in `parts` messages with one `reportId`, each of at most 256 assignments and 256 executions, and its `snapshot` number increases with every snapshot of the journal. The report is outside the journal sequence and is not confirmed.

  - The control plane applies a snapshot only when it has every part and every observation through `throughSequence`. A part of a lower `snapshot` than one already received from the same journal is discarded, so a delayed snapshot never replaces a later one. The parts of a fresh snapshot, defined below, are exempt from this filter until the rollback check below has run.
  - An omission proves lost local history only for an assignment whose acceptance the control plane applied from the same journal at a sequence up to `throughSequence`, and, after disk loss, for one accepted under an earlier journal of the worker; it is then reconciled as worker journal section 8 states.
  - An unfinished assignment that the snapshot omits without such an acceptance may be one the worker had not received when it took the snapshot. The control plane re-sends its offer with the same `commandId` only if no grant is recorded, which the worker's inbox makes idempotent, and draws no other conclusion from the omission.
- **Heartbeat:** the worker sends `worker.heartbeat` every `10s` ([operational targets](../operational-targets.md)) with its `workerId`, its `journalId`, and `sentAt`, which is its own clock and informational only. A heartbeat is outside the journal sequence; it is neither confirmed nor deduplicated, and it carries no capacity or pressure. The control plane records it as contact only when the subject's worker is the body's `workerId`, enrolled, not revoked, and under its enrolled `journalId` that is not retired. Unlike an observation or an inventory report, a heartbeat of a journal never seen does not replace the enrolled one: it is refused until an observation or report of the new journal has replaced it. After `30s` without any contact, a heartbeat, an observation, or an inventory report, the control plane marks the worker unreachable, which takes it out of new placement and changes no attempt, assignment, or reservation; any later contact makes it reachable again.
- **Inventory request:** `throughSequence` alone cannot tell a journal rolled back to before an applied acceptance from a delayed snapshot. When the control plane sees a worker reconnect, and whenever an unsolicited snapshot, one without a `requestId`, omits an unfinished assignment it cannot classify, it sends `worker.inventory.requested` with a fresh random `requestId` and keeps only the latest one per worker. The control plane sends no request for a snapshot that answers a request, even a superseded one: a newer request was sent, and its fresh answer handles any omission. The worker answers every request with a snapshot that carries that `requestId`, taken after the request arrived. A snapshot is **fresh** when its `requestId` is the current one of its worker, so it reflects the journal after every acceptance and grant the control plane had applied when it sent the request. An unfinished assignment that a fresh snapshot omits without an applied acceptance needs no further request: the re-sent offer above covers an offer the worker had not received.
  - When it sends a request, the control plane records the request's **bound**: the highest sequence it had applied from each journal of the worker, and the unfinished assignments whose acceptance it had applied from that journal. An observation applied after the request does not change the bound.
  - In a fresh snapshot, a `throughSequence` below the bound of its journal is a rollback, and so is the omission of an unfinished assignment the bound lists.
  - The control plane checks a complete fresh snapshot for rollback before it applies the lower-`snapshot` filter, because a journal that rolled back also rolled back its `snapshot` counter. A fresh snapshot that the filter would discard is used only for that check: a rollback starts reconciliation, and the snapshot never replaces the later one.
  - A rollback starts reconciliation as worker journal section 8 states: ownership and the capacity reservation are kept, and nothing is assumed about prior side effects.
  - A snapshot with another `requestId`, or without one, is applied only under the rules above and never proves a rollback.

## 7. HTTP operations

| Operation | Credential | Rules |
| --- | --- | --- |
| `enrollWorker` | Single-use enrollment token | The worker presents its new `journalId`, host, protocol window, and capacity, with each capacity value at most `2147483647`; the response holds the `workerId`, the credential generation, the recovery epoch, the control plane's protocol window, and both credentials, whose content item 13 defines. |
| `authorizeLaunch` | Worker credential | Status 200 carries the decision recorded for the `operationId`: a grant, a rejection, or, on a transport retry, `revoked` or `expired`. Status 503 means no decision was reached; the worker retries with the same `operationId` until its deadline. A rejection is `retryable` exactly for `quarantined` and `unavailable`, and a retry after it uses a new `operationId`. `skewMilliseconds` is less than `ttlMilliseconds`. The worker computes its deadline from its own suspend-inclusive clock (launch authorization section 7); `issuedAt` is never compared with the worker's clock. |
| `requestDelegation` | Worker credential | The worker names the delegating attempt at its ownership generation and the child task; the control plane derives the parent and root, and admits, holds, or rejects the child with the reasons of capacity reservation section 7. A repeat with the same `delegationId` returns the current state. |
| `readTaskResult` | Operator credential | `pending` until an attempt of the task ends; then the outcome of its last ended attempt, which does not accept the task's work, and the evidence records of the task. |
| `publishEvidence` | Worker credential | A multipart body of the record and its content. Every record names its input artifacts, code revision, validator or producing program with its version, and outcome (architecture section 8). The record names the `ownershipGeneration` at which the worker produced it, and the worker must have held the attempt at that generation. The control plane compares it with the current generation in the transaction that stores the record: evidence of an older generation is kept for audit with `ownershipCurrent` false and never counts as current evidence (launch authorization section 5). The control plane verifies the SHA-256 digest and size before it stores the record; a repeat of the same record returns 200. |
| `readEvidence`, `downloadEvidence` | Operator credential | The record, and the content whose SHA-256 digest is the record's `contentDigest`; content that is missing or does not match is not served. |

The operator credential is the installation bootstrap credential of decision D10 (a). Item 16 declares it on the SDLC operations in `sdlc.openapi.json` 0.3.0.

## 8. Obligations on other items

- **Item 12:** the streams, consumers, and quarantine for the subjects of section 2, the `Nats-Msg-Id` header and its new value on a redrive, a per-worker inbox prefix, and a publication the client reports as failed treated as unconfirmed and retried with the same identity.
- **Item 13:** the credential content, the subject permissions of section 2, and the protocol window check at enrollment.
- **Items 16, 17, and 19:** the HTTP operations of section 7, with runtime validation against these schemas; the harness side of delegation is G3's.
- **Item 18:** placement only on a worker with a common protocol version, release on `protocol-not-supported`, and the delegation checks of capacity reservation section 7.
- **Item 20:** the order of section 3 for every delivered command, the observations of section 5, and the heartbeat of section 6 (20d).
- **Item 21:** the confirmation, the inventory, and the inventory request with its rollback rule of section 6, and the heartbeat's contact and the lost-contact timeout (change `add-worker-heartbeat`).
