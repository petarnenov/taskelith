## Why

The owner described the intended use of Taskelith: submit an intent or idea, run the full SDLC lifecycle, implement by gates, generate a blueprint of tasks with a dependency map, and dispatch tasks automatically in the order the map allows. The architecture and G1 progress stop at one change per task: there is no unit above a change, no dependency graph between changes, no automatic dispatch of a sequence of changes, and no priority field; the owner described priority as the dependency graph itself. The owner also decided that full autonomy up to the project's integration branch is exercised by a three-consul decision council, with promotion into `main` reserved to the owner and a human called only when the council cannot convene.

The owner approved recording these decisions on 2026-10-25 and required three things: the design must keep the hexagonal and microkernel adapter/plugin rules; the graph projection uses the Neo4j instance the project will already have, replaceable without touching the kernel; and implementation must not start until the owner explicitly authorizes it, while the G3 and G4 designs must already be compatible so the later introduction has minimal impact.

## What Changes

- Add [ADR 0013](../../../docs/decisions/0013-intents-campaigns-and-proposal-graphs.md): the intent, campaign, change, stage, task hierarchy; recursive proposal generation; the two edge kinds and their validation; the blueprint manifest in Git with a PostgreSQL mirror and a replaceable Neo4j projection behind a `BlueprintGraph` port; readiness as the only ordering rule and as necessary rather than sufficient for dispatch; dependency-preserving operator overrides, including a rejected hold on a requested dependent's prerequisite; the merge ladder with an owner-only merge into `main`; parent approval covering generated work; and the forward-compatibility obligations for G3 and G4.
- Add [ADR 0014](../../../docs/decisions/0014-decision-council-and-delegated-approval.md): three seats of different harnesses with model and effort; three discussion cycles; 2:1 majority; the owner-approved default precedence Claude, Codex, OpenCode when there is no majority; escalation to a human when all three seats cannot convene; the council's authority and its hard limits; independence from the implemented and reviewed change; immutable decision records; standing approval per intent instead of a vote per change; revocable delegation; and the delivery order that waits for three admitted harnesses.
- Update the governance policy to version 4: the council as delegated approval authority up to the integration branch, the owner-only promotion into `main`, and the council as an eligible authority at Accept and integrate.
- Add the delegated decision principal to the trust model and distinguish its SDLC approval from a native runtime approval.
- Extend the architecture vocabulary with intent, campaign, blueprint, and council decision; add invariants 16 and 17; add the campaign model to section 6; and note in section 13 and section 15 that the decisions authorize no implementation and bind the G3 and G4 designs.
- Record the intent and campaign graph gap in the SDLC framework mapping.

## Capabilities

### New Capabilities

None. The change records decisions and obligations; it implements no capability.

### Modified Capabilities

None. Documentation only; the change sets `skip_specs: true`. The campaign and council capabilities are specified in the change that implements them, after the owner authorizes it.

## Impact

Documentation only: two ADRs, the governance policy, the trust model, the architecture, and the SDLC framework mapping. No product code, runtime behavior, dependency, schema, contract, SPA screen, or deployment changes. Implementation of campaigns and of the council is not authorized; it starts only on an explicit owner instruction, and the council additionally waits for three admitted harnesses.
