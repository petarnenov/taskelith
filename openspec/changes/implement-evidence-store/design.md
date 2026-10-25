## Context

Architecture section 8 requires an `EvidenceStore` port for content-addressed immutable snapshots. For the first single-server installation, a durable local volume with checksums, metadata, and authenticated download is enough. Every record names its producer, task, attempt, run, input artifacts, code revision, validator, outcome, digest, and capture time. Publication is authenticated, and the producer is authorized. R31 requires the system to detect corrupt or missing content and forged producer claims.

Item 8 fixed the operations, and section 7 of the execution wire contracts their rules:
- `publishEvidence` takes a multipart record and its content. The worker must have held the attempt at the stated generation. The generation is compared with the current one in the storing transaction. The digest and size are verified before the record is stored, and a repeat returns 200.
- `readEvidence` and `downloadEvidence` take the operator credential and never serve content that does not match.

Item 16 left the obligation to fill `evidence` in `readTaskResult`.

## Coordinator decisions (2026-10-25)

- **Worker authentication, option (c).** The item 17 side lands `add-worker-bearer-authentication` first: `authenticateWorkerBearer(secret)`, the registry lookup by hash, and the `workerCredential` scheme. This change wires `publishEvidence` to it and builds no copy.
- **Q1 (a): content size.** At most 64 MiB of content per publication, provisional, in the operational targets for G6 to verify. A larger body is 400 `invalid`, since the contract declares no 413.
- **Q2 (a): retention.** The 365-day domain rule and `EvidenceService.retire(evidenceId)` with the per-digest advisory lock. Retirement has no HTTP or admin entry point in G2. Evidence of older generations is kept.

## Goals / Non-Goals

**Goals:**
- the port and the local volume adapter;
- the record fields and producer authorization;
- verified content;
- idempotent publication;
- the three HTTP operations;
- evidence in `readTaskResult`;
- retention.

**Non-Goals:**
- launch authority (item 17);
- reconciliation and gate use of evidence (item 21 and G3);
- an object-store adapter and backup, which are later deployment choices (architecture section 8, G6);
- per-project download authorization, since the only G2 caller is the installation-wide operator credential (G3 login);
- an HTTP or admin entry point for retirement, since the contract has none.

## Decisions

- **Two ports.**
  - Content and metadata have different stores, so the execution module defines two ports. `EvidenceStore` holds bytes named only by their digest. `EvidenceRecords` holds the records, which PostgreSQL keeps with the other canonical state (architecture section 8, "PostgreSQL stores … evidence metadata").
  - The domain functions are pure: `parseEvidencePublication`, `acceptEvidence`, `isSamePublication`, and `checkRetentionElapsed`. They live in the module, and the use case spans the module, the scheduling assignments, and the store in the control-plane application layer, as item 16's use cases do.
- **Authorization from assignments.**
  - A worker held an attempt at a generation when one of its assignments for that attempt has it. A refused assignment does not count, since the worker never accepted it.
  - The task must be in the stated run and project, by its lineage link, and the attempt must belong to the task. A named execution must belong to the attempt.
  - `ownershipCurrent` is the comparison with the task's ownership generation in the same SERIALIZABLE transaction that stores the record.
  - A producer that fails these checks is `forbidden` with reason `producer-not-authorized`, which the route maps to 403. A refused credential stays 401.
- **Order of a publication.**
  - The size is checked before the transaction. The transaction then reads any stored record; a different one is 409, and the same one returns 200 after its content is written again.
  - Otherwise it authorizes, takes the digest's advisory lock, writes the content, and adds the record, so content from an unauthorized producer is never written.
  - Writing the content inside the transaction means a retried transaction writes it again, which is idempotent. A record that commits always has its content.
- **The volume.**
  - The layout is `control-plane/evidence/sha256/<first two hex digits>/<hex digest>`. The two-digit shard keeps directories small.
  - Directories are `0700` and files `0600`, under the namespace checks of the installation contract section 3 (no symbolic links, owner only). Files are written by the durable file rule; `@taskelith/data-root` now accepts bytes.
  - Every read and write verifies the digest. An intact copy is kept, and a republication of the same content replaces a corrupt one. Opening the volume removes temporaries that a crash left behind.
- **Detection.**
  - Missing content is `internal` with reason `evidence-missing`, and corrupt content `internal` with reason `evidence-corrupt`. Both answer 500 and send no bytes, as the contract says.
  - The download reads the whole content, verifies it, and only then sends it.
- **Retention.**
  - A record may be removed only 365 days after `publishedAt`, the pilot minimum of the operational targets.
  - `retire` removes the record in one transaction. In a second transaction, under the digest's advisory lock, it removes the content when no record refers to the digest. A publication of the same digest takes the same lock before it writes, so either it sees the content removed and writes it again, or retire sees its record and keeps the content. A failure between the two leaves only unreferenced content, never a record without content.
- **HTTP.**
  - `node:http` has no multipart reader. The built-in `Request.formData()` decodes a part without a filename as UTF-8 text, which would corrupt binary content, so a small RFC 7578 reader in the app parses the buffered body. The body is limited, and the parts must be exactly `record` (JSON, validated against `EvidencePublication`) and `content`.
  - A route can declare a binary response, sent as `application/octet-stream` with `nosniff`.
  - `publishEvidence` answers 201 when it stores the record and 200 for a repeat.

## Risks / Trade-offs

- The whole body is held in memory, under the provisional 64 MiB limit. A streaming reader is a later optimization once measurements need it.
- Content is written before the record commits. A transaction that fails after the write leaves unreferenced content, which a later publication of the same digest reuses.
- Authorization reads assignment records, decoded in the adapter. A G2 attempt has few assignments.
