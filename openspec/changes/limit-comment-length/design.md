## Context

The owner's rule applies to comments in code: TypeScript, shell, Makefile, and configuration files. A scan of the tracked files on 2026-10-24 found 18 comment lines over 80 characters and 45 comment blocks over two lines, in about 20 files.

## Goals / Non-Goals

Goals: record the rule where every session reads it, and apply it to all new and edited comments from now on. Non-goals: rewriting existing comments, and an automated lint check, which ADR 0004 principle 1 leaves to a later tool selection.

## Decisions

- Apply the rule to added and edited comments, and shorten an existing comment when a change touches it, as the scope rule for clean-up in touched code already does. Rewriting every file now would conflict with open branches on the same modules.
- Count the comment's own lines, not the code line it trails, and count characters including indentation and the comment marker, as a line-length tool would.
- Exclude captured third-party artifacts, such as `docs/qualification/speckit-1.2.3/`, which are evidence and stay byte for byte.

## Risks / Trade-offs

Without a check, the rule depends on authors and reviewers. A later change can add one to `make verify` once the existing comments are shortened.
