## Context

`scripts/check-comment-length.ts` treats `.ts`, `.mts`, `.cts`, `.js`, `.mjs`, and `.cjs` files as slash-comment files; `.sh`, `.yml`, and `.yaml` files and files named `Makefile` or `Dockerfile` as hash-comment files; and extensionless files that start with a shebang as hash-comment files. The archived design of `enforce-comment-length` counted the four module extensions as TypeScript and JavaScript, but the requirement does not say so.

## Goals / Non-Goals

Make the requirement and `AGENTS.md` list exactly the file kinds the check covers. No change to the check, the bound, the counting rules, the exemptions, or any other text.

## Decisions

- Name the module extensions explicitly instead of defining `*.ts` and `*.js` to include them, so that the list matches the check one to one.
- Leave worker step 3 of `docs/agent-task-protocol.md` unchanged: it lists no file kinds and points to `AGENTS.md` for them, as the archived change `align-comment-rule-text` decided.
- Keep the requirement under 500 characters, because longer requirements fail strict validation after archive.

## Risks / Trade-offs

None.
