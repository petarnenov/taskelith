<!-- Derived fixture: written by hand from the pinned SpecKit 1.2.3 template .specify/templates/plan-template.md, with content from the archived OpenSpec change fix-boundary-entrypoint. No harness has run SpecKit's agent steps. -->
# Implementation Plan: Run the boundary check through symlinked paths

**Branch**: `002-boundary-entrypoint-fix` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-boundary-entrypoint-fix/spec.md`

## Summary

Compare the real path of the invoked script with the module path, so that the entry-point guard is true through symlinks.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 24

**Primary Dependencies**: Node.js built-ins

**Storage**: N/A

**Testing**: `node --test`

**Target Platform**: Developer machines and CI

**Project Type**: cli (development script)

**Performance Goals**: N/A

**Constraints**: No change to the checks or the npm scripts

**Scale/Scope**: One script and one regression test

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution is the unfilled template from the pinned scaffold, so it defines no gates.

## Project Structure

### Documentation (this feature)

```text
specs/002-boundary-entrypoint-fix/
├── plan.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
scripts/check-boundaries.ts
test/check-boundaries.test.ts
```

**Structure Decision**: The fix stays in the development script and its test.
