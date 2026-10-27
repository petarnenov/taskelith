# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

[G2 work plan](/docs/g2-plan.md) item 19, assigned by the coordinating session (Niki) to the worker session Maki. The reviewer is Claude Code `claude-fable-5-1` (medium), assigned by the rotation.
- Base revision: `229fa89` on `dev`; `origin/dev` at `603731b` was merged in to take `add-worker-bearer-authentication`.
- Scope:
  - the `EvidenceStore` and `EvidenceRecords` ports;
  - the local content-addressed volume adapter;
  - SHA-256 content identity and the record fields of architecture section 8;
  - authenticated publication with producer authorization;
  - corruption and absence detection;
  - retention;
  - authenticated download through the control-plane API;
  - the evidence of `readTaskResult`, which item 16 left empty.
- Out of scope:
  - launch authority (item 17);
  - reconciliation (item 21);
  - an HTTP or admin entry point for retirement.

The coordinator's decisions of 2026-10-25 are recorded in the design:
- worker authentication from `add-worker-bearer-authentication`, option (c);
- Q1 (a): the 64 MiB content limit;
- Q2 (a): retention with `retire`.

## Evidence

- Environment: macOS 26.6.2 arm64, Node v24.22.1 (`.nvmrc`), npm 12.2.1, Docker 29.6.1 with the Compose services of `make verify` (PostgreSQL, NATS, Toxiproxy).
- Dependencies: none added. The new private workspace `@taskelith/evidence-volume` is in the regenerated dependency inventory.
- Contracts: `execution.openapi.json` 0.2.1 declares the 400, 500, and 503 failures of the evidence operations, in response to review pass 1. `make contract-compatibility` reports no breaking change.
- Documents:
  - the `evidence/` subtree in section 3 of the installation and enrollment contract;
  - the content and concurrency limits in the operational targets;
  - the document version in the execution wire contracts.

## Author self-check

Recorded before pass 1, and updated with each round of fixes.

