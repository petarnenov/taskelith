# ADR 0016: Delivery gates for intents and the decision council

Date: 2026-10-28
Status: Decided by the owner on 2026-10-28 in the project conversation, approving the three recommendations of the coordinator (Niki) on the timing of [ADR 0013](0013-intents-campaigns-and-proposal-graphs.md). It fixes the delivery gates that ADR 0013 and [ADR 0014](0014-decision-council-and-delegated-approval.md) left open and amends the delivery order of [ADR 0003](0003-first-integrations-and-plugin-kernel.md) decision 1. It authorizes no work item: each new gate first needs its own plan and the owner's authorization of that plan.

## Context

- ADR 0013 records the intent, campaign, and blueprint model and ADR 0014 the decision council. Both authorize no implementation, and both leave the delivery gate unfixed (ADR 0013 "Delivery and authorization", ADR 0014 decision 8). Their forward-compatibility obligations bind the G3 and G4 designs meanwhile.
- The [delivery sequence](../architecture.md#delivery-sequence) ends at G8, first release readiness, and has no gate for either model. ADR 0013 records the intended use of the product: an intent is planned, decomposed into a blueprint, and dispatched in the order the graph allows.
- The blueprint mapping is a new versioned operation of the SDLC framework plugin (ADR 0013 "Forward-compatibility obligations"). G4 delivers versioned plugin manifests and both the OpenSpec and SpecKit adapters, and neither framework has a native graph between changes ([SDLC framework mapping](../sdlc-framework-mapping.md), "Intent and campaign graph").
- The merge ladder of ADR 0013 decision 7 builds on G3's auto-merge, merge conflict flow, and review and verification stages ([G3 work plan](../g3-plan.md) items 23, 24, and 21).
- The council needs Claude Code, Codex, and OpenCode admitted (ADR 0014 decision 8). ADR 0003 decision 1 orders the harnesses Claude Code, Codex, Antigravity CLI, then OpenCode; the council does not need Antigravity CLI.

## Decisions

1. **The obligations are traced in the G3 plan.** The forward-compatibility obligations of ADR 0013 and ADR 0014 are traced to the G3 work items that must honour them, each with its status, in the [G3 work plan](../g3-plan.md#adr-0013-and-adr-0014-obligations), and carried into those items' briefs. Gaps are marked open with the item that closes them.
2. **G9, "Intents, campaigns, and blueprint dispatch".** G9 implements ADR 0013 decisions 1 to 8 with human approvals: until the council exists, human approvals apply (ADR 0014 decision 8).
    - **Start.** G9 starts after G4 closes, because the blueprint mapping is a new versioned operation of the framework plugin and G4 delivers versioned plugin manifests and both adapters. It builds on G3's auto-merge (item 23), merge conflict flow (item 24), and review and verification stages (item 21).
    - **Overlap.** G9 may overlap G5, and it closes before G6's pilot completes, so that the pilot runs graph-driven workload.
    - **Exit evidence.** An intent generates campaigns and changes with a validated blueprint manifest in Git; graph-ready changes dispatch in parallel within their reservations; `hold`, `release`, and `order` behave as ADR 0013 decision 6 states; changes merge into the intent's integration branch, and the intent is promoted through the promotion gate; a stale or missing graph projection neither dispatches nor blocks work; both frameworks produce the manifest.
3. **G10, "Decision council".** G10 admits the OpenCode harness plugin, with its qualification and admission as Codex has in G4, and constitutes the council of ADR 0014 (ADR 0013 decision 9). It starts after G9; the council is constituted only after OpenCode is admitted within G10.
4. **Amendment of ADR 0003 decision 1.** OpenCode may be admitted before Antigravity CLI, because the council needs Claude Code, Codex, and OpenCode and not Antigravity CLI. Antigravity CLI stays an additional harness plugin with no gate.
5. **Order.** G9 and G10 both precede G8, first release readiness, because ADR 0013 records the intended use of the product. Gate numbers are identifiers; the order is the one stated here, as the delivery sequence already lets gates overlap.
6. **Authorization.** Implementation of G9 and G10 is authorized only as gate plans. Each gate needs its own plan, like the [G3 work plan](../g3-plan.md), and the owner's authorization of that plan before its work items start, in line with ADR 0013 "Delivery and authorization" and ADR 0014 decision 8.

## Consequences

- The delivery sequence gains the G9 and G10 rows, and G8 follows both.
- The ADR 0013 and ADR 0014 status lines, ADR 0003 decision 1, and the architecture's delivery and decision sections point to this ADR; their decisions are otherwise unchanged.
- OpenCode's qualification moves into G10; Antigravity CLI's qualification stays with its plugin and blocks no gate.
- No intent, campaign, blueprint, dispatcher, council, or OpenCode plugin exists yet, and this ADR starts none: the G9 and G10 plans come first.
