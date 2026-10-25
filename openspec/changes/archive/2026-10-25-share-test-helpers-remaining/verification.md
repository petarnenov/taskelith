# Verification: share-test-helpers-remaining

## Scope and source

Task assigned by the coordinator on 2026-10-25: the follow-up of the archived `share-test-helpers` change. It uses the `@taskelith/testing` `value` and `id` helpers in the tests of `@taskelith/execution`, `@taskelith/worker-journal`, and `@taskelith/sdlc`, and adds `failed` to the harness only if it is clearly duplicated. A corrected brief set a MODIFIED delta of "Shared result helpers" under 500 characters and no `skip_specs`. Commit type `test`, reviewer Codex. No behavior change; the conformance `must` helpers under `src/` stay. Base revision: `097b9a4` on `dev`. Prepared in the git worktree `../taskelith-worktrees/share-test-helpers-remaining` on branch `share-test-helpers-remaining`.

Coordinator decision during the task: the `@taskelith/sdlc` tests are left out. `@taskelith/testing` depends on `@taskelith/sdlc` (development dependency and tsconfig reference) for `import type { Clock }` in `packages/testing/test/simulated-host.test.ts`, and the workspace contract makes tsconfig references equal dependencies, so the reverse dependency would form a project-reference cycle. Changing the harness's dependency graph is beyond this change.

Changed: `failed` in `packages/testing/src/results.ts`, its export and tests; the tests of `@taskelith/execution` and `@taskelith/worker-journal`; the development dependency and tsconfig reference from `@taskelith/execution` to the harness; the regenerated dependency inventory; and the `deterministic-test-harness` delta (381 characters).

## Author self-check before review

- No local `value`, `id`, `failed`, or `failureOf` remains in the `test/` directories of the two packages. The fixtures no longer export them; every importer takes them from `@taskelith/testing`.
- `failureOf` and `failed` were identical (`assert.ok(!result.ok, 'expected a failure')`), and both `value` copies already had the harness's message, so the tests check the same things and fail with the same messages. `failureOf` call sites in `@taskelith/execution` are renamed to `failed`.
- The harness's source imports only `node:assert/strict` and `@taskelith/kernel`. The new comment is one line of at most 80 characters.
- Evidence check: the records add no external link.

## Checks

In the worktree, Node v24.22.1: `npm run openspec -- validate share-test-helpers-remaining --strict` passed. `make verify` passed at `8274f45` before the review (727 tests passed, 0 failed; coverage lines 99.44%, branches 93.22%, functions 99.07%; strict OpenSpec validation 49 passed, 0 failed). The `pre-push` hook ran `make verify` again at the handoff head, which adds only this record and the `tasks.md` checkboxes.

## Independent review

Assigned reviewer: Codex CLI (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, all confirmed in the output header. Invocation from the worktree, with the prompt and log outside it: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. The SHA-256 snapshots of the worktree before and after the pass were equal.

- **Pass 1 — session `01a17274-1fa9-73a3-a71a-15d45fa06525`, head `8274f45`.** The reviewer confirmed that the test bodies are unchanged apart from the `failureOf` rename, that no local copy remains, that the dependencies and tsconfig references agree with the workspace contract, and that the delta has no `skip_specs`. Findings: 0 Critical, 0 High, 0 Medium, 0 Low.

## Limitations

- Checks ran on macOS arm64 only; Linux runs in CI.
- The reviewer relied on the author's `make verify` result and did not rerun it.

## Remaining gates

Later follow-up: the `value` helpers of the `@taskelith/sdlc` tests, which need the harness's development dependency on `@taskelith/sdlc` removed first. Then integration into `dev` and archive by the coordinator, which applies the delta, and promotion to `main`.
