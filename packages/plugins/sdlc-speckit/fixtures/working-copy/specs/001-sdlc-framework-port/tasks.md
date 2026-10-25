---

description: "Task list for the draft SDLC framework port"
---

<!-- Derived fixture: written by hand from the pinned SpecKit 1.2.3 template .specify/templates/tasks-template.md, with content from the archived OpenSpec change draft-sdlc-framework-port. No harness has run SpecKit's agent steps. -->
# Tasks: Draft SDLC framework port

**Input**: Design documents from `/specs/001-sdlc-framework-port/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Create `packages/modules/sdlc/src/ports/` for the port files

---

## Phase 2: User Story 1 - Implement a framework plugin against one port (Priority: P1) 🎯 MVP

**Goal**: A draft port with plain request and result shapes

**Independent Test**: A stand-in plugin implements every operation

- [X] T002 [US1] Define the port in packages/modules/sdlc/src/ports/sdlc-framework.ts
- [X] T003 [P] [US1] Add runtime copies and shape checks in packages/modules/sdlc/src/ports/plain-data.ts

---

## Phase 3: User Story 2 - Declare what the framework supports (Priority: P2)

- [X] T004 [US2] Parse the capability declaration in packages/modules/sdlc/src/ports/sdlc-framework.ts

---

## Phase 4: User Story 3 - Check a plugin with its own fixtures (Priority: P3)

- [X] T005 [US3] Add the conformance suite in packages/modules/sdlc/src/ports/sdlc-framework-conformance.ts
- [X] T006 [US3] Test the suite in packages/modules/sdlc/test/sdlc-framework-port.test.ts

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T007 Export the port and the suite from packages/modules/sdlc/src/index.ts

## Dependencies & Execution Order

- T002 before T004 and T005; T003 can run in parallel with T002.
