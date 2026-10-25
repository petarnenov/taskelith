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
- Compatibility: the SDLC documents are unchanged and report 0 breaking changes; the execution documents are new. Every requirement of the spec deltas is under 500 characters, and the new capability starts with a `## Purpose`.
- Open points for the coordinator: the subject names wait for item 2; the operator credential on the SDLC operations is left to item 16. Before pass 1 the delegation request was excluded; pass-1 finding 4 added it.

## Checks

In the worktree at `d224549`, `make verify` passed: 397 tests passed, 0 failed; coverage over the compiled product code 99.82% lines, 96.51% branches, 99.51% functions, with `contracts/protocol-version.js` and `scheduling/assignment.js` at 100%; "Every comment is within the comment length rule."; "Workspace and hexagonal boundary checks passed."; "Every product module is in the coverage report."; `make contract-compatibility` reported 0 breaking changes for both SDLC documents and both execution documents absent at the merge base `cb97aee`; "Every active OpenSpec change archives into strictly valid specs."; "Packed file allowlist and installed CLI verification passed." `npm run openspec -- validate define-execution-wire-contracts --strict` passed.

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
