## Scope and source

The owner decision of 2026-10-26, relayed by the coordinator in a brief the same day: after the G2 closure and before any other G3 item starts, re-review all merged G3 groundwork, items 1, 2, 3, 5, 6, 7, and 8, against G2 as built, each artifact by its own independent reviewer in rotation with at most three passes, and fix the findings in follow-up changes before implementation starts. The brief named the check for each artifact and asked for the decision to be recorded in `docs/g3-plan.md` as work item 0, with a wave 0 before wave 1.

Out of scope: starting item 0, re-reviewing any artifact, and changing any other item's scope.

## Revision and environment

- Base: `origin/dev` at `f1a535e`. Branch `add-g3-foundation-revalidation`.
- Host: macOS 26.6.2 on x86_64, Docker engine 29.5.2, Node.js 24.22.1 from `.nvmrc`.

## Author self-check and evidence check

- The seven items named by the decision are archived under `openspec/changes/archive/` (`2026-10-25-qualify-g3-dependencies`, `2026-10-25-review-g3-provider-terms`, `2026-10-26-define-agent-harness-port`, `2026-10-26-define-account-pool-contract`, `2026-10-26-define-git-workspace-contract`, `2026-10-26-define-scm-port`, `2026-10-26-define-product-ports`), so "merged" is accurate for each; no other G3 item is archived.
- Item 0's row carries every per-artifact check of the decision; its "Depends on" is the G2 closure, as the introduction states, and its UI column is "—".
- The wave rule still holds: item 0 depends on no G3 item; items 26 and 27 depend only on item 0 and stay in wave 1; every later wave depends on wave 1 items that do not depend on item 0, or on item 0 through them. The longest chain keeps its length of twelve items, because item 4 depends on item 3 and item 0, which are both one step from the start.
- `docs/g3-dependencies.md` is the item 1 evaluation and lists no waves or item dependencies; no other document lists G3 waves or cites "items without G3 dependencies". No document cites a renumbered item, because no item was renumbered.
- No external link was added, so the evidence check has nothing to pin.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate add-g3-foundation-revalidation --strict` | valid |
| `make verify` at `7fd137e` | passed; 1751 tests, 1749 passed, 0 failed, 2 skipped; coverage 99.27 % lines, 91.91 % branches, 98.88 % functions; 68 OpenSpec items valid; archive dry run valid; package verification passed |

## Independent review

Reviewer assigned by the coordinator in the brief: OpenCode CLI, `opencode-go/kimi-k2.7-code` with its default variant, agent `reviewer`.

Invocation, from the worktree, with the prompt and log outside it:

```bash
opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k2.7-code' --format json \
  --title add-g3-foundation-revalidation "$(cat <prompt-file>)" < /dev/null > <log>
```

## Limitations

- Documentation only; no runtime behavior is affected, so no runtime check applies.

## Remaining gates

- Coordinator integration, merge into `dev`, and archive.
- Item 0 itself, after the G2 closure.
