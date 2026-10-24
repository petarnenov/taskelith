# ADR 0010: G1 closure and deferrals

Date: 2026-10-25
Status: Recorded under the owner's authorization of 2026-10-24 to merge each completed and reviewed G1 item and start the next one ([G1 work plan](../g1-plan.md)); this is item 14 of that plan. Each deferral below follows a decision already recorded, named with it, except the two entries marked as the author's assignment, for the owner to confirm or change. On 2026-10-25 the owner decided that G2 starts when this closure merges into `dev`. Promotion to `main` is a separate, later decision.

## Context

G1's exit evidence in [architecture section 13](../architecture.md#delivery-sequence) is: domain tests reject invalid transitions and unbound implementation tasks, planning tasks can create missing specs, and structural validation and semantic approval remain distinct. Items 1 to 13 of the G1 work plan are merged into `dev` and archived. Section 15 lists contracts to resolve before G2 execution implementation; G1 resolved only one of them, the both-framework mapping feasibility, by freezing the `SdlcFramework` port against the OpenSpec and SpecKit fixtures ([ADR 0009](0009-frozen-sdlc-framework-port.md)).

## Decisions

1. **Exit evidence.** The `@taskelith/sdlc` tests provide it:
   - Invalid transitions: `gate.test.ts`, `stage-progress.test.ts`, and `task-admission.test.ts` reject every gate, stage, and admission transition outside the documented tables, and every write at an outdated generation.
   - Unbound implementation tasks: `task-admission.test.ts` rejects an implementation task without a work item, or before its prerequisite stages have passed.
   - Missing specs: `task-admission-service.test.ts` admits a planning task without a specification, records the specification it creates, and admits implementation only when bound to it.
   - Distinct evidence: `gate.test.ts` shows that structural validation and platform records cannot satisfy a semantic gate, and that a semantic approval cannot satisfy a structural or platform-managed gate.

   The verification record of change `close-g1` reproduces these tests and `make verify` from a fresh clone.
2. **Deferrals.** These items move to the gate that needs them:
   - The pre-G2 contracts of section 15: launch linearization and expiry, supervisor identity and adoption, local journal durability, and capacity reservations. G2, before any execution code, as [G2 work plan](../g2-plan.md) items 3 to 6.
   - The ownership generation of an admission (G1 item 7) and the attempt and assignment state machines (G1 decision D4 (a)): G2, [G2 work plan](../g2-plan.md) item 7.
   - Durable adapters of the module's repositories: G2, with PostgreSQL (G1 item 7 design).
   - The SpecKit adapter, which replaces the test-only normaliser, and SpecKit's agent steps and interactive gate path run through a qualified harness: G4 ([ADR 0009](0009-frozen-sdlc-framework-port.md)). SpecKit's admission evidence: G8 (G1 item 9). A SpecKit run on arm64 (G1 item 9, which names no gate): G4, with the adapter. Author's assignment.
   - Versioned plugin manifests, manifest version negotiation, plugin API ranges wider than a caret range, and UI selection: G4 (G1 item 8, architecture section 13).
   - A generated manifest type replacing the hand-written `PluginManifest` (G1 item 8 design decision 3, which names no gate): G4, with the versioned manifests. Author's assignment.
3. **G1 closure.** G1 is closed: its exit evidence was reproduced from a fresh clone, and every G1 work item is done, with the work left open deferred above.

## Consequences

The foundation ledger, the G1 and G2 work plans, and architecture sections 13 and 15 record the closure and the deferrals. Closing G1 does not claim that any runtime, worker, or integration exists. G2 starts in the dependency order of its plan.
