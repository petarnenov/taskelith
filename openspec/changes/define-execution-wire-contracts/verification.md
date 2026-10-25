# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 8, assigned by the coordinating session (Niki) to the worker session Pepi under decision D14 (a). Base revision: `cb97aee` on `dev` (items 1, 3 to 7, and 9 merged and archived). Scope: the new documents `execution.asyncapi.json` and `execution.openapi.json`, the protocol version helpers in `@taskelith/contracts`, the generator and compatibility check over every document, `protocol-not-supported` in `@taskelith/scheduling` and the capacity reservation contract, the contract page `docs/contracts/execution-wire-contracts.md`, and tests.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, npm 12.2.1.
- Evidence check: the change adds only repository-relative links; no external link. No dependency is added.

## Author self-check

Recorded before pass 1.

- Every topic of the plan row is covered: AsyncAPI channels and messages for the assignment and cancellation commands (and the assignment end the capacity contract names) and for the execution observations, with the section 9 fields; the OpenAPI operations for enrollment, launch authorization, reading a task's result, and publishing and downloading evidence; and a protocol version that a worker checks through `VersionedCommand` before it executes anything.
- Against the contracts: the launch request, grant, rejection reasons with retryability, `ttl` and `skew`, and start observation fields of the launch authorization contract (sections 2, 6, 7, and 9); the six facts of supervisor identity section 11 and the cancellation an adopting supervisor cannot apply (section 8); `workerId`, `journalId`, sequence, deterministic `observationId`, the cumulative confirmation, the inventory report, and the backlog and disk-floor causes of worker journal section 12; the worker-side reasons, admission pressure, and capacity declaration of capacity reservation sections 8 and 11.
- Against the item 7 domain: the wire enumerations equal the domain vocabularies, which a test checks; the task result is the shape of `TaskOutcomeFact`.
- Against ADR 0004: principle 6 by documents first, with generated types and validators; hexagonal boundaries unchanged (the contracts package imports only the kernel and ajv); principles 5 and 7 add no obligation for a change without a runnable component. Coverage stays above 75%.
- Compatibility: before pass 2 the SDLC documents were unchanged and reported 0 breaking changes; the execution documents are new. Pass-2 finding 1 changed the SDLC `Admission`, declared by version 0.2.0 of both SDLC documents. Every requirement of the spec deltas is under 500 characters, and the new capability starts with a `## Purpose`.
- Open points for the coordinator: the subject names wait for item 2; the operator credential on the SDLC operations is left to item 16. Before pass 1 the delegation request was excluded; pass-1 finding 4 added it.

## Checks

`make verify` passed in the worktree before pass 1 and after each round of fixes:

- At `d224549`, before pass 1: 397 tests passed, 0 failed; coverage 99.82% lines, 96.51% branches, 99.51% functions.
- At `2f9a3f2`, after the pass-1 fixes: 399 tests passed, 0 failed; coverage 99.82% lines, 96.51% branches, 99.51% functions.
- At `19072ce`, after the pass-2 fixes, the revision pass 3 reviewed: 400 tests passed, 0 failed; coverage over the compiled product code 99.82% lines, 96.51% branches, 99.51% functions, with `contracts/protocol-version.js` and `scheduling/assignment.js` at 100%. The run also printed "Every comment is within the comment length rule." and "Workspace and hexagonal boundary checks passed.", and "Every product module is in the coverage report." `make contract-compatibility` reported 0 breaking changes for `sdlc.openapi.json`, 34 changes for `sdlc.asyncapi.json` declared by version 0.2.0, and both execution documents absent at the merge base `cb97aee`. Finally it printed "Every active OpenSpec change archives into strictly valid specs." and "Packed file allowlist and installed CLI verification passed."
- At `8e9aa3b`, after merging `origin/dev` at `78362da` (`3b6514f`), the pass-3 fixes (`bb8e4d1`), and the JetStream spike wording (`8e9aa3b`): 452 tests passed, 0 failed; coverage 99.83% lines, 96.68% branches, 99.58% functions. The comment, boundary, coverage-scope, archive, and package checks all passed. `make contract-compatibility` reported 0 breaking changes for `sdlc.openapi.json` and 34 for `sdlc.asyncapi.json` against `78362da`, all declared by version 0.2.0.
- `npm run openspec -- validate define-execution-wire-contracts --strict` passed at each of these revisions.

