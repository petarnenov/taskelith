## Scope and source

Owner decisions of 2026-10-27, size S-M, documentation and specifications only, assigned by the coordinator (Niki) on 2026-10-27:

- Part A: the owner's decision, taken directly and not through the away delegate, on the open question of D15 and ADR 0005 decision 2 that `recheck-provider-terms-pages` (#365) left in [the Claude Code qualification](/docs/qualification/claude-code.md#consequences-for-d15): no pooled or rotated Claude subscriptions until a further owner decision, the user's own API key first, and subscription use limited to the owner's own account, with no rotation.
- Part B: the owner-confirmed editorial note for ADR 0008 on run and admission wording, in the terms of design D1 of `align-product-ports-with-g2-lifecycle` (q40).
- Part C: the stale Claude Code release rows of `docs/integration-candidates.md:44` and `docs/qualification/claude-code.md:11`, and "code point order" at `docs/contracts/git-workspace.md:62`.

Exclusions: `docs/governance.md`, `docs/agent-task-protocol.md`, and the skills, which another worker edits; the Codex, OpenCode, Antigravity, and GitHub records; the planning of G3 item 45.

## Revision and environment

Branch `record-owner-decisions-2026-10-27` from `origin/dev` at `14e1a46e`, in its own worktree with `make setup` done. During the work the coordinator reported that q40 landed as #372, and the branch merged `origin/dev` at `579c227d` with a merge commit (`04302250`). The merge brought `docs/contracts/product-ports.md`, `docs/trust-model.md`, the `product-ports` spec, the archived `align-product-ports-with-g2-lifecycle`, and code under `packages/modules/execution`, `integrations`, and `scheduling`; it touched no file of this change and had no conflict. Every check below ran after the merge. Ubuntu Linux x86_64, Node.js v24.22.1, OpenSpec through `npm run openspec`, `make verify` with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp` (a host quirk of this machine).

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
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` on the working tree after the merge and the part B note, and again on `364c1191` | Passed both times, exit 0, including the archive dry run ("Every active OpenSpec change archives into strictly valid specs") and the package check |

## Review

Not run yet. The coordinator assigns reviewers A and B; each pass is recorded here, in `passes.jsonl`, and in `findings.jsonl`.

## Limitations

- The npm dist-tags were read once; they may move after 2026-10-27 21:28 UTC.
- The slot limit names no `AccountSlots` read; G3 item 12 defines it (design D2).
- G3 item 45 is unplanned.

## Remaining gates

- Review passes by reviewers A and B under the independent review process.
- Archive in the last commit of the branch, with its checks.
- Integration into dev by the coordinator (single pull request)
