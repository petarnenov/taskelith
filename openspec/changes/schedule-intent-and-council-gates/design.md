## Context

ADR 0013 "Delivery and authorization" and ADR 0014 decision 8 leave the delivery gate of the intent model and of the council unfixed, and the [delivery sequence](/docs/architecture.md#delivery-sequence) ends at G8. On 2026-10-28 the owner approved the coordinator's (Niki) three recommendations on the timing of ADR 0013; this change records them.

## Decisions

- **D1. One new ADR.** The gates, their order, the ADR 0003 amendment, and the authorization rule are owner decisions, so they go into [ADR 0016](/docs/decisions/0016-delivery-gates-for-intents-and-council.md) with the sections of ADR 0013 to ADR 0015 (Date, Status, Context, Decisions, Consequences). ADR 0013, ADR 0014, and ADR 0003 keep their decisions: each gets one sentence in its status line, and ADR 0003 decision 1 gets an italic dated amendment, the form decision 11 already uses for ADR 0008.
- **D2. The obligation trace.** Each obligation of the "Forward-compatibility obligations" sections of ADR 0013 and ADR 0014 is one row of the new G3 plan section; ADR 0013's second bullet is split into the project setting and the workspace, because different items meet them. A row is "covered" only with a `file:line` that meets it as written, and names the items that must keep it; otherwise it is "open" and names the closing item. Rows that no G3 item can meet, the blueprint mapping and the council in the board and inbox, name the gate that does.
- **D3. Rows 11 and 22.** The brief asks to amend these two rows. Both get a dated scope note, the form the plan already uses for item 12, instead of a rewrite of the scope.
- **D4. Model and effort per session.** The merged item 3 contract has no model or effort in `startSession`. The brief names items 3, 5, and 12; item 3 is merged, so the row names items 18 and 19, the first host and plugin to start sessions, as closing it through a versioned contract change. Their rows are not amended, because the brief asks only for rows 11 and 22; the trace carries the obligation into their briefs (ADR 0016 decision 1).
- **D5. G10 exit evidence.** The owner fixed G9's exit evidence but not G10's. The architecture row needs one, so it states the author's reading of ADR 0014: OpenCode admitted, the council deciding with three seats, decisions as immutable records on the board and in the inbox, and escalation when the seats cannot convene. ADR 0016 does not state it, so the G10 plan can refine it.
- **D6. Spec delta.** Three ADDED requirements in `delivery-planning`, each under 500 characters (403, 171, and 284), so that the archived spec passes strict validation. The gates and the obligation trace are planning rules, which is that capability's purpose.

## Not changed

- `docs/foundation.md:35` and `docs/decisions/0007-g0-closure.md:19` say Antigravity CLI and OpenCode are qualified with their plugins after G4, which stays true; `docs/decisions/0014-decision-council-and-delegated-approval.md:12` is ADR context.
- `docs/sdlc-framework-mapping.md:91` says the blueprint mapping is added "when that gate is implemented", which ADR 0016 does not contradict.
- The G3 items, waves, and dependencies other than the scope notes of items 11 and 22.

## Risks

- The obligation rows cite line numbers at `a3a0ac4c`; later edits move them.
- Item 18 and 19 briefs must carry the model and effort obligation, or the gap stays open.

## Review checklist

The brief's invocation, run at `a3a0ac4c`: `make findings ARGS="checklist --capability delivery-planning --files docs/architecture.md,docs/g3-plan.md,docs/decisions/** --save schedule-intent-and-council-gates --at a3a0ac4cea7cbfa5b5ff7de0357dc74a5a42dfc0 --size S-M"`. The output:

```text
Review checklist (capabilities delivery-planning; files docs/architecture.md, docs/g3-plan.md, docs/decisions/**), most frequent finding categories first:
1. docs (16): Documentation is missing, wrong, or out of date with the change. Example: "The amendment says other harnesses are unchanged, though the decision concerns Claude subscriptions, not only the Claude Code harness"
2. spec-wording (4): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "The deferral table legend called entries without a gate not open work and used a dash for an open owner item"
3. process (3): A protocol, governance, or review rule was not followed. Example: "Item 26 left PostgreSQL TLS open with the owner but its Blocked by column named no open decision"
4. stale-citation (2): A cited file line, commit, or record no longer matches its target. Example: "ADR 0015 still cites the removed in-memory cursor field of the placement service"
5. evidence-mismatch (1): A recorded result, count, or claim differs from what the checks show. Example: "The row map gave report-control-plane-failure-cause and report-all-unconfirmed-sealed-executions the pull request of another change"
6. scope (1): The change does more or less than its assigned scope. Example: "Plan item 44 re-admits only an attempt rejected under a stale admission, not one whose grant a product writer revoked"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (93): A recorded result, count, or claim differs from what the checks show. Example: "The pass 2 finding on the route record wording did not name pass 1 as the pass that missed it"
2. docs (58): Documentation is missing, wrong, or out of date with the change. Example: "The security heuristic missed this change's credential adapter without a recorded risk"
3. spec-wording (56): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "The archive evaluation requirement claimed features from before review, while the code takes the parent of the first commit naming pass 1"
4. stale-citation (33): A cited file line, commit, or record no longer matches its target. Example: "The contracts row of the rule table still justified the trigger by one archived case"
5. contract-drift (16): Code, a contract document, and its specification disagree. Example: "The spec delta and the protocol did not say that both parts of an OpenCode model must be non-empty"
6. process (15): A protocol, governance, or review rule was not followed. Example: "The route record was deleted and regenerated after review fixes, which worker step 4 does not ask for"
7. scope (6): The change does more or less than its assigned scope. Example: "The worker start slot rule sits in git-workspace-port"

Dev commit: a3a0ac4cea7cbfa5b5ff7de0357dc74a5a42dfc0.
```
