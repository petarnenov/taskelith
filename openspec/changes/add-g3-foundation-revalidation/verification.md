## Scope and source

The owner decision of 2026-10-26, relayed by the coordinator in a brief the same day: after the G2 closure and before any other G3 item starts, re-review all merged G3 groundwork, items 1, 2, 3, 5, 6, 7, and 8, against G2 as built, each artifact by its own independent reviewer in rotation with at most three passes, and fix the findings in follow-up changes before implementation starts. The brief named the check for each artifact and asked for the decision to be recorded in `docs/g3-plan.md` as work item 0, with a wave 0 before wave 1.

Out of scope: starting item 0, re-reviewing any artifact, and changing any other item's scope.

## Revision and environment

- Base: `origin/dev` at `f1a535e`. Branch `add-g3-foundation-revalidation`.
- Host: macOS 26.6.2 on x86_64, Docker engine 29.5.2, Node.js 24.22.1 from `.nvmrc`.

## Author self-check and evidence check

- The seven items named by the decision are archived under `openspec/changes/archive/` (`2026-10-25-qualify-g3-dependencies`, `2026-10-25-review-g3-provider-terms`, `2026-10-26-define-agent-harness-port`, `2026-10-26-define-account-pool-contract`, `2026-10-26-define-git-workspace-contract`, `2026-10-26-define-scm-port`, `2026-10-26-define-product-ports`), so "merged" is accurate for each; no other G3 item is archived.
- Item 0's row carries every per-artifact check of the decision; its "Depends on" is the G2 closure, as the introduction states, and its UI column is "—".
- The wave rule still holds: item 0 depends on no G3 item; items 26 and 27 depend only on item 0 and stay in wave 1; every later item depends on item 0, which is in wave 0, and on its listed items, which are in earlier waves as before. The longest chain keeps its length of twelve items: item 0, like item 3, depends on no G3 item, so a chain that starts at item 0 instead of item 3 is not longer.
- `docs/g3-dependencies.md` is the item 1 evaluation and lists no waves or item dependencies; no other document lists G3 waves or cites "items without G3 dependencies". No document cites a renumbered item, because no item was renumbered.
- No external link was added, so the evidence check has nothing to pin.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate add-g3-foundation-revalidation --strict` | valid |
| `make verify` at `7fd137e` | passed; 1751 tests, 1749 passed, 0 failed, 2 skipped; coverage 99.27 % lines, 91.91 % branches, 98.88 % functions; 68 OpenSpec items valid; archive dry run valid; package verification passed |
| `make verify` at `02b80da`, after the pass 1 fixes | passed; 1751 tests, 1749 passed, 0 failed, 2 skipped; coverage 99.26 % lines, 91.90 % branches, 98.88 % functions; archive dry run valid; package verification passed |
| `make verify` after the pass 2 fixes | run by the `pre-push` hook on the pushed head |

## Independent review

Reviewer assigned by the coordinator in the brief: OpenCode CLI, `opencode-go/kimi-k2.7-code` with its default variant, agent `reviewer`.

Invocation, from the worktree, with the prompt and log outside it:

```bash
opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k2.7-code' --format json \
  --title add-g3-foundation-revalidation "$(cat <prompt-file>)" < /dev/null > <log>
```

### Pass 1

- Session `ses_e8714ad12ffeU4uMXaEoNbqnsu`, on `f34d84e` (diff `f1a535e..f34d84e`). The stored assistant messages of the session record agent `reviewer` and `"model":{"id":"kimi-k2.7-code","providerID":"opencode-go","variant":"default"}`.
- Snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) before and after: `717e40fb37b5f630f5275a4cbec9b47f9f6dfe735ada113c261c2ce207b62c70`, equal. No external evidence directory was shared with the reviewer.
- The reviewer's attempts to run `npm run openspec -- validate` and `make verify` were denied by its agent rules; it assessed the recorded evidence instead.
- Findings: 0 Critical, 0 High, 1 Medium, 5 Low. All were fixed in `4bccf14`:
  - **M1:** the item 3 check said "launch orchestration" where the owner decision and the code say "launch orchestrator". Fixed in `docs/g3-plan.md` and `proposal.md`.
  - **L1:** item 0's "Depends on" names the G2 closure, while the introduction defined the column as G3 items only. The introduction now says that for item 0 it names the G2 closure; the cell stays, as the brief requires.
  - **L2:** "Numbering the item 0" in `proposal.md` was ungrammatical. Reworded.
  - **L3:** "every item not yet merged" included item 0 itself. The status paragraph and the introduction now say "every other item not yet merged", and the introduction's list of exceptions includes item 0.
  - **L4:** the same in `design.md` "Risks / Trade-offs". Reworded to "every other".
  - **L5:** `design.md` and this record justified the unchanged longest chain by an item 4 dependency on item 0 and "one step from the start". Both now say that item 0, like item 3, depends on no G3 item, so a chain from item 0 is not longer.

### Pass 2

- Session `ses_e8705be34ffe6TzSI9hxFKF5Hz`, on `02b80da` (diff `f1a535e..02b80da`). The stored assistant messages of the session record agent `reviewer` and `"model":{"id":"kimi-k2.7-code","providerID":"opencode-go","variant":"default"}`. The reviewer wrote its report in Bulgarian; the findings are paraphrased here.
- Snapshot before and after: `9d67fd16e85012226ea655b896a819c74457f065d6f0a36b12762cfb144dfdc8`, equal. No external evidence directory was shared with the reviewer.
- The reviewer confirmed the resolution of M1 and L1 to L5 of pass 1.
- Findings: 0 Critical, 0 High, 0 Medium, 5 Low. As a Low-only pass, the findings were fixed without another review; these are unreviewed fixes:
  - **L1:** `proposal.md` line 8 said "every item not yet merged". Not changed: that line already says "every other item not yet merged" since `4bccf14`.
  - **L2 (fixed, unreviewed):** `tasks.md` task 1.2 said "every item not yet merged"; it now says "every other item not yet merged".
  - **L3 (fixed, unreviewed):** item 0's scope in `docs/g3-plan.md` said "before any other item starts"; it now says "before any other G3 item starts", as the status paragraph does.
  - **L4 (fixed, unreviewed):** `design.md` said a chain from item 0 "is no longer", which reads ambiguously; it now says "is not longer".
  - **L5 (fixed, unreviewed):** the same wording in this record, in the author self-check and the pass 1 record of L5.

## Limitations

- Documentation only; no runtime behavior is affected, so no runtime check applies.

## Remaining gates

- Coordinator integration, merge into `dev`, and archive.
- Item 0 itself, after the G2 closure.
