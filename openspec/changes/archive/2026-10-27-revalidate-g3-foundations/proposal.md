## Why

On 2026-10-26 the owner decided that, after the G2 closure and before any other G3 item starts, G3 item 0 re-reviews the merged G3 groundwork against G2 as built ([G3 work plan](/docs/g3-plan.md#work-items), row 0, and "Dependency order and parallel work"). Items 1, 2, 3, 5, 6, 7, and 8 were written while G2 was still in progress, against G2 as planned. G2 closed on 2026-10-27 ([ADR 0015](/docs/decisions/0015-g2-closure.md)), and three more placement changes landed after the closure draft: #344, #348, and #349. Any G3 implementation item that builds on a contract which no longer matches G2 would carry the mismatch into code.

## What Changes

- An independent revalidation of each merged G3 artifact, one per plan item: 1 (`qualify-g3-dependencies`), 2 (`review-g3-provider-terms`), 3 (`define-agent-harness-port`), 5 (`define-account-pool-contract` with `align-harness-identifiers`), 6 (`define-git-workspace-contract`), 7 (`define-scm-port`), and 8 (`define-product-ports`).
- Each artifact gets its own reviewers A and B, assigned by the coordinator, and at most three passes, under the review process of [governance](/docs/governance.md#independent-review-process) version 5.
- The review baseline is the merged artifact at `dev` `eda6c283` against G2 as built: ADR 0015 decisions 1 to 5, [foundation](/docs/foundation.md#g2-status) "G2 status", and #344, #348, and #349 ([design](design.md)).
- This change records the revalidation only. It fixes no finding in an artifact: each substantive finding becomes a follow-up change, listed in `verification.md` with a proposed name and a size (S, M, or L). Only corrections of this change's own records are fixed here.
- The coordinator, Niki, distributes the follow-up changes to the workers.
- `findings.jsonl` and `passes.jsonl` record every finding and pass with an `artifact` property, `item-1` to `item-8`, once the tooling change `scope-review-passes-by-artifact` is merged (a prerequisite, [design](design.md) "Records").

Item 0 is done when every follow-up change it lists has landed in `dev`. No other G3 item starts before that.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The revalidation is documentation only and changes no requirement; the follow-up changes modify the capabilities their findings name, among them `g3-dependency-evaluation`, `harness-qualification`, `scm-qualification`, `agent-harness-port`, `account-pool-port`, `git-workspace-port`, `scm-port`, and `product-ports`.

## Impact

Records under `openspec/changes/revalidate-g3-foundations/` only. No code, contract, specification, dependency, or runtime change. `docs/g3-plan.md` is not edited by this change.
