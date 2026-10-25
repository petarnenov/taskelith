# Execution wire contracts

Date: 2026-10-25. Status: proposed wire contract for G2 ([G2 work plan](../g2-plan.md) item 8), under independent review. It states the rules of the execution documents that their schemas cannot express. The documents are the source of the field definitions; this page never repeats a field list.

## 1. Documents

| Document | Version | Content |
| --- | --- | --- |
| [`execution.asyncapi.json`](../../packages/contracts/documents/execution.asyncapi.json) | 0.1.0 | Commands to a worker and observations from it, over NATS JetStream |
| [`execution.openapi.json`](../../packages/contracts/documents/execution.openapi.json) | 0.1.0 | Enrollment, launch authorization, task results, and evidence, over HTTPS |

Both live in `@taskelith/contracts` beside the SDLC documents. The package generates one type and one validator per schema name from all four documents, so a name that several documents define must name the same schema; the build and the package tests fail otherwise. The execution documents reuse `CommandMetadata`, the identifiers, and `ArtifactRevision` of the SDLC documents unchanged.

## 2. Transport

By decision D3 (a), each worker has its own command subject, read through its own durable pull consumer, and its own observation subject; by D12 (a), launch authorization is the HTTPS operation `authorizeLaunch`, and commands and observations stay on NATS.

- **Subjects:** `taskelith.<installationId>.workers.<workerId>.commands` and `taskelith.<installationId>.workers.<workerId>.observations`. The per-worker broker credentials of D9 (a) let a worker read only its own command subject and publish only on its own observation subject ([trust model](../trust-model.md)). The subject names are the author's proposal; item 2 confirms the topology, and item 12 owns the streams and consumers.
- **Deduplication:** every message is published with the `Nats-Msg-Id` header set to its `commandId`, `observationId`, or `reportId`. The broker window is an optimization; receivers deduplicate by these identities for their whole lifetime (architecture section 9).
- **Size:** a message's JSON encoding is at most `1 MiB`, the broker's maximum payload ([operational targets](../operational-targets.md)). The array bounds of the schemas keep every message below it.
- **Malformed messages:** a message that fails its schema is not acted on and goes to quarantine with diagnostics (item 12); it is not rejected by an observation, because none of its fields can be trusted.

## 3. Protocol version

Architecture section 13 requires compatible server and worker version windows and a worker that fails closed when it cannot execute the assigned protocol.

- **Version:** the execution protocol version is a positive integer, `1` in this contract, exported as `EXECUTION_PROTOCOL_VERSION`. Every execution command carries it as `payload.protocolVersion`, and every observation and report as `protocolVersion`.
- **Stable part:** `CommandMetadata` and `payload.protocolVersion` keep their meaning in every protocol version. The worker validates a delivered command against `VersionedCommand` first, then checks the version against its window, and only then validates the command's own schema.
- **Fail closed:** a worker that does not support the version, or that finds another `workerId` in the metadata, executes nothing of the command. It refuses an offer with `protocol-not-supported`, and rejects any other command with `execution.command.rejected`; both name its window. It acknowledges the command only after that observation is committed, as for every rejected command ([worker journal](worker-journal.md) W1).
- **Windows:** the worker declares its window at enrollment and in every `worker.capacity.declared` observation. The control plane stamps each command with the highest version both windows contain (`commonProtocolVersion`) and places no assignment on a worker whose window has no common version; enrollment of such a worker fails with 422.
- **Compatibility window:** the control plane supports the current and the previous protocol version, so that workers can be upgraded after the control plane. A worker that supports neither is drained and upgraded before it receives work (architecture section 13).
- **New versions:** a change that a worker of the current version could not execute correctly, such as a new required field or a changed meaning, needs the next protocol version. A change that the breaking-change check reports for a document also needs a new `info.version` of that document, as for every contract document.

## 4. Commands

Each command is a `CommandMetadata` envelope that also requires `attemptId`, `workerId`, and `ownershipGeneration`, with a fixed `commandType` and its own payload.

| Command | `commandType` | Written by |
| --- | --- | --- |
| Assignment offer | `execution.assignment.offer` | The assignment's creation, with its reservation (capacity reservation section 4) |
| Cancellation | `execution.cancellation.request` | A cancellation request, a revocation after authorization (launch authorization section 5), an `unauthorized-start` for that execution only, or an assignment end while an execution under it can run |
| Assignment end | `execution.assignment.end` | The cancellation and supersession transactions (capacity reservation section 6) |

- An offer names the `recoveryEpoch` the worker uses in its launch requests and start observations. The admission and its generation are `metadata.sdlc.admissionId` and `metadata.sdlc.admissionGeneration`, which the worker journals with the launch intent ([worker journal](worker-journal.md) section 5).
- A cancellation without `executionId` targets the attempt; with it, only that execution. A cancellation is never proof of termination.
- What an offer executes is not part of G2: item 15 runs a test-only scripted process chosen by the worker's test configuration, and the harness invocation joins the offer with the agent harness port in G3.

The control plane also sends `execution.observations.confirmed` on the command subject. It is not a command: it has no `commandId`, the worker does not journal it in its inbox, and applying it twice changes nothing.

