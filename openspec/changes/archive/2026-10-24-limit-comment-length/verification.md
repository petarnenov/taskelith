# Verification: limit-comment-length

Date: 2026-10-24.

## Scope and source

The owner wrote on 2026-10-24, marking it important, that comments are at most two lines of up to 80 characters. Base revision: `e774622` on `dev`. Scope: one bullet in `AGENTS.md`, one sentence in worker step 3 of `docs/agent-task-protocol.md`, and this change, with two ADDED requirements in `engineering-principles`.

## Author self-check before review

- Interpretation: the rule covers comments in authored `*.ts`, `*.js`, `*.sh`, `Makefile`, `Dockerfile`, `*.yml`, and `*.yaml` files and extensionless scripts such as `.githooks/pre-push`; every comment line counts, including block delimiters, and line length counts indentation and the marker.
- A scan of those tracked files, without generated files, lockfiles, and `docs/qualification/`, found 20 comment lines over 80 characters and 45 comment blocks over two lines, in 37 files (after pass 2; earlier scans used fewer file types); they are left unchanged, as the proposal explains.
- Evidence check: no external link is added; the protocol links `AGENTS.md`, which exists.
- The added text follows its own rule where it is code-adjacent; the documents have no code comments.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree: `npm run openspec -- validate limit-comment-length --strict` and `make verify` passed before review, after the pass-1 fixes (`efb2bf9`), and after the pass-2 fixes.

## Independent review

Assigned reviewer (rotation): Claude Code with `claude -p <prompt> --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree; prompt, output, and snapshots kept outside the worktree.
The JSON output reports `claude-fable-5-1`. SHA-256 snapshots of the files in `git ls-files -co --exclude-standard` before and after each pass were equal.

- **Pass 1 — session `c861905b-bddb-453a-a577-e00d77242149`, reviewed revision `0095a71`.** The reviewer confirmed the counts of lines and blocks. Findings: 0 Critical, 0 High, 3 Medium, 4 Low. All accepted and resolved:
  1. Medium: "when touched" had three wordings. All places now say a comment whose lines the change's diff adds or edits.
  2. Medium: the counting rule was missing from `AGENTS.md` and the protocol, and block delimiters were undefined. Both now count every line, including `/**` and `*/`, plus indentation and markers; the design notes that a one-line block comment is written as `/** text */`.
  3. Medium: the file scope was unclear and generated files such as `tools/speckit/requirements.txt` were not exempt. The scope now lists the file types, and generated files and lockfiles are exempt in `AGENTS.md`, the spec (with a new scenario), and the design.
  4. Low: the file count was wrong. Recounted with the stated scope: 19 long lines and 45 long blocks in 36 files.
  5. Low: `AGENTS.md` lacked the exemption. Added.
  6. Low: the rule sat under "Identity and language". Moved to "Scope and architecture", after the first-class principles.
  7. Low: the design cited a scope rule not in the repository. It now cites the `AGENTS.md` scope rule.

- **Pass 2 — session `df885f02-4eab-464f-aeb7-f82980a33113`, reviewed revision `efb2bf9`.** All seven pass-1 findings confirmed resolved, and the reviewer recounted 19 lines, 45 blocks, and 36 files for the stated scope. Findings: 0 Critical, 0 High, 0 Medium, 5 Low. Fixed without another pass, as the review process allows for a Low-only pass; **these fixes have not been independently reviewed**:
  1. Low: the trailing-comment rule was only in the design. Added to `AGENTS.md` and the requirement.
  2. Low: the file list was narrower than "authored scripts" and missed `.githooks/pre-push`. Extensionless scripts are now named, and the counts are 20 lines, 45 blocks, and 37 files.
  3. Low: the design cited a nonexistent `src/generated/` directory. Removed.
  4. Low: "generated files" was undefined. Defined as files a tool writes and no one edits by hand, in `AGENTS.md`, the requirement, and the design.
  5. Low: this record lacked the reviewed revisions and the reruns after fixes. Added.
  While fixing, strict validation rejected the grown requirement as over 500 characters, so it was split into "Comment length bound" and "Comment length scope", with a new one-line block-comment scenario.

Remaining findings: 0.

## Remaining gates

Integration (push, pull request into `dev`, merge) and archival.
