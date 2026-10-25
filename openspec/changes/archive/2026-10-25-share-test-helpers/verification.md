# Verification: share-test-helpers

## Scope and source

Task assigned by the coordinator on 2026-10-25: the follow-up of pass 3 finding 12 of the `implement-resource-admission` review, to move the duplicated `value`, `must`, and `id` test helpers into `@taskelith/testing`. Base revision: `e0db869` on `dev`. Prepared in the git worktree `../taskelith-worktrees/share-test-helpers` on branch `share-test-helpers`. The coordinator's brief set the scope: only the helpers the follow-up names, or clearly duplicated ones between the packages it names, plus their call sites. It also said no behavior change, coverage of at least 75%, and Codex as the reviewer. The brief first set no spec delta (`skip_specs: true`); after pass 1 the coordinator reversed that (see the decision below). Out of scope: other refactors and the duplicated `readdir` in `migrations.ts`.

Changed: `packages/testing/src/results.ts` (new, `value` and `id`), its export and test, and the tests of `@taskelith/postgres` and `@taskelith/scheduling`. The change also adds a development dependency and a tsconfig reference from `@taskelith/scheduling` to the harness, which the workspace contract requires, and the regenerated dependency inventory, and the `deterministic-test-harness` delta with the requirement "Shared result helpers".

## Author self-check before review

- Every local `value` and `id` in the `test/` directories of `@taskelith/postgres` and `@taskelith/scheduling` is removed and imported from `@taskelith/testing`. The `value` that `postgres/test/fixtures.ts` exported is no longer exported, and its two importers take it from the harness.
- The `must` helpers stay in `packages/modules/*/src/ports/*-conformance.ts`, because those files are product sources, which the boundary check and the "Test-only harness package" requirement forbid to import the harness.
- The tests check the same things; only the failure message of a failing helper changes, to the failure as JSON, which includes its message.
- The harness's new source imports only `node:assert/strict` and `@taskelith/kernel`. Every new comment is one line of at most 80 characters.
- Evidence check: the records add no external link.

## Checks

In the worktree, Node v24.22.1: `npm run openspec -- validate share-test-helpers --strict` passed. `make verify` passed at `29e5d7f` before the review (702 tests passed, 0 failed; coverage lines 99.29%, branches 93.21%, functions 99.06%; strict OpenSpec validation 48 passed, 0 failed). The first run failed on the scheduling tsconfig references and the second on the stale dependency inventory; both were fixed before `29e5d7f`. The `pre-push` hook ran `make verify` again at the handoff head, which adds only this record and the `tasks.md` checkboxes.

## Independent review

Assigned reviewer: Codex CLI (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, all confirmed in the output header. Invocation from the worktree, with the prompt and log outside it: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. The SHA-256 snapshots of the worktree before and after the pass were equal.

- **Pass 1 — session `01a1725f-e677-76a1-abd3-977c4887a1b3`, head `29e5d7f`.** The reviewer ran the 30 affected unit tests, the TypeScript check, the boundary and comment-length checks, and the strict OpenSpec validation, and found no problem with correctness, call sites, dependencies, tsconfig, or scope. Findings: 0 Critical, 0 High, 0 Medium, 1 Low.
  1. Low: `skip_specs: true` matches worker step 2 of the agent task protocol only for documentation work, and this change adds exported harness functions. The reviewer proposed a small delta to `deterministic-test-harness`. First left unchanged, because the brief set no spec delta, and sent to the coordinator; resolved after the coordinator's decision below (unreviewed).

The pass had only a Low finding, so no further pass follows under the review process.

## Decision on the pass 1 finding

On 2026-10-25 the coordinator decided to accept finding 1: worker step 2 allows `skip_specs` only for documentation work, and the brief was wrong. The fix, **not independently reviewed**, removes `skip_specs: true` from `.openspec.yaml` and adds the `deterministic-test-harness` delta with the requirement "Shared result helpers" (298 characters) and two scenarios, which the tests in `packages/testing/test/results.test.ts` cover. `npm run openspec -- validate share-test-helpers --strict` passed, and `make verify`, which archives every active change in a temporary copy, passed through the `pre-push` hook at the handoff head.

## Limitations

- Checks ran on macOS arm64 only; Linux runs in CI.
- Codex has no network access; the change has no external facts to check.

## Remaining gates

Later follow-up: the identical `value`, `id`, and `failed` or `failureOf` helpers in the tests of `@taskelith/execution`, `@taskelith/worker-journal`, and `@taskelith/sdlc`. Then integration into `dev` and archive by the coordinator, which applies the delta, and promotion to `main`.
