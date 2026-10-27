## Context

ADR 0015 closed G2 on 2026-10-27. The G3 plan said it would be finalized then, by adding the closure's deferrals to G3 and correcting the starting point to G2 as built. The ADR is being edited by other sessions, so this change cites it and does not edit it.

## Goals / Non-Goals

Goals: the plan's status, its starting point, and a home in the plan for every ADR 0015 deferral whose gate is G3, with the dependency and wave tables to match.

Non-goals: any new owner decision, any change to D1 to D18, starting item 0 or any other item, editing ADR 0015 or the foundation ledger, and deferrals whose gate is not G3, which are listed with their gate only.

## Decisions

- **One table for every deferral.** "G2 closure deferrals" lists each ADR 0015 decision 5 entry in its order and group, so a reader can check exhaustiveness against the ADR. The table names a gate and a G3 item only; the records and owners stay in the ADR.
- **Existing items first.** A deferral goes to the existing item whose scope already covers its subject: TLS and rotated credentials to item 26, the self-check wiring to item 27, the evidence download and retirement "with login" to item 10, with the retirement operation in item 9 (contract first), and the bubblewrap sandbox and Linux model-calling scenarios to item 35, as ADR 0015 names.
- **Writers that invalidate launches as a rule.** Several items add writers of gates or policy revisions (for example items 21, 22, and 23), and the launch authorization contract (sections 5 and 11) already requires each such writer to call `invalidateLaunches` when it is added. The obligation is stated once in the "Work items" introduction, as the plan already does for crash points, instead of being copied into each row. No item names the first writer of artifact revisions, so the rule names it by role.
- **New items keep the numbers.** Items 43 and 44 are appended, so the item numbers that other documents and archived records cite stay valid. Item 43 depends only on item 0 and is in wave 1; item 44 depends on items 9 and 10 and is in wave 5. Neither lies on a chain longer than the one the plan names, so that chain is unchanged.
- **Item 43 holds the deferred native acceptance rows together.** ADR 0015 defers race g and the 24c-dependent rows "on the two macOS entries, with the arm64 re-run above, and on the two Linux entries", so the re-run and those rows form one item. The owner runs the arm64 re-run with physical access to the MacBook Air, as the owner decided.
- **Item 44 for re-admission and the queue surface.** No existing item covers re-admission by a writer of admissions or a surface for the reconciliation queue; the new item uses the scope `wire-launch-authority-reconciliation` left open and puts its operations in item 9.
- **Item 0 keeps the owner's checks.** Its per-item checks are the owner's decision of 2026-10-26 and are not changed; its scope now names G2 as ADR 0015 records it, with the later changes of the "Starting point".
- **Placement after the closure.** #344 merged after `bd6108d4`, the revision the closure reproduced, and before the closure's merge #347; #348 merged after #347. The starting point says so, instead of calling both "after the closure". `persist-placement-rotation-cursor` landed with #349 (merge `eda6c283`) while this change was in progress; after merging `dev`, the starting point describes the cursor as persisted, with that change's limitations.

## Coordinator decisions of 2026-10-27

The questions of the first draft, answered by coordinator Niki:

- **Writers rule (Q1).** The "Work items" rule for writers that invalidate launches stays as written, without naming an item for the first writer of artifact revisions (coordinator's decision).
- **New items (Q3).** Items 43 and 44 stay as new items (coordinator's decision).
- **G3 start (Q4).** The owner started G3 on 2026-10-27, relayed by the coordinator; the status records it, and the D16 (a) wording states that items now start in dependency order and by the waves, item 0 first. D16 itself is unchanged.
- **PostgreSQL TLS (Q2).** Open with the owner: ADR 0015 lists plain PostgreSQL on localhost under the TLS deferral to item 26, while D11 names only the browser endpoint, the API, and NATS. Item 26 and the deferral table mark it open; this change does not decide it.

## Risks / Trade-offs

- The deferral table repeats ADR 0015 in short form, so a later ADR edit can make it stale; item 0 re-reviews against G2 as built.
- The writers rule names no item for the first writer of artifact revisions; the item that adds it must extend `CurrentRevisions`.

## Review checklist

Printed for this change by the coordinator's brief:

```
Review checklist (capabilities delivery-planning, foundation-closure; files docs/g3-plan.md, docs/decisions/**), most frequent finding categories first:
1. docs (2): Documentation is missing, wrong, or out of date with the change. Example: "The foundation ledger omitted the multi-architecture make verify-linux-cgroup tooling follow-up"
2. process (2): A protocol, governance, or review rule was not followed. Example: "The Linux cancellation and connectivity rows pointed to 24c, whose records come from the test-side process-group launch host on Linux x64, with no deferral"
3. evidence-mismatch (1): A recorded result, count, or claim differs from what the checks show. Example: "The row map gave report-control-plane-failure-cause and report-all-unconfirmed-sealed-executions the pull request of another change"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. docs (25) 2. evidence-mismatch (24) 3. stale-citation (14) 4. spec-wording (12) 5. contract-drift (5) 6. process (3)
```
