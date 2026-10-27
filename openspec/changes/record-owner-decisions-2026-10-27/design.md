## Context

`recheck-provider-terms-pages` (#365) quoted in the [Claude Code qualification](/docs/qualification/claude-code.md#consequences-for-d15) the Usage Policy clauses on "services that route requests through consumer subscriptions" and on bypassing restrictions "including by circumvention of the account sign-up or log-in process", and the conditions under which a platform may host Claude Code, and left an open question for the owner on D15 (a) and ADR 0005 decision 2 ([archived design D4](/openspec/changes/archive/2026-10-27-recheck-provider-terms-pages/design.md)). On 2026-10-27 the owner answered it directly, not through the away delegate:

- Taskelith does not pool or rotate Claude subscriptions until a further owner decision.
- Support for the user's own API key comes first.
- Subscription use stays limited to the owner's own account, with no rotation.

The same day the owner confirmed an editorial note for ADR 0008 (part B), and the brief lists three stale facts (part C).

## Decisions

- **D1. Recorded as an amendment of ADR 0005 decision 2.** ADR 0005 already records owner amendments inline, as an italic "*Amendment, <date> (owner decision …):*" sentence after the decision's text (decisions 4 and 5), and names them in its status line; ADR 0003 decision 11 and ADR 0004 principle 8 do the same for ADR 0008. Decision 2 follows that form. The amendment states the three points, replaces "API-key billing is not used" for Claude Code only, and leaves the other harnesses unchanged. The ADR's Risks bullet that the terms are "not verified" and its status sentence "Provider terms for pooled subscriptions are not yet verified" are older than the terms reviews and are not changed here (see "Not changed").
- **D2. One slot, as the contract's mechanism.** The account pool is harness-neutral: no type, value, or test of the pool names a harness (contract section 1), and the control plane keeps the admitted pairs of harness plugin and mechanism outside the pool (section 7.1). "No pooling or rotation" and "the owner's own account" become an attribute of the admitted pair, a limit on the slots of its harness that are not `removed`, which the add-slot command checks; Claude Code's `subscription-token` pair allows one. A revoked slot counts, because a reinstatement would otherwise exceed the limit. Taskelith cannot check that the account is the owner's own; the contract says so. Mapping "the owner's own account" to one slot is the author's reading of the decision: two slots of one account would still spread work across slots, and a second account is excluded by the decision. `AccountSlots` has no read that counts a harness's slots across projects, so the contract leaves the check's mechanism to item 12, inside the `SERIALIZABLE` transaction that every slot change uses (section 2, rule 3).
- **D3. API key: a new G3 item, unplanned.** No API-key mechanism or delivery exists in the agent harness port or the account pool contract, and the `harness-account-pools` scenario "Non-subscription credential" still rejects an API key. Admitting one changes those contracts and the scenario, which is planning and design work beyond this change. G3 item 45 `support-claude-code-api-key` is added "Not yet planned" and in no wave, so the dependency order is not changed; ADR 0005, the contract, and the G3 scope notes point at it. Until it lands, the specs keep the subscription-only rule, which the amendment does not contradict: it orders the work and does not admit an API key by itself.
- **D4. ADR 0008 note, drafted, not applied (pending q40 landing).** `align-product-ports-with-g2-lifecycle` is not on `origin/dev` at `14e1a46e` (no `openspec/changes/archive/*-align-product-ports-with-g2-lifecycle`); its branch `origin/align-product-ports-with-g2-lifecycle` at `0a637301` carries the archived change. Its design D1 ("A card is a root run") and the contract section 3.3 "Card" that it writes define the terms: a card is one root workflow run keyed by `runId`; a task without a qualifier is a G2 task, one admission of a stage of a run, optionally to one work item; the task detail's "admission" of ADR 0008 decision 4 is the run's list of task admissions (`TaskDetail.tasks`). G2 `submitTask` names the stage `stageId` and the work item `workItem` (`apps/control-plane/src/application/task-service.ts:97`). The note links the contract section that does not exist on `dev` yet, so it is applied only after that change lands, as the only change to ADR 0008, after the end of decision 4's "Task detail" bullet. Draft:

  > *Editorial note, 2026-10-27 (owner-confirmed; terms of the [product ports contract](../contracts/product-ports.md#33-card) section 3.3):* a board card is one root workflow run, keyed by `runId`. Each of its tasks is a G2 task, admitted to one stage (`stageId`) and optionally one work item (`workItem`) of that run; the "admission" that the task detail shows is the run's list of those task admissions. The decisions above are unchanged.

  Before applying it, the anchor and the wording are checked against the merged contract.
- **D5. Stale rows.** The release cells are refreshed from `npm view <package> dist-tags` on 2026-10-27 at 21:28 UTC, with the date in the row. The candidates row keeps its other cells and the capability rows pinned to CLI 2.1.310 and SDK 0.3.310, the versions they were assessed at, and says so; only its LICENSE.md link moves to 2.1.312, whose file is byte-identical to that of 2.1.310. The qualification's pinned version stays 0.3.308; only the dist-tag observation changes. The `git-workspace-port` spec states no `list` order; the contract's "code point order" disagreed with the implementation and its conformance suite, which sort with JavaScript's default `Array.prototype.sort`, that is UTF-16 code unit order (`packages/modules/workspace/test/temp-dir-workspaces.ts:278`, `packages/modules/workspace/src/ports/workspace-conformance.ts:217`), the term "by code unit" that `execution-placement` uses. The contract now says UTF-16 code unit order; no spec delta, because the spec does not state the order.
- **D6. Spec deltas.** "Subscription account slots" (`harness-account-pools`) and "Admitted credential deliveries only" (`account-pool-port`) are copied whole from the living specs and edited; every scenario is kept and one is added to each. Their bodies are 484 and 477 characters. To stay under 500, the harness requirement drops "any number of slots MAY be added per harness"; no other limit is stated, so other harnesses still may have any number of slots.

## Not changed

- `docs/qualification/codex.md`, `docs/qualification/github.md`, and their D15 (a) rows: other harnesses and the SCM are unchanged by the decision.
- ADR 0005's status sentence and Risks bullet that the provider terms are not verified, older than the terms reviews of 2026-10-25 and 2026-10-27.
- `docs/g3-dependencies.md:92` names SDK 0.3.311 as the latest observed on 2026-10-27 before 0.3.312 was published at 18:37 UTC; it is another record's dated observation, by `refresh-g3-dependency-observations`.
- The `sdk.d.ts@0.3.310` links of the capability rows in `docs/integration-candidates.md:55` to `:60`, the 2.1.310 links of the Claude Code row's other cells, and the 2.1.310 and 2.1.311 mentions in `docs/fleet.md:23`, `docs/qualification/claude-code.md:155`, `docs/g3-dependencies.md:95` to `:101`, and archived records: each names the version that was used or assessed.
- The purpose of `harness-account-pools`, "pools of subscription accounts per harness", which still describes the other harnesses.

## Risks

- The npm dist-tags move often; the rows carry their observation date.
- The slot limit has no read on `AccountSlots` yet; item 12 must add it.

## Review checklist

The brief's invocation was `make findings ARGS="checklist --files docs/decisions/**,docs/account-pool.md,docs/g3-plan.md,docs/integration-candidates.md,docs/qualification/**,docs/contracts/git-workspace.md"`. It names `docs/account-pool.md`, which matches no file; the contract is `docs/contracts/account-pool.md`. The record keeps the brief's arguments, and `checklist.json` was saved with them plus `--save record-owner-decisions-2026-10-27 --at 14e1a46e361a0f070bdea104917e2261ec66f8e9 --size S-M`. The output:

```text
Review checklist (files docs/decisions/**, docs/account-pool.md, docs/g3-plan.md, docs/integration-candidates.md, docs/qualification/**, docs/contracts/git-workspace.md), most frequent finding categories first:
1. docs (15): Documentation is missing, wrong, or out of date with the change. Example: "The Codex status line still lists the provider terms review as open"
2. spec-wording (11): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "The contract does not fix the account and cgroup under which the Git processes of workspace operations run"
3. contract-drift (4): Code, a contract document, and its specification disagree. Example: "The safe name rule rejects client-chosen G2 task identifiers, so such a task never gets a workspace"
4. stale-citation (4): A cited file line, commit, or record no longer matches its target. Example: "The contract cites the wrong journal section and says the worker is the only writer under its directory"
5. process (3): A protocol, governance, or review rule was not followed. Example: "Item 26 left PostgreSQL TLS open with the owner but its Blocked by column named no open decision"
6. concurrency-race (2): Concurrent operations can interleave into a wrong state or result. Example: "The slot was free at the execution's exit while the reclaim program still ran as the shared account, so a next execution could signal or trace it"
7. error-handling (1): A failure is swallowed, misreported, or leaves inconsistent state. Example: "A failed reclaim program had no defined outcome, and without fs.protected_hardlinks an agent could link a control record into its checkout"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (57): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
2. docs (43): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
3. spec-wording (25): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
4. stale-citation (23): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
5. process (10): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
6. contract-drift (9): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
7. scope (5): The change does more or less than its assigned scope. Example: "Design D6 defines size M as a contract, its spec, and its port types, while the SCM follow-up also changes the port's readers and conformance case"

Dev commit: 14e1a46e361a0f070bdea104917e2261ec66f8e9.
```
