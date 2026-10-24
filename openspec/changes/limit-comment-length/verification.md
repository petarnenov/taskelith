# Verification: limit-comment-length

Date: 2026-10-24.

## Scope and source

The owner wrote on 2026-10-24, marking it important, that comments are at most two lines of up to 80 characters. Base revision: `e774622` on `dev`. Scope: one bullet in `AGENTS.md`, one sentence in worker step 3 of `docs/agent-task-protocol.md`, and this change, with an ADDED requirement in `engineering-principles`.

## Author self-check before review

- Interpretation: the rule covers code comments (TypeScript, shell, Makefile, and configuration files). Line length counts indentation and the marker.
- A scan of tracked `*.ts`, `*.sh`, `*.js`, `*.yml`, and `Makefile` files, excluding `docs/qualification/speckit-1.2.3/`, found 18 comment lines over 80 characters and 45 comment blocks over two lines, in about 20 files; they are left unchanged, as the proposal explains.
- Evidence check: no external link is added; the protocol links `AGENTS.md`, which exists.
- The added text follows its own rule where it is code-adjacent; the documents have no code comments.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree: `npm run openspec -- validate limit-comment-length --strict` passed, and `make verify` passed.

## Independent review

Assigned reviewer (rotation): Claude Code with `claude -p <prompt> --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree; prompt, output, and snapshots kept outside the worktree.
