## Why

Architecture section 6 requires that "a changed code head invalidates head-bound verification/review", and R21 (architecture section 14) requires that an agent "cannot restore approval by editing a checkbox". ADR 0010 deferred the code-head identity to G3, and G3 item 6 (`define-git-workspace-contract`, refined by `align-git-workspace-adapter-contract`) defined it as `CodeHeadIdentity` in the workspace module, leaving to item 17 how evidence carries it (Git workspace contract section 14). The SDLC gates of G1 bind evidence only to artifact revisions, so a new head leaves an approval current, evidence of any head decides a gate, and a superseded approval can pass the gate again once an edit restores the reviewed content. The coordinator's brief (Niki, 2026-10-28) assigns G3 item 17 (`docs/g3-plan.md`, row 17).

## What Changes

- **Code head in the SDLC module.** `CodeHeadIdentity` (repository, commit, tree), `RepositoryId`, and `isSameCodeHead` move into `@taskelith/sdlc`, with a new opaque `CodeObjectId` for the commit and tree names, as a value that module only compares. The workspace module's `CodeHeadIdentity` extends it with Git object names and re-exports `isSameCodeHead` and `RepositoryId`, so its exports keep their names and a workspace head is an SDLC head without a conversion.
- **Head-bound gates.** A gate opened with a `codeHead` is head-bound for its life. Evidence decides it only when it names the same code head. `isGateOutdatedByCodeHead` and `markGateStaleByCodeHead` make it stale for any other head, keeping its decision. `reopenGateAtCodeHead` reopens it for a subject at a new head; `reopenGate` refuses it.
- **Evidence at a code head and for a gate.** The three evidence kinds take an optional `codeHead`, `gateId`, and `gateGeneration`; every gate accepts evidence only for its id and current generation, so a superseded approval never decides a reopened gate, nor an approval for one gate another (design decision 8).
- **Wire contract.** The SDLC AsyncAPI document defines `CodeHeadIdentity` and `CodeObjectId` and an optional `codeHead` on the gate and the three evidence kinds, and an optional `gateId` and `gateGeneration` on the evidence kinds, version 0.4.0.
- **Repository conformance.** The gate repository suite stores and reads back a head-bound gate.
- **Naming decision.** The evidence record's `codeRevision` and the merge queue's `CodeHead` stay as they are; a follow-up change replaces both with `CodeHeadIdentity` (design decision 1).
- **Docs.** The Git workspace contract sections 5, 13, and 14.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sdlc-gates`: "Head-bound gates", "Evidence bound to its gate and generation", "Evidence bound to the code head", "Invalidation by a new code head", and "Approval not restored by an artifact edit" added; "Gate transitions" modified, so that its scenario "Reopening a gate" names `reopenGate` and `reopenGateAtCodeHead`.
- `sdlc-workflow-model`: "Code-head identity" added.
- `sdlc-wire-contracts`: "Code head on the wire" added.

## Impact

- `packages/modules/sdlc` (private): `domain/code-head.ts` (new), `domain/gate.ts`, `domain/gate-evidence.ts`, `index.ts`, `ports/repository-conformance.ts`, and `test/code-head-binding.test.ts` (new).
- `packages/modules/workspace` (private): `domain/code-head.ts` refines the SDLC value; no export changes its name.
- `packages/modules/execution` (private): its repository conformance suite and test fixtures record gate evidence for the gate and its generation (design decision 8).
- `packages/contracts` (private): `documents/sdlc.asyncapi.json` 0.3.0 to 0.4.0, and `test/contracts.test.ts`.
- `docs/contracts/git-workspace.md` sections 5, 13, and 14.
- The published `taskelith` package does not change.
- Out of scope: the review and verification stages that record evidence at a head (item 21), auto-merge (item 23), the SCM plugin (item 20), the UI, the evidence record's `codeRevision`, and the merge queue's `CodeHead`.