- **Producer authorization:**
  - the worker is read again in the publishing transaction (Pepi's obligation, trust model section 4);
  - the task must be in the stated run and project, and the attempt in the task;
  - the worker must have held the attempt at the stated generation, by its assignments, except refused and superseded ones;
  - `ownershipCurrent` is compared in the same transaction;
  - tests cover a stranger, a misplaced task, an earlier generation, a revocation and a rotation since the bearer check, and the end-to-end refusal with 403.
- **Verified content:**
  - the size and the digest are checked before the record is stored, and content is written only after authorization;
  - every read and write verifies the digest;
  - corrupt and missing content answer 500 without bytes, and a republication repairs a corrupt copy;
  - the end-to-end test tampers with the file on disk.
- **Races:**
  - every writer of a digest's content takes its advisory lock: publication before it reads the record, and retirement before it counts references;
  - retirement counts at READ COMMITTED;
  - an integration test commits a publication while retirement waits for the lock.
- **HTTP:**
  - the multipart reader is binary safe and checked against the `FormData` encoding of `fetch`;
  - statuses follow the contract, with 201 and 200 for a new and a repeated publication;
  - limits: 1 MiB per record, 64 MiB of content, and four uploads at once.
- **Against ADR 0004:**
  - hexagonal: the domain rules and ports are in the execution module, the volume and PostgreSQL adapters implement them, and the use case is in the control-plane application layer;
  - Clean Code: small functions and one term per concept, with no casts in the parser;
  - coverage: see the checks.
- **Evidence check:** every claim above has a test named in the change. The OpenSpec change validates strictly.

## Checks

`make verify` ran in the worktree with every file tracked:

- At `f1e8514`, before pass 1: 954 tests passed, 0 failed; coverage 99.19% lines, 92.01% branches, 99.00% functions. The comment, boundary, coverage-scope, dependency-inventory, contract-compatibility, OpenSpec, and package checks pass.
- At `014b64b`, after the pass-1 fixes: 956 tests passed, 0 failed; coverage 99.14% lines, 91.96% branches, 99.01% functions; every other check passes.
- At `068c9d0`, after the pass-2 fixes: 958 tests passed, 0 failed; coverage 99.19% lines, 92.01% branches, 99.01% functions; every other check passes.

Earlier runs failed and were fixed before pass 1:
- a three-line comment;
- the bearer migration test, which had to hold back the later evidence migration;
- an end-to-end fixture that opened a second attempt;
- the dependency inventory after the new workspace.

## Independent review

The reviewer is Claude Code with model `claude-fable-5-1` and effort `medium`, both set in the invocation:

`claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`

It ran from the worktree, with the prompt and log kept in the session's scratch directory. The JSON `modelUsage` names only `claude-fable-5-1` in both passes. A SHA-256 snapshot of every tracked and untracked file was taken before and after each pass.

### Pass 1

- Session `e8b2f1a8-717f-4aa3-aceb-33c70d1f44c8`, 2026-10-25 18:27 to 18:35, on `f1e8514`.
- Snapshot `1eea9396…2e957` before and after: unchanged.
- Result: Critical 0, High 1, Medium 2, Low 9.

| # | Finding | Disposition |
| --- | --- | --- |
| H1 | Retirement counted references under a SERIALIZABLE snapshot taken before the lock was granted, so it could remove the content of a record committed during the wait. | Fixed: `ControlPlaneStore.readCommitted`, and the count runs after the lock at READ COMMITTED; an integration test reproduces the interleaving. |
| M1 | An offered assignment that was superseded or cancelled counted as held. | Partly accepted: superseded assignments no longer count, since supersession requires that no grant exists. Offered and cancelled ones still count, because launch authorization treats every assignment that has not ended as active. Pass 2 accepted the reasoning. |
| M2 | Synchronous I/O of up to 64 MiB blocked the API event loop. | Fixed: asynchronous durable file helpers in `@taskelith/data-root`, and `node:fs/promises` in the volume. |
| L1 | The evidence operations did not declare the 400, 500, and 503 that the routes return. | Fixed: `execution.openapi.json` 0.2.1. |
| L2 | No test for content above 64 MiB or for the body limit. | Fixed. |
| L3 | A link placed between the path check and the read would be followed. | Fixed: `O_NOFOLLOW`, and a volume path failure is `internal`. |
| L4 | The end of retention failed open. | Fixed: an end that cannot be computed keeps the record. |
| L5 | Refusal messages revealed whether a task exists. | Fixed: one message for every producer check. |
| L6 | Unbounded concurrent buffering of uploads. | Fixed: `UploadSlots`, four at once, in the operational targets. |
| L7 | A cast in the identifier parser. | Fixed: parsed field by field. |
| L8 | A double negation in retirement. | Fixed. |
| L9 | The task use case imported a helper from the evidence use case. | Fixed: `evidence-view.ts`. |

### Pass 2

- Session `0bee39bf-ae52-4d9b-9bd9-df785870bbfe`, 2026-10-25 18:43 to 18:53, on `014b64b`.
- Snapshot `0a8f9ea8…35035` before and after: unchanged.
- Result: Critical 0, High 0, Medium 0, Low 7. Every pass-1 finding was confirmed resolved, including the reasoning of M1.
- Under the governance rule, these Low findings are fixed without another review. The fixes below are therefore unreviewed.

| # | Finding | Disposition (unreviewed fix) |
| --- | --- | --- |
| 1 | An invalid path identifier answered 404, while the contract declares 400. | Fixed: `invalid`, 400. |
| 2 | A repeated publication only read the record, so SSI could let it pass beside a retirement of the same record. | Fixed: publication takes the digest's lock before it reads the record. |
| 3 | The asynchronous durable file helpers had no direct tests. | Fixed: tests for creation once, conflict, replacement, mode, and flush failure. The sync and async forms stay separate, since one serves the worker journal and the other the API. |
| 4 | The held-generation query had no index. | Fixed: `assignments (attempt_id, worker_id)` in the evidence migration. |
| 5 | The boundary was checked only after buffering the body. | Fixed: checked before the body is read. |
| 6 | Two blank lines after the imports. | Fixed. |
| 7 | `verification.md` and tasks 3.2 and 3.3 were missing. | Fixed: this record. |

## Limitations

- The pass-2 prompt lost the quoted cast text of the pass-1 finding about the identifier parser to shell substitution. The reviewer still checked that finding and confirmed it resolved.
- Retirement has no HTTP or admin entry point in G2 (decision Q2); its tests call the use case.
- Download authorization is the installation-wide operator credential. Per-project authorization comes with G3 login.
- The provisional limits (64 MiB, four uploads at once) await G6 measurements.

## Remaining gates

- Integration into `dev` and archiving, by the coordinator.
- No deployment validation is claimed.
