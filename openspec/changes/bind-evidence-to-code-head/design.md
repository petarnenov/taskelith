## Context

The coordinator's brief (Niki, 2026-10-28) assigns G3 item 17 (`docs/g3-plan.md`, row 17): verification and review evidence bound to the code-head identity, so that a new head makes it stale and editing an artifact cannot restore an approval. Sources: the code-head deferral of ADR 0010 (`docs/decisions/0010-g1-closure.md`, decision 2, "Deferrals"), architecture section 6 ("A changed code head invalidates head-bound verification/review"), R21 in architecture section 14, and G2 items 19 (`implement-evidence-store`) and 21 (`implement-execution-reconciliation`).

### What exists at dev `a899d5d2`

- **Gates.** `packages/modules/sdlc/src/domain/gate.ts`: a gate requires one evidence kind about a subject of artifact revisions; `markGateStale` makes it stale for a new artifact revision and keeps its decision; `reopenGate` returns it to pending for a new subject. Nothing names a code head.
- **Gate evidence.** `packages/modules/sdlc/src/domain/gate-evidence.ts`: structural validation, semantic approval, and platform record, each with a subject, a time, and a reference.
- **Code head.** `packages/modules/workspace/src/domain/code-head.ts`: `CodeHeadIdentity` (repository, commit, tree), `GitObjectId`, `RepositoryId`, `parseCodeHeadIdentity`, and `isSameCodeHead` (Git workspace contract section 5). The workspace module depends on the SDLC module, so the SDLC module cannot import it.
- **Other names.** The evidence record of `@taskelith/execution` has `codeRevision: Identifier<'CodeRevision'>` (`packages/modules/execution/src/domain/evidence.ts`), which the execution OpenAPI operation `publishEvidence` carries; the merge queue port of `@taskelith/integrations` has `CodeHead = Identifier<'CodeHead'>` (`packages/modules/integrations/src/ports/auto-merge.ts`). The Git workspace contract section 14 leaves to item 17 how they carry the repository, commit, and tree, and to a follow-up change the names.
- **Wire.** The SDLC AsyncAPI document 0.3.0 defines the gate and the three evidence kinds with `additionalProperties: false`.

## Goals / Non-Goals

**Goals:** one code-head concept for the SDLC and workspace modules; head-bound gates whose evidence must name their code head; staleness for any other head; no restored approval after an edit; the wire contract and the repository suite for head-bound gates; fail-before tests for the three cases of the brief.

**Non-Goals:** the review and verification stages that record evidence at a head and apply staleness when a head moves (item 21), auto-merge (item 23), the SCM plugin (item 20), the UI, and changes to the evidence record or the merge queue port.

## Decisions

1. **One code-head concept, owned by the SDLC module (naming convergence).** Options considered:
    - (a) The SDLC module defines `CodeHeadIdentity` with opaque `CodeObjectId` names and `isSameCodeHead`; the workspace module's `CodeHeadIdentity` extends it with `GitObjectId` names (`GitObjectId` is a `CodeObjectId` with a further brand) and re-exports `isSameCodeHead` and `RepositoryId`. **Chosen.** One term and one equality; every workspace export keeps its name and shape; a workspace head is an SDLC head without a conversion, which the compiler checks; the SDLC module stays free of a VCS name, as `sdlc-workflow-model` "SDLC module package" requires.
    - (b) Move the whole Git-validated value into the SDLC module. Rejected: it puts Git object grammar into the SCM-neutral SDLC module.
    - (c) Move it into the kernel. Rejected: `shared-kernel` "Small kernel" forbids domain-specific identifiers.
    - (d) A second SDLC value with a mapping function in the workspace module. Rejected: two types for one concept, and a mapping that nothing calls yet.

    For the evidence record's `codeRevision` and the merge queue's `CodeHead`, options considered: (i) keep both now and replace them with `CodeHeadIdentity`, as a `codeHead` property, in a follow-up change; (ii) encode the head as one string in `codeRevision`, which needs a second grammar for one value and a parser in every reader; (iii) replace them now, which changes the execution OpenAPI operation `publishEvidence`, a wire contract, and the auto-merge port of another module, beyond the scope and the brief's limit. **Chosen by the coordinator (Niki, 2026-10-28): (i).** This change implements only (a), which (i) does not need; the SDLC-owned `CodeHeadIdentity` stays as implemented, and the follow-up change `align-code-head-names` converges `codeRevision` and `CodeHead` on it and must land before G3 item 21, which decides a gate from an evidence record. Until then nothing maps `codeRevision` to a gate's code head.
