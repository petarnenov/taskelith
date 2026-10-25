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

Reviewer: Codex CLI, invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.

### Pass 1

Session `01a17542-45a9-7180-81a6-77d76a1f1ad7`, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox. It ran at `de957d3`, and the SHA-256 snapshots before and after were equal (`102ec6dd…60bc`). Findings: Critical 0, High 0, Medium 0, Low 0. It confirmed that no non-archived text names the old model as current and that `skip_specs` is justified.

## Remaining gates

Integration into `dev` and the archive.
