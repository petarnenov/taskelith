## Context

The rule covers tracked `*.ts`, `*.js`, `*.sh`, `Makefile`, `Dockerfile`, `*.yml`, and `*.yaml` files and extensionless scripts such as `.githooks/pre-push`. On `dev` at `d113b6a` the new check found 124 violations: 42 in the SpecKit fixture scaffold `packages/plugins/sdlc-speckit/fixtures/working-copy/.specify/`, which is a byte-for-byte copy of the capture under `docs/qualification/` that the plugin tests compare with it, and 82 in 39 authored files (comments over two lines, and lines over 80 characters).

## Goals / Non-Goals

Goals: every comment in scope meets the bound, and `make verify` keeps it so. Non-goals: other comment rules, such as content, and general lint tooling, which ADR 0004 principle 1 leaves to a later selection.

## Decisions

- **A repository script, not a linter.** ESLint's `max-len` checks lines but not comment spans, and covers no shell, YAML, or Makefile. `scripts/check-comment-length.ts` follows the other `scripts/check-*.ts` checks, with its pure parts exported for unit tests, and adds no dependency.
- **Comment detection.** TypeScript and JavaScript comments come from the TypeScript compiler's comment ranges over the parsed file, so strings, template literals, and regular expressions never count. `#` comments (shell, YAML, Makefile, Dockerfile) start at a word start outside quotes, so `$#`, `${x#y}`, an escaped space, and a quoted `#` do not count; a first-line shebang is not a comment.
- **Counting.** Own-line `//` or `#` comments on adjacent lines form one comment; a block comment spans its physical lines, delimiters included; a trailing comment is a comment of its own. Every line a comment occupies is measured as its whole physical line in code points, without a trailing carriage return; a tab counts as one character.
- **Scope.** The check reads `git ls-files`, so generated output, which git ignores, is never read; lockfiles and `docs/qualification/` are exempt by path, and so is the fixture scaffold copy (`.specify/` and `.agent/` under the SpecKit working copy), which the plugin tests require to equal the capture.
- **Shortening.** Each comment keeps its contract or rationale; detail that the code, the specification, or the linked document already states is dropped instead of being restated.

## Risks / Trade-offs

The `#` scan reads one line at a time, so a `#` after whitespace inside a multi-line quoted string would count as a comment; no tracked file has one, and a false report fails visibly rather than silently. A new tracked generated file or third-party copy needs an exemption entry in the script.
