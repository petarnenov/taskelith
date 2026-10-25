## Context

G3 builds the usable web product and the first real agent on top of G2's durable execution slice. Its sources are the G3 row of architecture section 13, architecture sections 6, 7, 11, 14, and 15, ADR 0010's code-head deferral, ADR 0007's terms review and native acceptance rows, ADR 0008 and the `product-ui` specification, ADR 0005's account pools, ADR 0006 and the GitHub qualification, the Claude Code qualification, and the G3 hand-offs in the G2 contracts (subscription account slots in the capacity reservation contract, the agent harness port after G2 item 15).

## Goals / Non-Goals

Record an ordered, parallelizable draft plan and the decisions that block it, in the same shape as the G2 plan, with a column that marks the UI items. Do not implement, install, qualify, or start any item, and do not decide on the owner's behalf.

## Decisions

- The plan is a draft until G2 closes. Every item depends on the G2 closure; the "Source" column names the G2 items it builds on, and the finalized plan corrects the starting point to what G2 delivered.
- One OpenSpec change per work item, small enough for one worker and one review. The contracts (items 3 to 8), including the board, inbox, intake, write-back, and auto-merge ports that ADR 0008 decision 6 places in G3, come first, as the pre-G2 contracts did in G2.
- Dependency evaluation (item 1) covers every option of the library decisions, as G2 item 1 did, so that it can start before those decisions and supply their evidence. Candidate libraries appear only as options inside owner decisions.
- The worker admission port belongs to G2 by ADR 0008 decision 6, but the G2 plan has no item for it; item 27 holds it until the G2 closure delivers or defers it.
- The provider terms decision (D15) has no recommendation, because item 2 has not yet recorded the terms.
- The plan adds no requirement: `delivery-planning` already requires a plan per gate, so the change uses `skip_specs: true`.

## Risks / Trade-offs

G2 may deliver less or differently than planned, so the draft may change at finalization. The recommendations come from the author and could bias the owner's choice; they are labelled as proposals. The waves assume four sessions and that the decisions are made; they are a possible schedule, not a commitment.
