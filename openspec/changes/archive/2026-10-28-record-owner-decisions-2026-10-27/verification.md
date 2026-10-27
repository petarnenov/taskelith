## Scope and source

Owner decisions of 2026-10-27, size S-M, documentation and specifications only, assigned by the coordinator (Niki) on 2026-10-27:

- Part A: the owner's decision, taken directly and not through the away delegate, on the open question of D15 and ADR 0005 decision 2 that `recheck-provider-terms-pages` (#365) left in [the Claude Code qualification](/docs/qualification/claude-code.md#consequences-for-d15): no pooled or rotated Claude subscriptions until a further owner decision, the user's own API key first, and subscription use limited to the owner's own account, with no rotation.
- Part B: the owner-confirmed editorial note for ADR 0008 on run and admission wording, in the terms of design D1 of `align-product-ports-with-g2-lifecycle` (q40).
- Part C: the stale Claude Code release rows of `docs/integration-candidates.md:44` and `docs/qualification/claude-code.md:11`, and "code point order" at `docs/contracts/git-workspace.md:62`.

Exclusions: `docs/governance.md`, `docs/agent-task-protocol.md`, and the skills, which another worker edits; the Codex, OpenCode, Antigravity, and GitHub records; the planning of G3 item 45.

## Revision and environment

Branch `record-owner-decisions-2026-10-27` from `origin/dev` at `14e1a46e`, in its own worktree with `make setup` done. During the work the coordinator reported that q40 landed as #372, and the branch merged `origin/dev` at `579c227d` with a merge commit (`04302250`). The merge brought `docs/contracts/product-ports.md`, `docs/trust-model.md`, the `product-ports` spec, the archived `align-product-ports-with-g2-lifecycle`, and code under `packages/modules/execution`, `integrations`, and `scheduling`; it touched no file of this change and had no conflict. Every check below ran after the merge; after the pass 1 fixes the strict validations, `make findings ARGS="validate"`, and `make verify` were re-run on `a19b4cf6` and passed, and after the pass 2 fixes again on `59ce50cf`, which passed. Ubuntu Linux x86_64, Node.js v24.22.1, OpenSpec through `npm run openspec`, `make verify` with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp` (a host quirk of this machine).

