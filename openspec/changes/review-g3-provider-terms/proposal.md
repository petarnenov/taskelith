## Why

The G3 work plan (`docs/g3-plan.md`, item 2, `review-g3-provider-terms`) and ADR 0007 put the review of the Anthropic, OpenAI, and GitHub terms before admission in G3, and ADR 0005 leaves open whether the providers allow pooled subscriptions for automated use. The owner's decision D15 (accept the remaining risk, limit pools to one subscription per harness, or hold admission) waits for this review.

G3 has not started. On 2026-10-25 the owner authorized items 1 and 2 of the G3 plan to start ahead of the G3 start, while G2 finishes. Every other G3 item stays not started.

## What Changes

- In `docs/qualification/claude-code.md` and `docs/qualification/codex.md`, add a provider terms review: the current terms that govern automated use with a subscription, account sharing and pooled subscriptions, credential storage by a third-party product, the governing agreements, and data use, each with a brief verbatim quote, its URL, effective date, and access date, and what the text says apart from where it is ambiguous.
- In `docs/qualification/github.md`, add the same review for automated use, the GitHub App, a separate reviewer identity, AI-specific terms, and data use.
- Update each record's terms table and "Remaining before admission" list.
- Add a provider terms review requirement to `harness-qualification` and an SCM terms review requirement to `scm-qualification`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `harness-qualification`: adds the provider terms review before admission.
- `scm-qualification`: adds the SCM terms review before admission.

## Impact

Documentation only. No code, dependency, or decision changes. The review states what the text says and where it is ambiguous, gives no legal conclusion as certain, and does not decide D15; the options and the author's proposal for D15 are in `design.md`, and the owner decides.
