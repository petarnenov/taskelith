<!-- Derived fixture: written by hand from the pinned SpecKit 1.2.3 template .specify/templates/plan-template.md, with content from the archived OpenSpec change draft-sdlc-framework-port. No harness has run SpecKit's agent steps. -->
# Implementation Plan: Draft SDLC framework port

**Branch**: `001-sdlc-framework-port` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-sdlc-framework-port/spec.md`

## Summary

Add a draft port, a capability parser, and a framework-neutral conformance suite to the SDLC module's ports layer.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 24

**Primary Dependencies**: None beyond the shared kernel package

**Storage**: N/A

**Testing**: `node --test` with built-in coverage

**Target Platform**: Node.js worker and control plane

**Project Type**: library (npm workspace package)

**Performance Goals**: N/A

**Constraints**: No I/O in the port or the suite; plugin results are copied and checked before use

**Scale/Scope**: Seven operations and one suite

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution is the unfilled template from the pinned scaffold, so it defines no gates.

## Project Structure

### Documentation (this feature)

```text
specs/001-sdlc-framework-port/
├── plan.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/modules/sdlc/
├── src/ports/
└── test/
```

**Structure Decision**: The port belongs to the SDLC module, which owns its outbound ports.
