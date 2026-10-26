# Verification: streamline-task-integration

## Scope and source

On 2026-10-26 the owner asked to streamline task integration; coordinator Niki relayed the request the same day. Scope: (A) the `pre-push` hook skips `make verify` for a push whose every ref is a deletion, with tests; (B) the worker archives its change in the last commit of its branch, so that the coordinator integrates each task with one pull request and no archive pull request, with the re-archive rule for spec conflicts and the rule for the integration gate in the archived record. Excluded: the coordinator's private integration scripts outside the repository, which the coordinator adapts, and product code.

## Revision and environment

- Base: `origin/dev` at `075352c`. Branch `streamline-task-integration`. Commits: `f14b5f5` (hook, scripts, tests), `290f849` (protocol and policy documents), `f10cf83` (this change).
- Host: macOS 26.6.2 (Darwin 25.6.0), x86_64 (2020 Intel iMac); Docker engine 29.5.2; Node.js 24.22.1 from `.nvmrc`. Other worktrees ran `make verify` on the same host at the same time.

## Author self-check and evidence check

- Clean Code: the delete-only decision is one pure function, `isDeleteOnlyPush`, beside `unverifiedPushRefs`, which now share the line parsing (`pushedRefs`). The exit status that carries the decision to the hook is a named constant, `DELETE_ONLY_PUSH_STATUS`, which the hook names in its comment.
- The hook keeps the `sh` style of `.githooks/post-merge`; every comment is within two lines of 80 characters (`npm run verify:comments`).
- Makefile-driven operation: both new tests run in `npm test`, so in `make test` and `make verify`. The scripts are outside the coverage scope (`dist/**`), like the other hook helpers; their behavior is covered by the tests.
- A delete-only push skips the committed-inventory and pushed-commit checks too, because both only protect `make verify`; the `dependency-inventory` delta says so.
- Nothing assumes an active change at integration: `npm run verify:archive` passes with no active change (its requirement and test cover `openspec/changes/` holding only `archive/`), `validate --all --strict` covers the living specs and the archive, and no script, hook, or CI workflow (`.github/workflows/release.yml` runs only `make verify`) reads an active change. A change whose evidence is written under `openspec/changes/<change>/` must write it before the archive, which moves it.
- Spec requirement lengths: 449, 445, 330, and 311 characters (`agent-task-protocol`), 333 (`dependency-inventory`), 406 (`integration-flow`).
- Evidence check: the change adds no external link or external fact; its source is the owner's request above.

## Checks

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test test/pre-push-checks.test.ts test/pre-push-hook.test.ts test/inventory-merge.test.ts` on `f14b5f5` | 9 tests passed |
| `npm run openspec -- validate streamline-task-integration --strict` on `f10cf83` | valid |
| `npm run verify:comments` on `f10cf83` | passed |
| `make verify` on `f10cf83`, first run | Failed in an unrelated test, `apps/control-plane/test/control-plane-api.integration.test.ts:417` ("the control plane did not answer"), while other worktrees ran `make verify` on the host; 1877 tests, 1874 passed, 1 failed, 2 skipped |
| `make verify` on `f10cf83`, second run | Passed (exit 0): 1877 tests, 1875 passed, 0 failed, 2 skipped (the Linux-only scan tests), the new pre-push tests among them; coverage of all files 99.28% lines, 92.05% branches, 99.03% functions; contract compatibility 0 breaking changes; OpenSpec 69 passed; `verify:archive` and `verify:package` passed |

## Independent review

Reviewer: Codex CLI (gpt-6-astra) pending.

## Limitations

- The hook test runs the real hook with a fake `make`, not a real `git push`; git's hook input format is reproduced from the existing tests.
- The re-archive flow is documented, not exercised on a real conflict.

## Remaining gates

- Independent review by Codex CLI (gpt-6-astra).
- Archive of this change on its branch (worker step 7), after the review.
- Integration into dev by the coordinator (single pull request).
