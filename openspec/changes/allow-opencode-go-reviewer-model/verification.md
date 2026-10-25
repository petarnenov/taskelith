# Verification: allow-opencode-go-reviewer-model

## Scope and source

A worker reported on 2026-10-26 that its host's OpenCode configuration denies every provider except `opencode-go`, so `-m 'opencode/deepseek-v4.1-flash#high'` is refused there and `opencode-go/deepseek-v4.1-flash#high` is available. The owner approved the OpenCode Go identifier on 2026-10-26, through a question with options, and then said, in Bulgarian and paraphrased here, to record it as the correct OpenCode configuration. A review on the coordinator's host had failed at 2026-10-25 22:47 UTC with `provider.no-route: Model unavailable: opencode/deepseek-v4.1-flash` (session `ses_e8ac4dc96ffevqfxoiVoDsuTlY`). The coordinator developed this change itself, following the worker steps. Base revision: `e52c900` on `dev`.

## Environment

macOS on x86_64, Node.js 24.22.1.

## Author self-check before review

- Only the model identifier changes, in the two places that name it.
- The evidence check has nothing to verify: no external link is added; the provider policy is the worker's report.

## Checks

At the committed revision handed to review:

- `npm run openspec -- validate allow-opencode-go-reviewer-model --strict`: passed.
- `make verify`: passed.

## Independent review

Pending.

## Remaining gates

Integration into `dev` and the archive.