After review pass 2 the branch merged `origin/dev` at `46e21ef1` (#373, `close-g3-item-0`) with merge commit `20c2fa54`. It conflicted in `docs/g3-plan.md` only, on the wave 1 sentence: the resolution keeps dev's text on the item 0 closure and appends this change's sentence on item 45. The merge also changed `docs/foundation.md` and added the item 0 closure section of `docs/g3-plan.md`, which touch no other line of this change. Line numbers cited in the review tables refer to the reviewed heads.

## Author self-check and evidence check

- The owner's three points are quoted from the brief into the ADR 0005 amendment, the D15 amendment of the G3 work plan, the account pool contract section 7.1, and the Claude Code qualification's "Consequences for D15", with the same content in each; after review pass 1 (L5) all three name the last point in the same words, "with no rotation to another account". The amendment cites the evidence at `docs/qualification/claude-code.md` "Consequences for D15" (line 92 at `14e1a46e`).
- The one-slot reading of "the owner's own account" and the slot limit on the admitted pair are the author's mapping (design D2), not the owner's words.
- Spec delta bodies, measured without the trailing newline after the pass 1 fixes: "Subscription account slots" 495 characters, "Admitted credential deliveries only" 471. Each was copied whole from the living spec at `14e1a46e` and edited; every original scenario is kept unchanged, and one scenario is added to each.
- Part B: `origin/dev` at `14e1a46e` had no archived `align-product-ports-with-g2-lifecycle`; the branch `origin/align-product-ports-with-g2-lifecycle` at `0a637301` carried it. After #372 landed, `git diff 0a637301 origin/dev` over the archived change and `docs/contracts/product-ports.md` was empty, so the D1 and section 3.3 read before the merge are the ones on `dev`. `stageId` and `workItem` are the names in `apps/control-plane/src/application/task-service.ts:97` and `:98`.
- Part C, the npm dist-tags, 2026-10-27 21:28:13 to 21:28:14 UTC: `npm view @anthropic-ai/claude-code dist-tags --json` gave `stable` 2.1.308, `latest` 2.1.312, `next` 2.1.312; `npm view @anthropic-ai/claude-agent-sdk dist-tags --json` gave `latest` 0.3.312, `next` 0.3.312. `npm view <package> time --json` gave 2.1.312 published 2026-10-27T18:36:10Z and 0.3.312 2026-10-27T18:37:18Z. Both package names match the rows. `npm view @anthropic-ai/claude-code@2.1.312 license` is `SEE LICENSE IN README.md`, and the `LICENSE.md` of 2.1.312 and 2.1.310 from unpkg are byte-identical (`cmp`), "All rights reserved". Its `optionalDependencies` still list the Linux x64 and arm64 and macOS x64 and arm64 native packages. The new link `https://unpkg.com/@anthropic-ai/claude-code@2.1.312/LICENSE.md` answered HTTP 200 at 21:28:23 UTC.
- Part C, the workspace order: the `git-workspace-port` spec states no `list` order; the conformance suite (`packages/modules/workspace/src/ports/workspace-conformance.ts:217`) and the temporary-directory test adapter (`packages/modules/workspace/test/temp-dir-workspaces.ts:278`) sort with JavaScript's default sort, UTF-16 code unit order.
- Other mentions of the stale versions, left unchanged, are listed in design "Not changed".
- Links: repository links in `docs/` are relative within `docs/`; this change's records link only inside the change directory or root-relative.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate record-owner-decisions-2026-10-27 --strict` | Passed: "Change 'record-owner-decisions-2026-10-27' is valid" |
| `npm run openspec -- validate --all --strict` | Passed: 70 passed, 0 failed |
| `make findings ARGS="validate"` | Passed: 50 findings files, 30 pass summary files valid |
| `npm run verify:links` | Passed: "Every checked link conforms" |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` on the working tree after the merge and the part B note, again on `364c1191`, after the pass 1 fixes on `a19b4cf6`, and after the pass 2 fixes on `59ce50cf` | Passed each time, exit 0, including the archive dry run ("Every active OpenSpec change archives into strictly valid specs") and the package check |

## Review

### Pass 1

Reviewer A: harness `claude`, model `claude-fable-5-1`, variant `medium`, session `4221f237-46ec-4eb0-be8f-e4892a627d76`, run by the coordinator at head `432647b1`. Snapshot before and after: `83c158d66c93e6a59ad74aa44ec67de6ae638cb7408b16d91b934c397ae1025c`, unchanged. The reviewer re-read the npm dist-tags, the LICENSE identity, the spec deltas, the citations, and the ADR 0008 terms. Counts: Critical 0, High 0, Medium 1, Low 8, as in `passes.jsonl`. Fixes in `58001692`; pass 2 by reviewer B confirmed findings 1 to 8 as fixed and accepted the deferral of 9.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Medium | The one-slot rule in both deltas and the G3 item 33 note was attributed to ADR 0005 decision 2, though it is the author's reading (design D2) | Fixed: they cite the account pool contract section 7.1, which states that it applies decision 2 as a one-slot limit because Taskelith cannot check accounts |
| 2 | Low | The harness delta dropped "any number of slots MAY be added per harness" | Fixed: restored as "a harness MAY have any number of slots"; body 495 characters |
| 3 | Low | `docs/integration-candidates.md:33` contradicted itself on API-billed endpoints | Fixed: "except for Claude Code" |
| 4 | Low | ADR 0005 status and Risks still said the terms were not verified | Fixed: dated note for Claude Code in both |
| 5 | Low | "no rotation" worded differently in the ADR, the G3 plan, and the qualification | Fixed: all three say "with no rotation to another account" |
| 6 | Low | Section 7.1 did not say that the rotation rule is not checkable | Fixed |
| 7 | Low | The ADR 0008 note's "of that run" was wrong for delegated child tasks | Fixed: "of its run, the card's run or a delegated child run" |
| 8 | Low | Item 45's "Depends on" held "Not yet planned" | Fixed: "0 (planning pending)" |
| 9 | Low | The workspace `list` order is not in the `git-workspace-port` spec | Deferred: out of scope; follow-up spec delta for the list order |

### Pass 2

Failed attempt, not a pass: started 2026-10-27 23:50 local with Claude Code `claude-opus-5-5`, effort `high`; it exited 1 with "Error: No messages returned from query" and empty stdout. The cause, found by Maki in `investigate-claude-reviewer-invocation`, is a bug of Claude Code CLI 2.1.312 in `--output-format json`: when a rate-limit event arrives after the result, the result is dropped. It has no `passes.jsonl` line.

Reviewer B: harness `claude`, model `claude-opus-5-5`, variant `high`, session `70161b78-35df-4ea2-8f8a-1498cfcbb403`, run by the coordinator at head `30aa51ae` with `--output-format stream-json --verbose`, the result line read from the stream. Snapshot before and after: `c15f3431e07c8a1d876d88a86987a8b02df85d74a143a90958c2731c16259324`, unchanged. The reviewer confirmed the pass 1 fixes 1 to 8, accepted the deferral of 9, and judged the one-slot reading of design D2 faithful. Counts: Critical 0, High 0, Medium 0, Low 6, as in `passes.jsonl`. The pass is Low-only, so the review ends; the fixes in `167c80e5` are unreviewed and no pass 3 runs.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Low | Scenario "Second Claude Code slot" ended with an untestable clause on rotation | Fixed, unreviewed: the THEN ends at "the configuration is rejected" |
| 2 | Low | `docs/qualification/claude-code.md:217` still named a subscription-only provider path | Fixed, unreviewed: adds the user's own API key, G3 item 45 |
| 3 | Low | The Credential scope row (`claude-code.md:27`) missed the one Claude Code slot | Fixed, unreviewed: names it with contract section 7.1 |
| 4 | Low | `docs/g3-plan.md:150` omitted item 45 among the items that depend only on item 0 | Fixed, unreviewed |
| 5 | Low | "The owner's own account" undefined in the contract, operator and owner mixed | Fixed, unreviewed: quoted as the decision's words; the operator adds the slot for the account the decision allows; its role mapping is left to a further owner decision (design D2) |
| 6 | Low | "Other harnesses are unchanged" missed that the decision is about Claude subscriptions | Fixed, unreviewed: ADR 0005 and D15 name other harnesses' own subscriptions and a later harness that can use a Claude subscription |

## Limitations

- The npm dist-tags were read once; they may move after 2026-10-27 21:28 UTC.
- The slot limit names no `AccountSlots` read; G3 item 12 defines it (design D2).
- G3 item 45 is unplanned.
- Follow-up: a `git-workspace-port` spec delta for the `list` order (pass 1 finding 9, deferred).
- Follow-up, out of scope: `docs/foundation.md:18` still calls the ADR 0005 provider terms pending (review pass 2).

## Remaining gates

- Review complete: pass 1 (A) and pass 2 (B, Low-only); the pass 2 fixes are unreviewed, and no pass 3 runs.
- Archive in the last commit of the branch, with its checks.
- Integration into dev by the coordinator (single pull request)

## Archive checks

After `npm run openspec -- archive record-owner-decisions-2026-10-27 --yes` (archived as `2026-10-28-record-owner-decisions-2026-10-27`):

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `npm run openspec -- validate --archived`: `change/2026-10-28-record-owner-decisions-2026-10-27` valid; 212 passed and 13 failed, all 13 older archived changes from 2026-10-24 to 2026-10-26 that this change does not touch.
- `git diff 46e21ef1 -- openspec/specs` (merge base): only the applied deltas, `account-pool-port` and `harness-account-pools` (1 modified each).
- `make findings ARGS="validate"`: 51 findings files and 31 pass summary files valid.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: passed.
