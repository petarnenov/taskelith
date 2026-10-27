# Verification: derive-workspace-names-from-task-ids

## Scope and source

- Source: coordinator Niki's brief of 2026-10-27 for the G3 item 0 follow-up `derive-workspace-names-from-task-ids` (size S), from review pass 2 of item 6 in the change `revalidate-g3-foundations`, finding M2 (`contract-drift`): "The safe name rule rejects client-chosen G2 task identifiers, so such a task never gets a workspace" (`/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/findings.jsonl` line 54, which cites `docs/contracts/git-workspace.md:30`).
- Coordinator decision, not reopened: derive branch and directory names by encoding a readable sanitized prefix and a digest of the full identifier, collision-free and deterministic; no API restriction and no OpenAPI change; drop the claim that item 9 mints safe identifiers.
- Finding checked at `origin/dev` `93b5065b`. The finding's line 30 and the brief's lines 30, 48, and 150 are stale; the rule sits at `docs/contracts/git-workspace.md:32` (the Names bullet, with the item 9 minting claim), `:68-69` (the branch `taskelith/<taskId>`), `:128` (the `unsafe-name` row), `:164` (the suite's unsafe-name cases), and `:190` (the item 9 obligation). The client-chosen identifiers: `SubmitTaskRequest.taskId` is an `Identifier` (`packages/contracts/documents/sdlc.openapi.json:560`) of 1 to 128 printable ASCII characters without whitespace (`packages/contracts/documents/sdlc.openapi.json:312`, `packages/kernel/src/identifier.ts:10-11`); task creation uses it as is (`apps/control-plane/src/application/task-creation.ts:64`) and a delegation parses the child's identifier the same way (`apps/control-plane/src/application/delegation-service.ts:75`). The brief's `docs/.../sdlc.openapi.json` is under `packages/contracts/documents/`, not `docs/`.
- Delivered: see [proposal](proposal.md) and [design](design.md); the name form is design D1 to D3.

## Revision

The branch `derive-workspace-names-from-task-ids`, from `origin/dev` at `93b5065b`. The first checks ran on the working tree of `1370e7aa`, with this record uncommitted; review pass 1 reviewed `625d64fa`, and the checks after its fixes ran on the working tree of `6690c3b7`, with this record uncommitted. Review pass 2 reviewed `583eb088`, and the checks after its fixes ran on the clean tree of `bb175e0d`, before this record's pass 2 update. The archive commit `7264c338` was reverted in `f55d3282` when the coordinator returned the task; the fix of the coordinator's finding is `7a6f6b69`, and the checks after it ran on the working tree of `7a6f6b69`, with the records of the return uncommitted.

## Environment

Linux 7.0.0-38-generic x86_64, Node.js v24.22.1 through `nvm use`, Git 2.55.0. The host has an empty `/tmp/.git` that breaks tests that look for a Git working tree, so `make verify` ran with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`.

## Author self-check

- Checked that `@taskelith/workspace` is a private workspace package, not part of the published `taskelith` package, so the commit types are `chore`, `test`, and `docs`.
- Checked that every module, the workspace module included, builds with `"types": []` (`packages/modules/workspace/tsconfig.json`): a first build with `node:crypto` in the domain failed with `TS2307: Cannot find module 'node:crypto'`, which led to the hand-written SHA-256 of the first design D5, superseded by the injected digest after the coordinator's return.
- Checked that G2 attempt identifiers are minted as `t` and a SHA-256 in hexadecimal (`apps/control-plane/src/application/attempt-identities.ts:8-16`); the derivation applies to them anyway (design D4).
- Searched `docs/` and `openspec/specs/` for other statements of the rule (`unsafe-name`, `safe form`, `taskelith/<taskId>`, `mints`, `minted`, item 9 obligations): only `docs/contracts/git-workspace.md` and `openspec/specs/git-workspace-port/spec.md` state it. `docs/g3-plan.md` rows 6, 9, and 16 name no naming rule or minting obligation, so they are unchanged.
- Requirement bodies of the delta, measured: 446 (Workspace name derivation), 358 (Workspace layout per attempt), 390 (Prepare refusals), 295 (Task branch per task), and 490 (Workspace conformance suite) characters.
- The pinned OpenSpec refuses a `MODIFIED` block that drops a current scenario, so the layout requirement keeps the scenario names "Unsafe attempt identifier" and "Unsafe task at a head" with their new outcomes.
- After the coordinator's return: checked that `apps/control-plane/src/application/attempt-identities.ts:15` and `apps/control-plane/src/application/task-creation.ts:51` hash with `createHash('sha256')` of `node:crypto`; that `taskBranchName` and `workspaceDirectoryName` have no caller outside `packages/modules/workspace` (the suite and the test double), so no application or adapter needed wiring; and that the requirement bodies measure 480 (Workspace name derivation) and 486 (Workspace conformance suite) characters, the other three unchanged.
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

After review pass 2:

| Test | Before (the pass 2 suite) | After |
| --- | --- | --- |
| `workspace-conformance.test.ts`: "a provider that removes a digest-only workspace under a name with a dash fails the suite" (finding 1) | Fails: the removal of `..` reports success without deleting and the suite removes only `../attempt`, so no case fails; 39 of 40 tests of the file pass | Passes: the name derivation case reports the workspaces still listed after every removal; the package's 66 of 66 tests pass |

After the coordinator's return:

| Test | Before (without the digest check) | After |
| --- | --- | --- |
| `workspace-conformance.test.ts`: "a provider that digests identifiers with SHA-1 fails the suite" and "a provider that digests the Latin-1 bytes of identifiers fails the suite" (coordinator finding) | Fail: with the vector assertion of the case "names workspaces with SHA-256 of the identifier in lowercase hexadecimal" removed, both defective doubles, which name with their wrong digest consistently, pass every case; 41 of 43 tests of the file pass | Pass: the digest case reports the vectors; 43 of 43 pass, and the workspace package's 69 of 69 tests pass |

The domain test "the digest is SHA-256 across the padding and block boundaries", which compared the removed `sha256.ts` with `node:crypto`, is replaced by "a name keeps the first 32 characters of the injected digest".

## Checks and results

- On the working tree of `1370e7aa`, before review pass 1: `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: exit 0. The test run reported 2253 tests, 2206 passed, 0 failed, 47 skipped; total coverage 99.28 % of lines, 92.25 % of branches, and 98.93 % of functions; `sha256.js` and `workspace.js` of `@taskelith/workspace` at 100 % on all three. The OpenSpec scenario check reported 70 passed, 0 failed. It includes `npm run verify:comments`, `npm run verify:links`, and the archive of every active change in a temporary copy. `npm run openspec -- validate derive-workspace-names-from-task-ids --strict`: `Change 'derive-workspace-names-from-task-ids' is valid`. `make findings ARGS="validate"`: `Every findings file is valid: 37 file(s); every pass summary file is valid: 17 file(s).`
- On the working tree of `6690c3b7`, after the pass 1 fixes: `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: exit 0, 2254 tests, 2207 passed, 0 failed, 47 skipped; total coverage 99.28 % of lines, 92.28 % of branches, and 98.93 % of functions; the OpenSpec scenario check 70 passed, 0 failed. The strict validation of the change is valid, and `make findings ARGS="validate"` reports 37 valid findings files and 17 valid pass summary files.
- On the clean tree of `bb175e0d`, after the pass 2 fixes: `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: exit 0, 2255 tests, 2208 passed, 0 failed, 47 skipped; total coverage 99.28 % of lines, 92.27 % of branches, and 98.93 % of functions; `sha256.js` and `workspace.js` at 100 % on all three; the OpenSpec scenario check 70 passed, 0 failed. With this record's pass 2 update, the strict validation of the change is valid, `make findings ARGS="validate"` reports 37 valid findings files and 17 valid pass summary files, and `npm run verify:links` passes.
- On the working tree of `7a6f6b69`, after the coordinator's return: `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: exit 0, 2258 tests, 2211 passed, 0 failed, 47 skipped; total coverage 99.27 % of lines, 92.27 % of branches, and 98.93 % of functions; `workspace.js` of `@taskelith/workspace` at 100 % on all three, and `workspace-conformance.js` at 100 % of lines and functions and 74.81 % of branches, whose uncovered branches are the suite's existing early returns for a failed prepare; the OpenSpec scenario check 70 passed, 0 failed. With the records of the return, the strict validation of the change is valid, `make findings ARGS="validate"` reports 37 valid findings files and 17 valid pass summary files, and `npm run verify:links` passes.
- The review checklist in [design](design.md) is the exact output of `make findings ARGS="checklist --capability git-workspace-port,workspace-packages --files packages/modules/workspace/**,packages/adapters/**,docs/contracts/git-workspace.md"`.

## Coordinator finding

The coordinator returned the task before integration with one finding, Medium, category `process` (an AGENTS.md rule was not followed; the vocabulary has no architecture or dependency category), capability `git-workspace-port`, file `packages/modules/workspace/src/domain/sha256.ts`: the hand-written SHA-256 in product code violates AGENTS.md and the architecture's rule of established OSS dependencies (no home-grown cryptography), with the repository precedent of `node:crypto` outside the types-free domain. Passes 1 (reviewer A) and 2 (reviewer B) missed it. Fixed in `7a6f6b69`, to be confirmed by review pass 3; see design D5 and "Evidence: fail before, pass after".

The finding has no line in `findings.jsonl`: the finding schema requires a review pass, reviewer, and session, and `make findings ARGS="validate"` requires a summary in `passes.jsonl` for every finding's pass, so a finding that no review pass reported cannot be recorded there without a fabricated pass summary.

## Independent review

### Pass 1, reviewer A

- Reviewer: Codex CLI, `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, reviewed head `625d64fa`.
- Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- Model confirmation: the output header names model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only.
- Session: `01a17e73-ba72-7423-8d7a-bf089e1f5079`.
- Snapshot: `61e13be93a288f32a794951d39a155768995ce6ca946da25d7876b34f344525b` before and after the pass, unchanged.
- Counts: Critical 0, High 0, Medium 1, Low 1.
- Reviewer checks: the hand-written SHA-256, removed after the coordinator's return, matched `node:crypto` in 3075 comparisons; the five requirement lengths and the review checklist were confirmed; one domain test could not run in the reviewer's sandbox (`spawnSync git EPERM`), which is not a defect.

| # | Severity | Finding | Resolution | Commit |
| --- | --- | --- | --- | --- |
| 1 | Medium | The name derivation case checked the branch but not the working directory, so a misnamed or misplaced directory passed | The fixture names its data root; the case compares each working directory with `worker/workspaces/<name>/checkout` under it; defective double that percent-encodes the directory name; contract section 12 and 13, design, and a spec scenario | `6690c3b7` |
| 2 | Low | The design's example of why safe identifiers keep the digest did not collide | The example is the safe identifier `a_b-<digest of a/b>`; no other record or comment held it | `6690c3b7` |

### Pass 2, reviewer B

- Reviewer: Claude Code, `claude-opus-5-5`, effort high, reviewed head `583eb088`, run by worker Liki.
- Invocation: `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`, run in the worktree; `modelUsage` names only `claude-opus-5-5`.
- Session: `e9616865-3fb6-432d-9e1e-7131448d0cca`.
- Snapshot: `022cfb5875fbb1d18d4ec8b238bb42172e637402ecf27c586493a80306cb3827` before and after the pass, unchanged.
- Counts: Critical 0, High 0, Medium 0, Low 6.
- Pass 1 fixes: both confirmed resolved; their outcome stays `fixed`.
- Reviewer checks: the hand-written SHA-256, removed after the coordinator's return, matched `node:crypto` for every length from 0 to 1100 bytes, for 3000 random Unicode strings, and for a 5 MB input, and gave the FIPS results for `"abc"` and `""`; `git check-ref-format --branch` accepted the branches of 310 random printable ASCII identifiers and of `@`, `@{-1}`, `HEAD`, `-`, `a.lock`, `refs/heads/x`, and `~^:?*[\`, the longest name being 73 characters; the requirement lengths, the review checklist, the fail-before result, and every cited line at `93b5065b` were confirmed; the package passed 65 of 65 tests.
- A Low-only pass ends the review under governance "Low findings are fixed"; the six fixes, in `bb175e0d`, have the outcome `fixed-unreviewed`. Pass 3 runs only to confirm the coordinator finding's fix and also confirmed these six.

| # | Severity | Finding | Resolution | Commit |
| --- | --- | --- | --- | --- |
| 1 | Low | Contract section 12 says the workspaces of all the case's identifiers can be removed, but the case removed only `../attempt`, so a removal that misnames another identifier passed | The case removes `../attempt`, checks that the other three stay listed, removes them, and checks that none is listed; a defective double that looks for the digest-only workspace of `..` under a name with a leading `-` passed before and fails the case after; contract sections 12 and 13, design D7, the proposal, and a spec scenario | `bb175e0d` |
| 2 | Low | Nothing said whether the fixture's data root is canonical, so a string comparison of working directories could fail falsely where the temporary directory is a symbolic link, as `/var` on macOS | The fixture and contract section 12 require the canonical data root without symbolic links, design D7 says why, and the double's fixture resolves its temporary directory with `realpath` | `bb175e0d` |
| 3 | Low | Task 2.2 said two new defects while the proposal and design D7 said three | Task 2.2, the proposal, and design D7 say four, with the defect of finding 1 | `bb175e0d` |
| 4 | Low | The results before the pass 1 fixes had no head and sat after the later ones | Each result in "Checks and results" names its head, in time order | this record |
| 5 | Low | Design D5 did not name Web Crypto among the rejected alternatives | D5 rejects `crypto.subtle.digest` because it is asynchronous and would make `taskBranchName`, `workspaceDirectoryName`, and the suite's name constants asynchronous | `bb175e0d` |
| 6 | Low | Contract section 2 said "printable ASCII characters", though `Identifier` excludes space | The contract and the proposal say "printable ASCII characters other than space"; the design and this record already said "without whitespace" | `bb175e0d` |

### Pass 3, reviewer A

- Reviewer: Codex, `gpt-6.1-sol`, reasoning effort medium, reviewed head `7b766e43`, run by worker Liki.
- Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- Session: `01a17e99-d4c5-7141-8793-ceeb3841c750`.
- Snapshot: `45b2d55567866505d86a231ff9244530aab2dc41737f31211552311587b201e9` before and after the pass, unchanged.
- Scope: confirmation only, of the six pass 2 fixes and of the coordinator finding's fix (`git diff 7264c338..HEAD`).
- Verdicts: all six pass 2 fixes and the coordinator finding's fix resolved; `sha256.ts` is gone, `IdentifierDigest` agrees across the contract, the spec delta, the design, the code, and the tests, and no Node types reach the domain. The digest case accepted SHA-256 over UTF-8 and caught the SHA-1 and Latin-1 doubles.
- Reviewer checks: requirement lengths, record counts, citations, and gates confirmed; the TypeScript check gave no diagnostics; 17 domain tests passed and one was blocked by the read-only sandbox (`spawnSync git EPERM`).
- Counts: Critical 0, High 0, Medium 0, Low 0.

## Limitations

- Superseded: the module's own SHA-256 was removed after the coordinator's return. The conformance suite checks the injected digest with three vectors only (design D5); `node:crypto` is the established implementation behind it.
- The Git branch check runs `git check-ref-format --branch` for the test identifiers only; the claim for all identifiers rests on the name's character set (design D2).
- No Git adapter exists yet (item 16), so no real clone or push uses a derived name.
- The domain test runs the system `git`; the Linux test image (`tools/linux-cgroup/Dockerfile`) has no Git, so a manual `make linux-test-suites` run with that file would fail. Contract section 13 already requires Git in that image for item 16's Linux tests.

## Remaining gates

- Archive of the change
- Integration into dev by the coordinator (single pull request)

## Archive checks

After the second `npm run openspec -- archive derive-workspace-names-from-task-ids --yes`, following the coordinator's return:

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `npm run openspec -- validate --archived`: `change/2026-10-27-derive-workspace-names-from-task-ids` valid.
- `git diff 93b5065b -- openspec/specs` (merge base): `git-workspace-port` only, 41 insertions and 6 deletions, matching the delta (1 added, 4 modified requirements).
- `make findings ARGS="validate"`: 37 findings files and 17 pass summary files valid.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: passed.
