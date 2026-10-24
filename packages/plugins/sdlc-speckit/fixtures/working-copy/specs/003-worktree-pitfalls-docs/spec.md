<!-- Derived fixture: written by hand from the pinned SpecKit 1.2.3 template .specify/templates/spec-template.md, with content from the archived OpenSpec change document-worktree-pitfalls. No harness has run SpecKit's agent steps. -->
# Feature Specification: Document the worktree pitfalls

**Feature Branch**: `003-worktree-pitfalls-docs`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Document two pitfalls of the worktree flow: merging with branch deletion from a worktree leaves the remote branch, and deleting it is refused by the pre-push gate when Node does not match the pin."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clean up after a merge without surprises (Priority: P1)

A contributor who merges a pull request from a worktree follows the release documentation and removes the remote branch without being stopped by either pitfall.

**Why this priority**: Both pitfalls were hit while following the documented flow.

**Independent Test**: Can be fully tested by reading the worktree section of the release documentation and following its cleanup commands.

**Acceptance Scenarios**:

1. **Given** a merged pull request, **When** the contributor follows the documented cleanup from a worktree, **Then** the remote branch is removed.
2. **Given** a Node version that differs from the pin, **When** the contributor deletes a remote branch with hooks enabled, **Then** the documentation explains why the push is refused.

---

### Edge Cases

- What happens when a later `gh` release deletes the remote branch even from a worktree?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The release documentation MUST describe both pitfalls and the commands that avoid them.
- **FR-002**: The local gate before push MUST state that a branch deletion push is also gated by `make verify`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The worktree section names both pitfalls with a workaround for each.

## Assumptions

- The hook and the merge tooling stay unchanged; this is documentation only.
