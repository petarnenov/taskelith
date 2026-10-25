# Verification: add-context-size-warning

## Scope and source

On 2026-10-25 the owner asked, in Bulgarian and paraphrased here, to be told when a session's context nears 150,000 tokens, with a recommendation of `/compact` or `/clear`, and called it a law for this project. The owner then asked to apply it to the workers and to add it to the skill. The coordinator developed this change itself, following the worker steps. Base revision: `c84ca71` on `dev`.

## Environment

macOS on arm64, Node.js 24.22.1.

## Author self-check before review

- The rule appears in the protocol, the skill, and `AGENTS.md`, and the three agree.
- Worker step 8 stays the normal point for `/clear`.
- The spec requirement is under 500 characters. All content is English.

## Checks

- `npm run openspec -- validate add-context-size-warning --strict`: passed.
- `make verify`: passed.

## Independent review

Pending.

## Remaining gates

None after review and integration.
