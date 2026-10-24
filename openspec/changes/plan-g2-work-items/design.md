## Context

G2 builds the durable execution vertical slice on top of G1's kernel, SDLC module, plugin SDK, and contracts. Its sources are architecture sections 5–9 and 12–15, ADR 0007's deferrals (data namespace, native acceptance, Linux harness qualification), G1 decision D4 (a) and G1 item 7's deferral of the ownership generation, and the storage, trust, operational-target, and worker-platform contracts.

## Goals / Non-Goals

Record an ordered, parallelizable plan and the decisions that block it, in the same shape as the G1 plan. Do not implement, install, or start any item, and do not decide on the owner's behalf.

## Decisions

- One OpenSpec change per work item, so that each is reviewed and merged independently.
- The four pre-G2 protocol contracts of section 15 are separate documentation and specification items (3–6) that every execution-code item depends on, directly or through the domain model (item 7).
- Infrastructure evaluation (item 1) covers every option of the version, library, journal, and test-infrastructure decisions, as G1 item 3 did, so that it can start before those decisions and supply their evidence.
- A JetStream spike (item 2) precedes the transport adapter, because architecture section 9 makes the broker choice conditional on it.
- Version facts in the decision table are observations of 2026-10-24 that item 1 confirms with digests.
- The plan adds no requirement: `delivery-planning` already requires a plan per gate from G1 onward, so the change uses `skip_specs: true`.

## Risks / Trade-offs

The plan may change as items reveal constraints; later changes update it. The recommendations come from the author and could bias the owner's choice; they are labelled as proposals. The waves assume four sessions and are a possible schedule, not a commitment.