2. **The code head is a property of the gate, fixed for its life.** `Gate.codeHead` is optional; a gate opened with one is head-bound. Every transition keeps it except `reopenGateAtCodeHead`, which replaces the subject and the head. Putting the head into the subject would change the meaning of `GateSubject` (revisions, one per artifact) and every caller; a separate aggregate would split one decision into two records.
3. **Two reopen operations instead of an optional parameter.** `reopenGate` keeps its signature and refuses a head-bound gate; `reopenGateAtCodeHead` takes `{ subject, codeHead }` and refuses a gate without a head. So no caller can drop a gate's head binding by reopening it with the old operation, and no call takes a flag-like optional argument.
4. **Staleness is decided in the pure domain.** `isGateOutdatedByCodeHead` is true exactly when the gate is head-bound and the head differs in any part, so a new commit with an unchanged tree outdates it (Git workspace contract section 5). `markGateStaleByCodeHead` applies it and keeps the decision, as `markGateStale` does for an artifact revision. Who reports a new head and marks the run's gates is item 21's stage service; no head writer exists before it, so this change adds no port for current heads.
5. **No restored approval after an edit.** Four rules close the path: an artifact revision only makes a gate stale, never passed (G1 transitions); a stale head-bound gate reopens only at a code head and loses its decision; evidence decides it only at that head; and only for the generation it was recorded for (decision 8). An edit lands in a new commit, so an edit that restores the reviewed content yields another head, and the superseded approval names the old one. The head alone is not enough, because a gate can be reopened at the approved head again: after an artifact edit at the same head, or after a new head when the work returns to the approved commit (review pass 1, H1).
6. **A gate without a code head ignores the evidence's head.** Chosen by the coordinator (Niki, 2026-10-28) as option (a): a gate without a code head accepts evidence at any head or none, and a head-bound gate rejects evidence from a different head or without one with `precondition-failed`. Specification gates judge artifacts, not code; an evidence record names a code revision whatever it judges (architecture section 8). Option (b), a code head on every gate, is G3 item 21's decision.
7. **Wire version 0.4.0.** The optional `codeHead` is new in four schemas, and the optional `gateGeneration` in the three evidence kinds (decision 8), all with `additionalProperties: false`, so a 0.3.0 consumer rejects a head-bound gate. `make contract-compatibility` counts the changes as breaking (132 against `a899d5d2` before decision 8, 219 against `9196804b` after it; `verification.md` records each run), and the minor version, while the major version is 0, declares them.

8. **Head-bound evidence names the gate generation it was recorded for** (review pass 1, H1). Evidence gets an optional `gateGeneration`; a head-bound gate accepts evidence only when it equals the gate's generation, and rejects other evidence, or evidence without one, with `precondition-failed`. A gate turns pending only when it is opened or reopened, each at a new generation, and stays pending until it is decided, blocked, or made stale, so the generation of a pending gate identifies its decision cycle, and evidence of an earlier cycle names an earlier generation. Options considered:
    - (a) The gate's generation. **Chosen.** No new gate field, stored gate, or gate schema; one optional evidence field; the writer that records evidence already names the generation it read (`expectedGeneration`).
    - (b) A separate decision-cycle counter on the gate, renewed on reopening, as the reviewer suggested. Rejected: it duplicates what the pending generation already identifies, and adds a required field to the gate, its stored JSON, and its wire schema.
    - (c) Evidence recorded no earlier than the reopening (`recordedAt` against `changedAt`). Rejected: it compares times that callers supply, possibly from other clocks, and cannot tell evidence of the same instant apart.

    As decision 6 does for the code head, a gate without a code head ignores `gateGeneration`; G1's `reopenGate` keeps its behaviour, and whether every gate requires the binding is G3 item 21's decision.

