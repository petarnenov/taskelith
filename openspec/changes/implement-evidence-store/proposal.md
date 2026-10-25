## Why

G2 work item 19 ([docs/g2-plan.md](../../../docs/g2-plan.md)) delivers the `EvidenceStore` of architecture section 8 and serves R31. Before this change, nothing stored evidence. Item 8 defined the contract operations `publishEvidence`, `readEvidence`, and `downloadEvidence`, but no service implemented them. `readTaskResult` returned `evidence: []`, an obligation item 16 left to this item.

## What Changes

- **Execution module.**
  - The evidence domain: the record fields of architecture section 8, parsing, and producer authorization. A producer may publish only for an attempt it held at the stated ownership generation; evidence of an earlier held generation is kept with `ownershipCurrent` false. The rule for a retried publication, and the minimum retention of 365 days.
  - The `EvidenceStore` port for content-addressed bytes and the `EvidenceRecords` port for the metadata, with an in-memory records adapter and conformance suites for both.
- **`@taskelith/evidence-volume`**, a new adapter: content on a durable local volume under `control-plane/evidence/sha256/`, owner-only and written by the durable file rule. It verifies the SHA-256 digest on every write and read, so content that is corrupt or missing is detected and never served, and a republication of the same content repairs a corrupt copy.
- **`@taskelith/data-root`.** Asynchronous forms of the durable file helpers.
- **PostgreSQL.**
  - A migration adds the `evidence` table.
  - `PostgresEvidenceRecords`, with a per-digest advisory lock.
  - The generations at which a worker held an attempt, read from its assignments.
- **Control plane.**
  - `EvidenceService` with publish, read, download, and retire.
  - The HTTP operations `publishEvidence`, `readEvidence`, and `downloadEvidence`, with a multipart reader and binary responses.
  - `readTaskResult` returns the task's evidence records.
  - The composition opens the volume.
- **Documents.** The `evidence/` subtree in the `control-plane/` namespace table of the installation and enrollment contract, and the provisional 64 MiB content limit in the operational targets.

## Capabilities

### New Capabilities
- `evidence-store`: content-addressed evidence storage with authenticated, authorized publication, verified download, and retention.

### Modified Capabilities

## Impact

The published `taskelith` package and CLI are unchanged, and no dependency is added. `execution.openapi.json` moves to 0.2.1, which declares the 400, 500, and 503 failures of the evidence operations.

Worker authentication of `publishEvidence` comes from `add-worker-bearer-authentication`. On 2026-10-25 the coordinator decided that the item 17 side lands it first as a separate change (option (c)).
