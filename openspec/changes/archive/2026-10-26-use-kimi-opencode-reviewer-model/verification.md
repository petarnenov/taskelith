# Verification: use-kimi-opencode-reviewer-model

## Scope and source

On 2026-10-26 the owner said, in Bulgarian and paraphrased here: use `opencode-go/kimi-k3.1-pro` as the OpenCode model and record it directly, without a reviewer. The coordinator made the change itself. Base revision: `origin/dev` at the time of the change.

## Environment

macOS on x86_64, Node.js 24.22.1.

## Author self-check

- Only the model identifier and the `-m` note change, in the two places that name the model.
- The evidence check has nothing to verify: no external link is added.

## Checks

- `npm run openspec -- validate use-kimi-opencode-reviewer-model --strict`: passed.
- `make verify`: passed.

## Independent review

Not performed. This is a review exception that the owner granted explicitly for this change on 2026-10-26.

## Remaining gates

Integration into `dev` and the archive.
