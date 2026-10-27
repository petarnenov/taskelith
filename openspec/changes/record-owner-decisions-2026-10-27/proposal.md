## Why

On 2026-10-27 the owner decided, directly in the project conversation and not through the away delegate, the question that `recheck-provider-terms-pages` left open on D15 and ADR 0005 decision 2: Taskelith does not pool or rotate Claude subscriptions until a further owner decision, support for the user's own API key comes first, and subscription use stays limited to the owner's own account, with no rotation. The evidence is the Usage Policy clauses and the Claude Code hosting conditions that the [Claude Code qualification](/docs/qualification/claude-code.md#consequences-for-d15) quotes. The owner also confirmed an editorial note for ADR 0008 on the run and admission wording, which waits for `align-product-ports-with-g2-lifecycle` to land. Three records carry stale facts: the Claude Code release in the integration candidates and in the qualification record, and the order of the Git workspace `list`.

## What Changes

- `docs/decisions/0005-harness-subscription-account-pools.md`: an amendment of decision 2 dated 2026-10-27, and the status line names it.
- `docs/contracts/account-pool.md`: section 7.1 applies the amendment: Claude Code's `subscription-token` pair allows one slot that is not removed, added for the owner's own account; a rotation never moves the slot to another account; the user's own API key waits for G3 item 45. Section 9 adds the slot limit test.
- `docs/g3-plan.md`: D15 records the amendment; items 12, 19, 33, and 35 get a scope note; item 45 `support-claude-code-api-key` is added without planning and placed in no wave.
- `docs/qualification/claude-code.md`: the open question of "Consequences for D15" points at the decision, with the status rows that named it open; the package row's dist-tags are refreshed.
- `docs/integration-candidates.md`: the Claude Code release cell is refreshed to the npm dist-tags of 2026-10-27, and the subscription-only criterion names the amendment.
- `docs/contracts/git-workspace.md`: `list` returns attempts in UTF-16 code unit order, which the implementation and its conformance suite use, instead of "code point order".
- ADR 0008: an editorial note is drafted in `design.md` D4 and not applied, pending the landing of `align-product-ports-with-g2-lifecycle` (q40).

## Capabilities

### New Capabilities

### Modified Capabilities

- `harness-account-pools`: modifies "Subscription account slots".
- `account-pool-port`: modifies "Admitted credential deliveries only".

## Impact

Documentation and specifications only; no code, no package, and no runtime change. The slot limit is a requirement for the add-slot command of G3 item 12, which does not exist yet. Codex, OpenCode, Antigravity, and GitHub records keep D15 (a) unchanged.
