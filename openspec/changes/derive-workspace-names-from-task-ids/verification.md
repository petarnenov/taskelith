# Verification: derive-workspace-names-from-task-ids

## Scope and source

- Source: coordinator Niki's brief of 2026-10-27 for the G3 item 0 follow-up `derive-workspace-names-from-task-ids` (size S), from review pass 2 of item 6 in the change `revalidate-g3-foundations`, finding M2 (`contract-drift`): "The safe name rule rejects client-chosen G2 task identifiers, so such a task never gets a workspace" (`/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/findings.jsonl` line 54, which cites `docs/contracts/git-workspace.md:30`).
- Coordinator decision, not reopened: derive branch and directory names by encoding a readable sanitized prefix and a digest of the full identifier, collision-free and deterministic; no API restriction and no OpenAPI change; drop the claim that item 9 mints safe identifiers.
- Finding checked at `origin/dev` `93b5065b`. The finding's line 30 and the brief's lines 30, 48, and 150 are stale; the rule sits at `docs/contracts/git-workspace.md:32` (the Names bullet, with the item 9 minting claim), `:68-69` (the branch `taskelith/<taskId>`), `:128` (the `unsafe-name` row), `:164` (the suite's unsafe-name cases), and `:190` (the item 9 obligation). The client-chosen identifiers: `SubmitTaskRequest.taskId` is an `Identifier` (`packages/contracts/documents/sdlc.openapi.json:560`) of 1 to 128 printable ASCII characters without whitespace (`packages/contracts/documents/sdlc.openapi.json:312`, `packages/kernel/src/identifier.ts:10-11`); task creation uses it as is (`apps/control-plane/src/application/task-creation.ts:64`) and a delegation parses the child's identifier the same way (`apps/control-plane/src/application/delegation-service.ts:75`). The brief's `docs/.../sdlc.openapi.json` is under `packages/contracts/documents/`, not `docs/`.
- Delivered: see [proposal](proposal.md) and [design](design.md); the name form is design D1 to D3.

## Revision

The branch `derive-workspace-names-from-task-ids`, from `origin/dev` at `93b5065b`. The first checks ran on the working tree of `1370e7aa`, with this record uncommitted; review pass 1 reviewed `625d64fa`, and the checks after its fixes ran on the working tree of `6690c3b7`, with this record uncommitted.

## Environment

Linux 7.0.0-38-generic x86_64, Node.js v24.22.1 through `nvm use`, Git 2.55.0. The host has an empty `/tmp/.git` that breaks tests that look for a Git working tree, so `make verify` ran with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`.

## Author self-check

- Checked that `@taskelith/workspace` is a private workspace package, not part of the published `taskelith` package, so the commit types are `chore`, `test`, and `docs`.
- Checked that every module, the workspace module included, builds with `"types": []` (`packages/modules/workspace/tsconfig.json`): a first build with `node:crypto` in the domain failed with `TS2307: Cannot find module 'node:crypto'`, which led to design D5.
- Checked that G2 attempt identifiers are minted as `t` and a SHA-256 in hexadecimal (`apps/control-plane/src/application/attempt-identities.ts:8-16`); the derivation applies to them anyway (design D4).
- Searched `docs/` and `openspec/specs/` for other statements of the rule (`unsafe-name`, `safe form`, `taskelith/<taskId>`, `mints`, `minted`, item 9 obligations): only `docs/contracts/git-workspace.md` and `openspec/specs/git-workspace-port/spec.md` state it. `docs/g3-plan.md` rows 6, 9, and 16 name no naming rule or minting obligation, so they are unchanged.
- Requirement bodies of the delta, measured: 446 (Workspace name derivation), 358 (Workspace layout per attempt), 390 (Prepare refusals), 295 (Task branch per task), and 490 (Workspace conformance suite) characters.
- The pinned OpenSpec refuses a `MODIFIED` block that drops a current scenario, so the layout requirement keeps the scenario names "Unsafe attempt identifier" and "Unsafe task at a head" with their new outcomes.
- Checked the collision figure: n²/2¹²⁹ for n = 10⁹ is 10¹⁸ / 6.8 × 10³⁸ ≈ 1.5 × 10⁻²¹.

## Evidence: fail before, pass after

- **Before.** A detached worktree of `93b5065b` with this change's `packages/modules/workspace/test/workspace-domain.test.ts`, without its import of `WORKSPACE_NAME_RULES` and the two assertions on it, which the old package does not export: `npm run build`, then `node --experimental-strip-types --test test/workspace-domain.test.ts` in `packages/modules/workspace` ran 18 tests, 12 passed and 6 failed: "WORKSPACE_FAILURE_REASONS holds the contract's values, frozen", "a name is the readable prefix of the identifier and its digest", "the digest is SHA-256 across the padding and block boundaries", "any identifier gives a safe path segment of at most 73 characters", "any identifier gives a branch that Git accepts", and "identifiers with the same readable prefix get distinct names". The old functions return an `unsafe-name` failure for `feature/login`, `v1.2`, `..`, `a/b`, and the other unsafe identifiers.
- **Before, through the suite.** The new conformance case cannot run against the pre-change double, whose naming functions return a `Result`; the double's new defect `rejectsUnsafeNames`, which keeps the former safe-name refusal, makes exactly the case "derives distinct workspace names and task branches from any identifiers" fail, and `namesBranchByRawTaskId` makes it, the prepare, continuation, and push cases fail.
- **After.** The same domain test file passes 18 of 18 on the change, and the workspace package's three test files pass 64 of 64 (`node --experimental-strip-types --test test/*.test.ts` in `packages/modules/workspace`).

After review pass 1:

| Test | Before (the pass 1 suite) | After |
| --- | --- | --- |
| `workspace-conformance.test.ts`: "a provider that names the workspace directory by an encoding of the attempt identifier fails the suite" (finding 1) | Fails: the double that percent-encodes the directory name passes every case, 64 of 65 tests pass | Passes: the name derivation case reports the working directories; 65 of 65 pass |

The reviewer's in-memory provider with working directories such as `/outside/a%2Fb/checkout` and correct branches gave no finding before the fix and four after it.

## Checks and results

- After the pass 1 fixes, `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: exit 0, 2254 tests, 2207 passed, 0 failed, 47 skipped; total coverage 99.28 % of lines, 92.28 % of branches, and 98.93 % of functions; the OpenSpec scenario check 70 passed, 0 failed. The strict validation of the change is valid, and `make findings ARGS="validate"` reports 37 valid findings files and 17 valid pass summary files.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: exit 0. The test run reported 2253 tests, 2206 passed, 0 failed, 47 skipped; total coverage 99.28 % of lines, 92.25 % of branches, and 98.93 % of functions; `sha256.js` and `workspace.js` of `@taskelith/workspace` at 100 % on all three. The OpenSpec scenario check reported 70 passed, 0 failed. It includes `npm run verify:comments`, `npm run verify:links`, and the archive of every active change in a temporary copy.
- `npm run openspec -- validate derive-workspace-names-from-task-ids --strict`: `Change 'derive-workspace-names-from-task-ids' is valid`.
- `make findings ARGS="validate"`: `Every findings file is valid: 37 file(s); every pass summary file is valid: 17 file(s).`
- The review checklist in [design](design.md) is the exact output of `make findings ARGS="checklist --capability git-workspace-port,workspace-packages --files packages/modules/workspace/**,packages/adapters/**,docs/contracts/git-workspace.md"`.

## Independent review

### Pass 1, reviewer A

- Reviewer: Codex CLI, `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, reviewed head `625d64fa`.
- Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- Model confirmation: the output header names model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only.
- Session: `01a17e73-ba72-7423-8d7a-bf089e1f5079`.
- Snapshot: `61e13be93a288f32a794951d39a155768995ce6ca946da25d7876b34f344525b` before and after the pass, unchanged.
- Counts: Critical 0, High 0, Medium 1, Low 1.
- Reviewer checks: the SHA-256 matched `node:crypto` in 3075 comparisons; the five requirement lengths and the review checklist were confirmed; one domain test could not run in the reviewer's sandbox (`spawnSync git EPERM`), which is not a defect.

| # | Severity | Finding | Resolution | Commit |
| --- | --- | --- | --- | --- |
| 1 | Medium | The name derivation case checked the branch but not the working directory, so a misnamed or misplaced directory passed | The fixture names its data root; the case compares each working directory with `worker/workspaces/<name>/checkout` under it; defective double that percent-encodes the directory name; contract section 12 and 13, design, and a spec scenario | `6690c3b7` |
| 2 | Low | The design's example of why safe identifiers keep the digest did not collide | The example is the safe identifier `a_b-<digest of a/b>`; no other record or comment held it | `6690c3b7` |

## Limitations

- The SHA-256 is the module's own code (design D5); its tests compare it with `node:crypto` for 1, 55, 56, 63, 64, 65, 119, 120, and 128 bytes and the other test identifiers, not with the FIPS test vectors directly.
- The Git branch check runs `git check-ref-format --branch` for the test identifiers only; the claim for all identifiers rests on the name's character set (design D2).
- No Git adapter exists yet (item 16), so no real clone or push uses a derived name.

## Remaining gates

- Review pass 2 by reviewer B (Claude Code `claude-opus-5-5`, effort high), which checks the pass 1 fixes and reviews the whole change
- Review pass 3 by reviewer A (Codex `gpt-6.1-sol`), which confirms the pass 2 fixes, unless pass 2 finds nothing above Low
- Archive of the change
- Integration into dev by the coordinator (single pull request)
