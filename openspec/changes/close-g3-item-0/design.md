## Context

The coordinator's brief of 2026-10-27 asked to close G3 item 0 so that wave 1 can start, recording facts only. The facts come from `git log --merges origin/dev` (pull request numbers and titles), the archived changes under `/openspec/changes/archive/`, and, for `align-product-ports-with-g2-lifecycle`, which is not yet in `dev`, its branch `origin/align-product-ports-with-g2-lifecycle` at `0a637301`.

## Decisions

1. **Item 0's change list.** The list is the revalidation and the follow-ups the coordinator named: those of the revalidation's table "Follow-up changes" ([its verification](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md#follow-up-changes)) and `record-hosted-runner-linux-acceptance` (#367). The plan states that #367 is not a follow-up of the revalidation. #361 and #370 are listed as related, not as item 0's changes.
2. **Pending entry.** `align-product-ports-with-g2-lifecycle` has no pull request yet; its row says "Pending", and its source for the open confirmation is cited as a path on its branch, not as a link, because the link checker requires an existing target. The row, the citation, and the closure date are finalized when it lands.
3. **Open owner confirmations, not decisions.** The plan lists the four away-delegate decisions of item 0's changes that wait for the owner, each with its source record. The plan's section "Owner decisions" keeps the owner's own decisions; the list stays under the item 0 closure so that it decides nothing and changes no "Blocked by" entry.
4. **Accepted records unchanged.** ADR 0015 still calls the hosted-runner check open (decision 3 and decision 5); it is an accepted record and is not edited. ADR 0008 is not edited either.

## Review checklist

The checklist output is added after q39 lands; the coordinator supplies it.

## Risks and limitations

- The closure date 2026-10-27 assumes `align-product-ports-with-g2-lifecycle` lands on the same date.
- The pull request number and subject of `align-product-ports-with-g2-lifecycle` are not yet known.
