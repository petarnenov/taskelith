---

description: "Task list for the boundary entry-point fix"
---

<!-- Derived fixture: written by hand from the pinned SpecKit 1.2.3 template .specify/templates/tasks-template.md, with content from the archived OpenSpec change fix-boundary-entrypoint. No harness has run SpecKit's agent steps. -->
# Tasks: Run the boundary check through symlinked paths

**Input**: Design documents from `/specs/002-boundary-entrypoint-fix/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

## Phase 1: User Story 1 - Boundary violations fail from any checkout path (Priority: P1) 🎯 MVP

**Goal**: The checker runs through symlinked paths

**Independent Test**: Start the checker through a symlinked directory on a violating fixture

- [X] T001 [US1] Reproduce the silent skip by starting scripts/check-boundaries.ts through a symlinked path
- [X] T002 [US1] Compare the real path of `process.argv[1]` with the module path in scripts/check-boundaries.ts
- [X] T003 [US1] Add a regression test in test/check-boundaries.test.ts

## Dependencies & Execution Order

- T001 before T002; T003 after T002.