Before pass 3 this section recorded only the run at `d224549` (pass-3 finding 2).

## Independent review

Assigned reviewer: Codex CLI with `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run from the worktree. The prompt named AGENTS.md, ADR 0004, the governance review process, the plan row and decisions D3, D9, D10, and D12, architecture sections 8, 9, and 13, the four contracts and their specs, the item 7 domain and its specs, and the `sdlc-wire-contracts` and `contract-tooling` specs, and asked for every instance of a problem with severity, file, line, and fix. SHA-256 snapshots of the files in `git ls-files -co --exclude-standard` were taken before and after each pass.

- **Pass 1 — session `01a17094-ccf4-76a2-83e4-da5aa8a5c02d`,** reviewed revision `8d66e51`; the header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `2f9e055b…11a0`, equal. The reviewer also compiled every schema with ajv in strict mode and ran the AsyncAPI parser. Findings: 0 Critical, 1 High, 5 Medium, 1 Low. All accepted and resolved:
  1. High: a worker could not refuse an offer of an unsupported protocol version validly, because the refusal required `assignmentId` from a payload whose shape it does not know, and could not carry its window. Such an offer is now rejected by `execution.command.rejected`, which names only `commandId` and `commandType` and carries the window; the control plane maps the `commandId` to the assignment and refuses it with `protocol-not-supported`. The wire `RefusalReason` no longer has that reason; a test covers the exchange.
  2. Medium: the inventory replaced an execution's state with `uncertain`. It now reports the journal state with an `uncertain` flag beside it, and `launch-intended` before the first grant; a test rejects `uncertain` as a state.
  3. Medium: a valid inventory could exceed the `1 MiB` payload limit (the reviewer built one of 11,317,832 bytes). A snapshot is now sent in numbered parts of at most 256 assignments and 256 executions, applied only when complete; a test checks that the largest valid part, with every identifier at its longest JSON encoding, is smaller than 1 MiB.
  4. Medium: the delegation request, whose wire form capacity reservation section 7 assigns to item 8, was excluded. `requestDelegation` now names the delegating attempt and its ownership generation and the child task, never the parent, and returns the admitted child, a wait for capacity, or a rejection with the section 7 reasons; tests cover it.
  5. Medium: `reportsNotStarted` was described as a sealed launch record, which would block re-authorization. It now means that the launch record shows no claimed spawn, as launch authorization section 4 requires.
  6. Medium: `codeRevision`, `validator`, and `outcome` of an evidence record were optional, against architecture section 8. They are now required, and a test rejects a record without its validator.
  7. Low: the `Nats-Msg-Id` rule covered confirmations, which have no identity. Confirmations are now published without the header, and an inventory part uses its `reportId` and part number.

- **Pass 2 — session `01a1709b-941f-70d3-9522-7e6dd401ba5e`,** reviewed revision `2f9a3f2`; the header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `cffd3c1c…8154`, equal. The reviewer confirmed all seven pass-1 findings fully resolved. Findings: 0 Critical, 0 High, 4 Medium, 3 Low. All accepted and resolved:
  1. Medium: the `Admission` schema, copied from the SDLC documents, rejected a used admission with the ownership generation that item 7 added. `ownershipGeneration` is now an optional property of `Admission` in all three documents that define it. Both SDLC documents declare it with version 0.2.0, because a consumer that rejects unknown properties would reject such a record; `make contract-compatibility` reports the 34 resulting AsyncAPI changes as declared. A test validates a real `useAdmission` result.
  2. Medium: a delayed inventory could misclassify an assignment accepted after it as lost history, and `reportId` gave snapshots no order. An omission now proves lost history only for an assignment whose acceptance the control plane applied from the same journal at a sequence up to `throughSequence`, or under an earlier journal. Any other omission allows only an idempotent re-send of an offer without a grant. A `snapshot` number orders snapshots, and parts of an older snapshot are discarded.
  3. Medium: an evidence publication could not show the ownership generation it was produced at. `EvidencePublication` now requires `ownershipGeneration`, which the control plane compares in the storing transaction. Evidence of an older generation is kept for audit with `ownershipCurrent` false; tests cover the field.
  4. Medium: three field dependencies were left to prose although JSON Schema can state them. They are now `oneOf` branches with negative tests: retryability and causes of a refusal, spawn failure with `startProven` false, `spawnFailure`, and `never-spawned`, and retryability by launch rejection reason. The design's risk now names only cross-field comparisons as prose.
  5. Low: generation checked shared names only within each document kind. It now merges the schemas of every document once before the two bundles, with a test of a conflict between an OpenAPI and an AsyncAPI document.
  6. Low: the contract page and the spec said that only unrecorded processes, capacity, and admission pressure were about no attempt, although command rejections are too. Both, and the `ObservationMetadata` description, now name command rejections.
  7. Low: the evidence of an operator-resolved outcome allowed control characters, which `parseEvidenceReference` rejects. It is now `DisplayText`, with a negative test.

- **Pass 3 — session `01a170a3-d64b-77a2-8068-fa108890b083`,** reviewed revision `19072ce`; the header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `74e2984e…0cb2`, equal. The reviewer confirmed pass-2 findings 1 and 4 to 7 fully resolved, and findings 2 and 3 in part, with the gaps raised below. Findings: 0 Critical, 0 High, 2 Medium, 1 Low. This was the third pass, so the findings went to the owner through the coordinator, with options. The owner was unavailable, and on 2026-10-25 the decision was made under the owner's delegation by a Claude Fable 5.1 (medium) subagent of the coordinator, not by the owner: option (b), fix findings 1 and 3 as proposed, accept the record fix for finding 2, and run an exceptional fourth pass limited to these fixes, with no fifth pass.
  1. Medium, **resolved by the delegated decision:** a journal rolled back to before an applied acceptance yields an inventory whose `throughSequence` is below that acceptance, so the omission proves nothing, and with a recorded grant no re-send follows: the rollback stays undetected. `throughSequence` alone cannot tell a rollback from a delayed snapshot. Fixed as proposed: `worker.inventory.requested` on the command subject carries a fresh `requestId`, which the answering snapshot returns. In a snapshot that answers the latest request, a `throughSequence` below the highest applied sequence of the journal, or an omitted accepted assignment, is a rollback that starts reconciliation and keeps ownership and reservation. Tests cover both messages.
  2. Medium, **record fix accepted by the delegated decision:** this record listed `make verify` only for `d224549`, before the fixes. The section "Checks" above now lists the runs after each round, which took place at those revisions.
  3. Low, **resolved by the delegated decision:** the 403 response of `publishEvidence` still describes a worker that does not own the attempt at the current generation, which contradicts keeping older-generation evidence for audit. Fixed as proposed: 403 now means only that the worker never held the attempt at the stated generation, and its description says that evidence of a generation it held earlier is stored with `ownershipCurrent` false.

- **Pass 4 (exceptional) — session `01a170ac-b122-76b1-b6dc-17df074744eb`,** reviewed `git diff 3b6514f bb8e4d1` only, as the delegated decision limited it; the header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `835a3a58…9895`, equal. The reviewer confirmed pass-3 finding 3 fully resolved, and findings 1 and 2 in part. Findings: 0 Critical, 0 High, 3 Medium, 0 Low, none out of scope. Under the delegated decision a Medium finding stops the change for the owner, with no fifth pass; all three are **open**:
  1. Medium: the rollback rule compares a fresh snapshot with the highest sequence applied when the snapshot arrives. An observation applied between the request and the answer therefore makes a sound journal look rolled back. Proposed fix: keep the highest applied sequence of the journal when the request is issued and compare with that bound; bound the accepted assignments the same way.
  2. Medium: the rule that discards parts of a lower `snapshot` could discard the answer to the current request from a rolled-back journal, whose snapshot counter rolled back too. Proposed fix: check a complete answer to the current request for rollback before the `snapshot` filter; such an answer starts reconciliation without replacing a newer inventory.
  3. Medium: this record had no `make verify` run after the pass-3 fixes. The run at `8e9aa3b` is listed under "Checks" above; it took place before this pass, but was recorded only after it.

The JetStream spike wording of `8e9aa3b`, which the coordinator relayed from item 2, is outside the pass-4 scope and **has not been independently reviewed**.

## Remaining gates

- The owner's decision on the open pass-4 findings.
- Integration into `dev` by the coordinator, then archiving the change.
