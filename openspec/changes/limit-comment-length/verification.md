# Verification: limit-comment-length

Date: 2026-10-24.

## Scope and source

The owner wrote on 2026-10-24, marking it important, that comments are at most two lines of up to 80 characters. Base revision: `e774622` on `dev`. Scope: one bullet in `AGENTS.md`, one sentence in worker step 3 of `docs/agent-task-protocol.md`, and this change, with an ADDED requirement in `engineering-principles`.

## Author self-check before review

- Interpretation: the rule covers comments in authored `*.ts`, `*.js`, `*.sh`, `Makefile`, `Dockerfile`, `*.yml`, and `*.yaml` files; every comment line counts, including block delimiters, and line length counts indentation and the marker.
- A scan of those tracked files, without generated files, lockfiles, and `docs/qualification/`, found 19 comment lines over 80 characters and 45 comment blocks over two lines, in 36 files (after pass 1; the first scan used fewer file types); they are left unchanged, as the proposal explains.
- Evidence check: no external link is added; the protocol links `AGENTS.md`, which exists.
- The added text follows its own rule where it is code-adjacent; the documents have no code comments.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree: `npm run openspec -- validate limit-comment-length --strict` passed, and `make verify` passed.

## Independent review

Assigned reviewer (rotation): Claude Code with `claude -p <prompt> --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree; prompt, output, and snapshots kept outside the worktree.
The JSON output reports `claude-fable-5-1`. SHA-256 snapshots of the files in `git ls-files -co --exclude-standard` before and after each pass were equal.

- **Pass 1 — session `c861905b-bddb-453a-a577-e00d77242149`.** The reviewer confirmed the counts of lines and blocks. Findings: 0 Critical, 0 High, 3 Medium, 4 Low. All accepted and resolved:
  1. Medium: "when touched" had three wordings. All places now say a comment whose lines the change's diff adds or edits.
  2. Medium: the counting rule was missing from `AGENTS.md` and the protocol, and block delimiters were undefined. Both now count every line, including `/**` and `*/`, plus indentation and markers; the design notes that a one-line block comment is written as `/** text */`.
  3. Medium: the file scope was unclear and generated files such as `tools/speckit/requirements.txt` were not exempt. The scope now lists the file types, and generated files and lockfiles are exempt in `AGENTS.md`, the spec (with a new scenario), and the design.
  4. Low: the file count was wrong. Recounted with the stated scope: 19 long lines and 45 long blocks in 36 files.
  5. Low: `AGENTS.md` lacked the exemption. Added.
  6. Low: the rule sat under "Identity and language". Moved to "Scope and architecture", after the first-class principles.
  7. Low: the design cited a scope rule not in the repository. It now cites the `AGENTS.md` scope rule.
