## Context

The coordinator's brief of 2026-10-27 asked to close G3 item 0 so that wave 1 can start, recording facts only. The facts come from `git log --merges origin/dev` (pull request numbers and titles), and the archived changes under `/openspec/changes/archive/`. `align-product-ports-with-g2-lifecycle` was first read on its branch at `0a637301` and, after it landed as #372 (`579c227d`), from its archived directory in `dev`.

## Decisions

1. **Item 0's change list.** The list is the revalidation and the follow-ups the coordinator named: those of the revalidation's table "Follow-up changes" ([its verification](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md#follow-up-changes)) and `record-hosted-runner-linux-acceptance` (#367). The plan states that #367 is not a follow-up of the revalidation. #361 and #370 are listed as related, not as item 0's changes.
2. **Last change and closure date.** `align-product-ports-with-g2-lifecycle` landed last, as #372, merged into `dev` on 2026-10-27 (`579c227d`). Its row names #372 and its subject, its records are linked from its archived directory, and item 0's closure date is 2026-10-27.
3. **Owner-confirmed delegate decisions.** The plan lists the four away-delegate decisions of item 0's changes, each with its source record, as confirmed by the owner on 2026-10-27; the source of the confirmation is the coordinator's message of 2026-10-27. The list stays under the item 0 closure and changes no "Blocked by" entry. The optional ADR 0008 editorial note that `align-product-ports-with-g2-lifecycle` names is a separate documentation change by another worker and is not listed here.
4. **Accepted records unchanged.** ADR 0015 still calls the hosted-runner check open (decision 3 and decision 5); it is an accepted record and is not edited. ADR 0008 is not edited either.

## Review checklist

The output of `make findings ARGS="checklist --files docs/g3-plan.md,docs/foundation.md"` on the tree merged with `origin/dev` at `579c227d`, verbatim; it is saved as [checklist.json](checklist.json):

```text
Review checklist (files docs/g3-plan.md, docs/foundation.md), most frequent finding categories first:
1. docs (6): Documentation is missing, wrong, or out of date with the change. Example: "The deferral row for archived ext2/ext3 labels and broken links did not record the link repair of #350 under owner decision B1"
2. spec-wording (3): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "The deferral table legend called entries without a gate not open work and used a dash for an open owner item"
3. process (1): A protocol, governance, or review rule was not followed. Example: "Item 26 left PostgreSQL TLS open with the owner but its Blocked by column named no open decision"
4. scope (1): The change does more or less than its assigned scope. Example: "Plan item 44 re-admits only an attempt rejected under a stale admission, not one whose grant a product writer revoked"
5. stale-citation (1): A cited file line, commit, or record no longer matches its target. Example: "The writers rule in the Work items introduction kept an unexpanded placeholder in place of its ADR 0015 citation"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (59): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
2. docs (43): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
3. spec-wording (26): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
4. stale-citation (23): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
5. process (10): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
6. contract-drift (9): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
7. scope (5): The change does more or less than its assigned scope. Example: "Design D6 defines size M as a contract, its spec, and its port types, while the SCM follow-up also changes the port's readers and conformance case"

Dev commit: 579c227d5593943983835bceaef570b9245e45bb.
```

## Risks and limitations

- The list of item 0's changes follows the coordinator's brief; #367 is in it although it is not a follow-up of the revalidation, and the plan says so.
