# Verification: use-kimi-high-variant

## Scope and source

On 2026-10-26 the owner said, in Bulgarian and paraphrased here: invoke OpenCode with `-m opencode-go/kimi-k3.1-pro#high` so that it runs with high effort; record it without a review. The coordinator made the change itself.

## Checks

- `npm run openspec -- validate use-kimi-high-variant --strict`: passed.
- `make verify`: passed in the pre-push hook.

## Independent review

Not performed. This is a review exception that the owner granted explicitly for this change on 2026-10-26.

## Remaining gates

Integration into `dev` and the archive.