## 5. Observations

Each observation is an `ObservationMetadata` envelope with a fixed `observationType` and its own payload. Its producer is the pair `(workerId, journalId)`, and `sequence` is gapless per that pair ([worker journal](worker-journal.md) section 6). `observationId` is deterministic from its source: the `commandId` for a command outcome, the `executionId` and the fact for an execution fact, and the `executionId`, the fact, and an evidence counter for a repeated `uncertain`. `occurredAt` is the worker's clock and is informational only; no safety rule depends on it.

| Observation | `observationType` | Source |
| --- | --- | --- |
| Assignment accepted | `execution.assignment.accepted` | The offer was journaled and accepted |
| Assignment refused | `execution.assignment.refused` | A worker-side reason of capacity reservation section 11, or `protocol-not-supported` |
| Command rejected | `execution.command.rejected` | Section 3 |
| Launch rejected | `execution.launch.rejected` | A non-retryable launch rejection (launch authorization section 9) |
| Started, exited, not started, uncertain, termination unproven, unrecorded process | `execution.started`, `execution.exited`, `execution.not-started`, `execution.uncertain`, `execution.termination-unproven`, `execution.unrecorded-process` | The facts of supervisor identity section 11 |
| Cancellation not applied | `execution.cancellation.not-applied` | An adopting supervisor on macOS (supervisor identity section 8) |
| Capacity declared | `worker.capacity.declared` | At enrollment and whenever the slot count, CPU, memory, enforceable controls, or protocol window change |
| Admission pressure changed | `worker.admission-pressure.changed` | The causes of admission pressure changed; an empty list clears it |

Rules that the schemas cannot express:

- A refusal is `retryable` exactly when its reason is `worker-admission-pressure`, and then it names at least one `pressureCauses` entry, such as `journal-backlog` or `disk-floor`; no other refusal names causes.
- An exit with `spawnFailed` has `startProven` false, a `spawnFailure`, and the termination evidence `never-spawned`; an exit without `spawnFailed` has no `spawnFailure` and another termination evidence: `containment-empty` on Linux, `process-group-empty` on macOS.
- `execution.started` carries the child's process identity; the control plane checks its `launchAuthId`, `executionId`, and `recoveryEpoch` as launch authorization section 7 states.

## 6. Confirmation and inventory

- **Confirmation:** `confirmedThrough` is the end of the contiguous prefix of the journal's sequence that the control plane has applied. It only grows for a `(workerId, journalId)`; a lower value than the worker's local one is ignored. A broker acknowledgement confirms nothing (worker journal section 6).
- **Inventory:** on every reconnect the worker publishes `worker.inventory.reported` with the assignments it holds and the journal state of their executions, and `throughSequence`, the last sequence the snapshot reflects. The report is outside the journal sequence and is not confirmed. The control plane applies it only after every observation through `throughSequence`, and reconciles any unfinished assignment the report omits as the worker journal contract (section 8) states.

## 7. HTTP operations

| Operation | Credential | Rules |
| --- | --- | --- |
| `enrollWorker` | Single-use enrollment token | The worker presents its new `journalId`, host, protocol window, and capacity; the response holds the `workerId`, the credential generation, the recovery epoch, the control plane's protocol window, and both credentials, whose content item 13 defines. |
| `authorizeLaunch` | Worker credential | Status 200 carries the decision recorded for the `operationId`: a grant, a rejection, or, on a transport retry, `revoked` or `expired`. Status 503 means no decision was reached; the worker retries with the same `operationId` until its deadline. A rejection is `retryable` exactly for `quarantined` and `unavailable`, and a retry after it uses a new `operationId`. `skewMilliseconds` is less than `ttlMilliseconds`. The worker computes its deadline from its own suspend-inclusive clock (launch authorization section 7); `issuedAt` is never compared with the worker's clock. |
| `readTaskResult` | Operator credential | `pending` until an attempt of the task ends; then the outcome of its last ended attempt, which does not accept the task's work, and the evidence records of the task. |
| `publishEvidence` | Worker credential | A multipart body of the record and its content. The worker must own the attempt at its current ownership generation. The control plane verifies the SHA-256 digest and size before it stores the record; a repeat of the same record returns 200. |
| `readEvidence`, `downloadEvidence` | Operator credential | The record, and the content whose SHA-256 digest is the record's `contentDigest`; content that is missing or does not match is not served. |

The operator credential is the installation bootstrap credential of decision D10 (a). The SDLC operations stay without a declared credential in this contract; item 16 adds it, with the version of `sdlc.openapi.json` that the change requires.

## 8. Obligations on other items

- **Item 12:** the streams, consumers, and quarantine for the subjects of section 2, and the `Nats-Msg-Id` header.
- **Item 13:** the credential content, the subject permissions of section 2, and the protocol window check at enrollment.
- **Items 16, 17, and 19:** the HTTP operations of section 7, with runtime validation against these schemas.
- **Item 18:** placement only on a worker with a common protocol version, and release on `protocol-not-supported`.
- **Item 20:** the order of section 3 for every delivered command, and the observations of section 5.
- **Item 21:** the confirmation and the inventory of section 6.
