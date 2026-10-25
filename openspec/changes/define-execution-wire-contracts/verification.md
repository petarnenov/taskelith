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
- Open points for the coordinator: the subject names wait for item 2; the delegation request of capacity reservation section 7 is excluded; the operator credential on the SDLC operations is left to item 16.

## Checks

In the worktree at `d224549`, `make verify` passed: 397 tests passed, 0 failed; coverage over the compiled product code 99.82% lines, 96.51% branches, 99.51% functions, with `contracts/protocol-version.js` and `scheduling/assignment.js` at 100%; "Every comment is within the comment length rule."; "Workspace and hexagonal boundary checks passed."; "Every product module is in the coverage report."; `make contract-compatibility` reported 0 breaking changes for both SDLC documents and both execution documents absent at the merge base `cb97aee`; "Every active OpenSpec change archives into strictly valid specs."; "Packed file allowlist and installed CLI verification passed." `npm run openspec -- validate define-execution-wire-contracts --strict` passed.
