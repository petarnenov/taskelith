# Verification: add-context-size-warning

## Scope and source

On 2026-10-25 the owner asked, in Bulgarian and paraphrased here, to be told when a session's context nears 150,000 tokens, with a recommendation of `/compact` or `/clear`, and called it a law for this project. The owner then asked to apply it to the workers and to add it to the skill. The coordinator developed this change itself, following the worker steps. Base revision: `c84ca71` on `dev`.

## Environment

macOS on arm64, Node.js 24.22.1.

## Author self-check before review

- The rule appears in the protocol, the skill, and `AGENTS.md`, and the three agree.
- Worker step 8 stays the normal point for `/clear`.
- The spec requirement is under 500 characters. All content is English.

## Evidence check

The change adds no external link or external fact; its only source is the owner's instruction above. The check therefore has nothing to verify.

## Checks

Run on the committed tree `e4160a5` (base `c84ca71` plus this change) and again on the final revision after the unreviewed fixes:

- `npm run openspec -- validate add-context-size-warning --strict`: passed.
- `make verify`: passed.

## Independent review

Reviewer: Codex CLI by rotation, invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.

### Pass 1

Session `01a17412-54d4-7933-8d62-20cbeb3f4c78`. The output header reports model `gpt-6.1-sol`, reasoning effort `medium`, and a read-only sandbox. Pass 1 ran at `e4160a5`, and the SHA-256 snapshots before and after were equal (`a7da7cda…b532`).

Findings: Critical 0, High 0, Medium 0, Low 2. This was a Low-only pass, so the findings are fixed without another review and recorded as unreviewed fixes:

1. The evidence check was missing. Fixed under Evidence check.
2. The checks did not name the revision they ran on. Fixed under Checks.

## Remaining gates

None after review and integration.
