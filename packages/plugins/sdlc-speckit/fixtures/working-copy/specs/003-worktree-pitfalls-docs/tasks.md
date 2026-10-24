---

description: "Task list for the worktree pitfalls documentation"
---

<!-- Derived fixture: written by hand from the pinned SpecKit 1.2.3 template .specify/templates/tasks-template.md, with content from the archived OpenSpec change document-worktree-pitfalls. No harness has run SpecKit's agent steps. -->
# Tasks: Document the worktree pitfalls

**Input**: Design documents from `/specs/003-worktree-pitfalls-docs/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

## Phase 1: User Story 1 - Clean up after a merge without surprises (Priority: P1) 🎯 MVP

**Goal**: Both pitfalls are documented with workarounds

**Independent Test**: Follow the documented cleanup from a worktree

- [X] T001 [US1] Describe the `gh pr merge --delete-branch` pitfall and its workaround in docs/releases.md
- [X] T002 [US1] Describe the refused branch deletion push and its workaround in docs/releases.md

## Dependencies & Execution Order

- T001 and T002 edit the same file and run in sequence.
