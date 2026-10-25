# Verification: share-test-helpers-sdlc

## Scope and source

Task assigned by the coordinator on 2026-10-25: the `@taskelith/sdlc` follow-up of the archived `share-test-helpers-remaining` change, option (b). The brief:

- Remove the development dependency and tsconfig reference of `@taskelith/testing` on `@taskelith/sdlc`. In `simulated-host.test.ts`, use the kernel's `Clock` if one exists; otherwise declare a structural type.
- Use the shared `value`, `id`, and `failed` helpers in the sdlc tests and remove the local copies.
- Regenerate the dependency inventory.
- No behavior change, and coverage of at least 75%.
- A MODIFIED delta of "Shared result helpers", no `skip_specs`, commit type `test`, and Claude Fable 5.1 medium as the reviewer by rotation.

Base revision: `7ff212d` on `dev`. Prepared in the git worktree `../taskelith-worktrees/share-test-helpers-sdlc` on branch `share-test-helpers-sdlc`.

Deviation from the brief: the kernel has no `Clock`, and a structural type would only check the harness against itself. So the `Clock` port test moved to `packages/modules/sdlc/test/clock.test.ts`, where it still checks the real port named by the "Simulated host clocks" requirement (`design.md`). Review pass 1 judged this sound.

Changed:

- The harness's manifest, tsconfig, and `simulated-host.test.ts`.
- The new `clock.test.ts`, and `gate.test.ts` and `task-admission-service.test.ts` in `@taskelith/sdlc`.
- The development dependency and tsconfig reference from `@taskelith/sdlc` to the harness, and the regenerated lockfile and dependency inventory.
- After pass 1, the boundary check of the harness manifest (`scripts/check-boundaries.ts`, rule R03) with its test. `workspaceDependencies` is now exported from `scripts/workspace-packages.ts`.
- The `deterministic-test-harness` delta (466 characters).

## Author self-check before review

- No local `value`, `id`, or `failed` remains in `packages/modules/sdlc/test/`. The removed `value` copies asserted `result.ok`, as the shared one does; only the failure message changes, to the failure as JSON, which includes its message.
- The moved `Clock` test has the same body, and the total test count before the boundary test stayed at 727.
- `@taskelith/testing` names no workspace package but `@taskelith/kernel` in its manifest or tsconfig.
- Every new comment is one line of at most 80 characters. The records add no external link.

## Checks

In the worktree, Node v24.22.1:

- `npm run openspec -- validate share-test-helpers-sdlc --strict` passed at every head.
- `make verify` passed at `a813e8f` before pass 1: 727 tests passed, 0 failed; coverage lines 99.44%, branches 93.22%, functions 99.07%; strict OpenSpec validation 49 passed, 0 failed.
- It passed at `e73db79` before pass 2: 727 tests; branches 93.23%.
- It passed after the pass 2 fixes: 728 tests passed, 0 failed; coverage lines 99.44%, branches 93.22%, functions 99.07%; OpenSpec 49/49.
- The `pre-push` hook ran `make verify` again at the handoff head.

## Independent review

Assigned reviewer: Claude Fable 5.1 (`claude-fable-5-1`, confirmed in the JSON `modelUsage`), effort medium, permission mode `plan`, with `Edit`, `Write`, and `NotebookEdit` disallowed. Invocation from the worktree, with the prompt and output outside it: `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`. The SHA-256 snapshots of the worktree before and after each pass were equal.

- **Pass 1 — session `6ed29b0a-b8cd-45b1-8e60-9f18c4222e38`, head `a813e8f`.** It judged the `Clock` test move sound. Findings: 0 Critical, 0 High, 1 Medium, 2 Low. All accepted and resolved in `e73db79`:
  1. Medium: no automatic check enforced the delta's rule that the harness depends on no workspace package but the kernel. Fix: `checkTestHarnessManifest` in `scripts/check-boundaries.ts` reports any other workspace package in the harness manifest's dependency fields, with a test. The delta's new scenario states this check.
  2. Low: the rewritten requirement dropped "the kernel's" and "instead of defining their own copies". Fix: both restored.
  3. Low: `design.md` did not list the local `instant` helpers as out of scope. Fix: they are listed in its non-goals.
- **Pass 2 — session `5dd13b62-af3f-4340-adf8-954b45a3df41`, head `e73db79`.** It confirmed all three pass 1 findings resolved. Findings: 0 Critical, 0 High, 0 Medium, 2 Low. Both fixed without another pass, as the review process allows for a Low-only pass, and **not independently reviewed**:
  1. Low: the manifest check repeated the dependency-field logic of `workspaceDependencies` in `scripts/workspace-packages.ts`, and the kernel package name appeared three times. Fix: `workspaceDependencies` is exported and used, and a `KERNEL_PACKAGE` constant replaces the literals.
  2. Low: the manifest assertions sat inside a test named for import rules. Fix: a separate test, "the harness manifest may depend on no workspace package but the kernel", with its own fixture.

## Limitations

- Checks ran on macOS arm64 only; Linux runs in CI.
- The pass 2 fixes are not independently reviewed.

## Remaining gates

Integration into `dev` and archive by the coordinator, which applies the delta, and promotion to `main`.