## Risks / Trade-offs

- The SDLC tests build heads with casts to `CodeObjectId`, because the SDLC module has no parser: its only producer is the workspace module's `parseCodeHeadIdentity`, which validates Git names.
- The PostgreSQL gate repository stores the gate as JSON, so a head-bound gate needs no schema change; the shared repository suite now reads one back, but its PostgreSQL run needs Docker (`make verify`).
- The stage service of item 21 must record head-bound evidence for the generation of the pending gate it reads; evidence that a reviewer starts before a reopening is rejected after it and must be recorded again.
- Until the follow-up change `align-code-head-names` (decision 1 (i)), an evidence record's `codeRevision` cannot decide a head-bound gate; it must land before item 21.

## Review checklist

Invocation (the brief's, without `--save`): `make findings ARGS="checklist --capability sdlc-gates,evidence-store,sdlc-workflow-model --files packages/modules/sdlc/**,docs/contracts/sdlc*.md,docs/contracts/evidence*.md --at a899d5d2"`

```text
Review checklist (capabilities sdlc-gates, evidence-store, sdlc-workflow-model; files packages/modules/sdlc/**, docs/contracts/sdlc*.md, docs/contracts/evidence*.md): no archived findings match.

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (73): A recorded result, count, or claim differs from what the checks show. Example: "The record called the coverage of the scripts unmeasured instead of measuring it"
2. docs (49): Documentation is missing, wrong, or out of date with the change. Example: "The proposal said no other file changes and no other tracked file documents the invocation, though the change adds OpenSpec records and archived records quote the old invocation"
3. spec-wording (41): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Second Claude Code slot ends with "no rotation across Claude accounts can arise", which is untestable and goes beyond section 7.1"
4. stale-citation (30): A cited file line, commit, or record no longer matches its target. Example: "Tasks and design listed the spec changes without the two requirements and new scenarios added after pass 1"
5. contract-drift (14): Code, a contract document, and its specification disagree. Example: "The spec delta and the protocol did not say that both parts of an OpenCode model must be non-empty"
6. process (14): A protocol, governance, or review rule was not followed. Example: "The record did not include the coordinator's passing make verify on the pass 1 head and still listed it as a gate"
7. scope (6): The change does more or less than its assigned scope. Example: "The worker start slot rule sits in git-workspace-port"

Dev commit: a899d5d2e42f504ede22fd18ac9f71b280982ca8.
```

The checklist's file globs cover `packages/modules/sdlc/**`; this change also touches `packages/modules/workspace/src/domain/code-head.ts`, `packages/contracts`, and `docs/contracts/git-workspace.md`, which no glob names. How the records meet the record-quality list: evidence-mismatch (every count and result in `verification.md` comes from a command it names, on a named revision); docs (the Git workspace contract sections 5 and 14 and the AsyncAPI descriptions change with the code); spec-wording (each new requirement names its operation and failure code, stays below 500 characters, and has a scenario that a named test checks); stale-citation (citations name files and sections, not line numbers); contract-drift (the AsyncAPI document, the spec deltas, the contract, and the domain change together, and a contracts test checks a head-bound gate on the wire); process (the change is bound to OpenSpec, the checklist is saved unedited, and review passes are left to the coordinator); scope (no stage service, merge, SCM, or UI code; decision 1 (i) goes to the follow-up change `align-code-head-names`).
