# Verification: allow-opencode-go-reviewer-model

## Scope and source

A worker reported on 2026-10-26 that its host's OpenCode configuration denies every provider except `opencode-go`, so `-m 'opencode/deepseek-v4.1-flash#high'` is refused there and `opencode-go/deepseek-v4.1-flash#high` is available. The coordinator's host has no such policy. The owner approved the OpenCode Go identifier on 2026-10-26, in Bulgarian and paraphrased here, through a question with options. The coordinator developed this change itself, following the worker steps. Base revision: `e52c900` on `dev`.

## Environment

macOS on x86_64, Node.js 24.22.1.

## Author self-check before review

- Only the model identifier gains an alternative, in the two places that name it.
- The evidence check has nothing to verify: no external link is added; the provider policy is the worker's report.

## Checks

At the committed revision handed to review:

- `npm run openspec -- validate allow-opencode-go-reviewer-model --strict`: passed.
- `make verify`: passed.

## Independent review

Pending.

## Remaining gates

Integration into `dev` and the archive.
