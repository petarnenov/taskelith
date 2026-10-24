# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

The owner's assignment on 2026-10-24, relayed by the session coordinating G0 closure: first G1 preparation, documentation only. Inspect OpenSpec and SpecKit native artifacts and workflows and record a framework-neutral mapping. Base revision: `4f78d29` on `dev`. Scope: the new `docs/sdlc-framework-mapping.md` and this change, including the new `sdlc-framework-mapping` capability. No code, port design, or adapter.

## Inspection

- OpenSpec 1.14.3: the installed `@fission-ai/openspec@1.14.3` `spec-driven` schema and templates; `schema.yaml` is byte-identical to the upstream file at commit `c794978f4f8845ce59693373c9dd882ee776588c` (tag `v1.14.3`). This repository's `openspec/` tree (15 specs and 21 archived changes at the inspected revision, `4f78d29`). CLI runs in the worktree: `--help`, `schemas`, `new change`, `status --change` (shows `tasks` blocked by `specs` and `design`), and `validate --strict`; `archive` was exercised by earlier changes in this repository.
- SpecKit 1.2.3: latest stable GitHub release `v1.2.3` (2026-10-22), tag object resolved to commit `5ea8b1cf0a38699340a38e00d02770308997d8c0`; PyPI `specify-cli` lists 1.2.3 as its current version. The source tarball was extracted in a scratch directory outside the repository and read only; SpecKit was not installed or run.

## Author self-check before review

- Every **(gap)** and **(unverified)** marker follows the document's definitions: static facts from the pinned source are cited without a marker, and runtime behaviour that was not exercised is marked unverified. (Definition aligned after review pass 1.)
- All seven governance stages have an entry for both frameworks.
- Only `docs/sdlc-framework-mapping.md` and this change's files were created; no file owned by the parallel `close-g0-foundation` change was touched.
- Evidence check: every external link in the new document is pinned to a full commit SHA; local links resolve to existing headings in `docs/architecture.md` and `docs/governance.md`.
- The first strict validation warned that the single requirement exceeded 500 characters; it was split into two requirements.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed (19 tests passed, dependency inventory verified, strict OpenSpec validation 16 passed, package verification passed).

After review, the commit was rebased onto `dev` at `81a3e48` (G0 closure and the code coverage gate had been integrated; no conflicts, as this change only adds files). On the rebased tree `make verify` passed: 23 tests passed with 100% line, branch, and function coverage, dependency inventory verified, strict OpenSpec validation 17 passed, package verification passed. The reviewed content is unchanged by the rebase, except that the inspected `openspec/` counts are now qualified with the inspected revision.

## Independent review

Assigned reviewer (rotation): Claude Code 2.1.310 with `claude -p <prompt> --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree; the JSON output reports model `claude-fable-5-1`. The prompt named the ADR 0004 principles and asked for every instance of a problem. SHA-256 snapshots of `git ls-files -co --exclude-standard` in the worktree before and after each pass were equal. The reviewer checked SpecKit facts against the pinned upstream commit with the `gh` CLI and `raw.githubusercontent.com`.

- **Pass 1 — session `54baf89c-c5ae-4e63-9fa1-3f27aa9a4fdd`.** Findings: 0 Critical, 0 High, 2 Medium, 8 Low. All accepted; the author confirmed each SpecKit correction in the source at the pinned commit:
  1. Medium: the **(unverified)** definition (anything read but not exercised) did not match its use, and the requirement, scenario, and self-check used different definitions. The marker now covers runtime behaviour that was not exercised, static facts from the pinned source are cited without a marker, and the requirement, scenarios, and self-check use that definition. Under it, the agent commands' stated behaviour and the `check-prerequisites` behaviour are now marked unverified.
  2. Medium: the feature directory override is `SPECIFY_FEATURE_DIRECTORY` (`scripts/bash/common.sh`); `SPECIFY_FEATURE` names the feature or branch. Corrected.
  3–10. Low: `archive` is attributed to earlier changes; the OpenSpec command list is labeled as a subset and the other commands are listed; `mcp` is a root command and `workflow search` was added; the `assess` and `bugfix` workflows are named as not covered and the linear-workflow statement is limited to `speckit`; the `git` extension creates branches in `before_specify`; the undefined "(unverified risk)" marker was replaced; `specs` and `design` both follow `proposal`; task 2.1 is checked.

After the fixes, `make verify` passed (19 tests passed, strict OpenSpec validation 16 passed).

- **Pass 2 — session `f309e51f-83d3-4504-97d6-2b67770f3068`.** All ten pass-1 findings confirmed resolved. Findings: 0 Critical, 0 High, 0 Medium, 5 Low. Fixed without another pass, as the review process allows for a Low-only pass; the author confirmed each in the pinned source. **These fixes have not been independently reviewed**:
  1. Low: `init` installs one script set, selected with `--script sh|ps|py`, not all three. Corrected.
  2. Low: the `validate --strict` description omitted the observed 500-character requirement check and the schema's 50-character `## Purpose` instruction. Added.
  3. Low: `check-prerequisites` also fails on an empty `plan.md` and can require `spec.md`. Corrected.
  4. Low: `design.md` said every cell is labeled; native cells are unmarked. Corrected.
  5. Low: the `design.md` sections omitted the schema's optional Migration Plan and Open Questions. Added.

After the fixes, `make verify` passed again (see Checks). Remaining findings: 0.

## Remaining gates

Independent review; owner authorization to push and open a pull request into `dev`; merge; archival; promotion to `main`. Follow-up work recorded in the document: running pinned SpecKit in a scratch project, shared mapping fixtures, and SpecKit qualification in the dependency register.
