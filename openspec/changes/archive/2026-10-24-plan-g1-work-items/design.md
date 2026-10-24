## Context

G1 builds the kernel, the framework-neutral SDLC model, gates and admission, the SDLC framework port, the plugin manifest, and the first wire contracts. Little product code exists, and the code layout and schema approach are still open. Versioned plugin manifests belong to G4, so G1 pulls forward only the registration the first adapter needs.

## Goals / Non-Goals

Record an ordered, parallelizable plan and the decisions that block it. Do not implement any item or decide on the owner's behalf.

## Decisions

- One OpenSpec change per work item, so that each is reviewed and merged independently, in parallel where its dependencies allow.
- Only the contract tooling evaluation (item 3) depends on no open decision and no other item; SpecKit capture (item 9) can start once D5 is decided.
- The plan lives in `docs/` beside the foundation ledger; each item's change records its own evidence.

## Risks / Trade-offs

The plan may change as items reveal new constraints; later changes update it. The recommendations come from the author and could bias the owner's choice; they are labelled as proposals.
