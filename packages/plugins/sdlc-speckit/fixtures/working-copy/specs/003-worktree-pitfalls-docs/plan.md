<!-- Derived fixture: written by hand from the pinned SpecKit 1.2.3 template .specify/templates/plan-template.md, with content from the archived OpenSpec change document-worktree-pitfalls. No harness has run SpecKit's agent steps. -->
# Implementation Plan: Document the worktree pitfalls

**Branch**: `003-worktree-pitfalls-docs` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-worktree-pitfalls-docs/spec.md`

## Summary

Add both pitfalls and their workarounds to the worktree section of the release documentation.

## Technical Context

**Language/Version**: Markdown

**Primary Dependencies**: N/A

**Storage**: N/A

**Testing**: Review of the rendered documentation

**Target Platform**: Repository documentation

**Project Type**: documentation

**Performance Goals**: N/A

**Constraints**: No change to the hook, the Makefile, or the merge tooling

**Scale/Scope**: One documentation section

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution is the unfilled template from the pinned scaffold, so it defines no gates.

## Project Structure

### Documentation (this feature)

```text
specs/003-worktree-pitfalls-docs/
├── plan.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
docs/releases.md
```

**Structure Decision**: Documentation only.
