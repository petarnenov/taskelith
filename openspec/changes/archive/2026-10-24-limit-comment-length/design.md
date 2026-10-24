## Context

The owner's rule applies to comments in authored code: `*.ts`, `*.js`, `*.sh`, `Makefile`, `Dockerfile`, `*.yml`, and `*.yaml` files, and extensionless scripts such as `.githooks/pre-push`. A scan of those tracked files on 2026-10-24, without the exempt files, found 20 comment lines over 80 characters and 45 comment blocks over two lines, in 37 files.

## Goals / Non-Goals

Goals: record the rule where every session reads it, and apply it to all new and edited comments from now on. Non-goals: rewriting existing comments, and an automated lint check, which ADR 0004 principle 1 leaves to a later tool selection.

## Decisions

- Apply the rule to comments whose lines a change's diff adds or edits; an existing comment is shortened when a diff edits one of its lines. This keeps each change within its requested scope (`AGENTS.md`), and rewriting every file now would conflict with open branches on the same modules.
- Count every line of the comment, including the `/**` and `*/` lines of a block comment, so a one-line block comment is written as `/** text */`. Count characters including indentation and the comment marker, as a line-length tool would. A trailing comment counts the whole physical line.
- Exempt generated files and lockfiles (files a tool writes and no one edits by hand, for example `tools/speckit/requirements.txt` and `package-lock.json`), which tools rewrite, and captured third-party artifacts under `docs/qualification/`, which are evidence and stay byte for byte.

## Risks / Trade-offs

Without a check, the rule depends on authors and reviewers. A later change can add one to `make verify` once the existing comments are shortened.
