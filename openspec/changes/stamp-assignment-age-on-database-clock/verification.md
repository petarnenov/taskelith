# Verification

Date: 2026-10-27. The author's verification and review pass 1 are recorded below; pass 2 is pending.

## Scope and source

A G2 follow-up found during B6 `stabilize-observability-lag-test`: the snapshot claimed the database clock stamps every row it ages, but `assignments.changed_at` is a caller-supplied time. Coordinator Niki first chose option (a), a database-stamped column; that implementation found the premise only partly right (placement already writes `changed_at` from `tx.now()`), and Niki then chose option B: keep the schema, state the convention, and test it. Worker session Maki developed it in a briefed and checked subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)), in worktree `taskelith-worktrees/stamp-assignment-age-on-database-clock` on branch `stamp-assignment-age-on-database-clock`. The option A commits are kept on local branch `stamp-assignment-age-option-a`.
- **Base revision:** `b0d018a` on `dev`.
- **Revision verified:** `2520ab2` (the comment, the test, and these records before this file); after review pass 1, the tree of the commit that records it.
- **Scope:** the snapshot comment, a placement test, and the `execution-observability` delta.
- **Out of scope:** schema and migrations, the acceptance writer of `changedAt` (`apps/control-plane/src/application/observation-effects.ts:78`, a coordinator follow-up), and the outbox stamp.

## Author self-check

- The comment names the real stamp of each age; the wrong contract section reference is gone.
- `snapshotOf` already clamps each age at zero (`Math.max(0, …)`), so the later-stamp scenario describes existing code, covered by `a clock that stamped a row in the future never reads as a negative age`.
- Every new comment is at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Commit types are `chore` and `docs`; only a comment and a test of the private `@taskelith/postgres` change, and no published package changes.

## Evidence check

- **Fails when placement uses the application clock.** Line 208 of `packages/modules/scheduling/src/application/capacity-operations.ts` was temporarily changed from `const at = await tx.now();` to `const at = new Date().toISOString() as Instant;`. After `npm run build`, `bash scripts/services.sh run taskelith-stamp-age node --experimental-strip-types --test --test-reporter=spec packages/adapters/postgres/test/resource-admission.integration.test.ts` gave 23 tests, 22 pass, 1 fail: `a placement stamps the assignment change time on the database clock` failed with `AssertionError [ERR_ASSERTION]: 21600.000195`, the six-hour offset. The file was restored with `git checkout` and rebuilt; nothing of this was committed.
- **Passes on the new code.** The same command at `65fbc84`: 23 tests, 23 pass, 0 fail. After the pass 1 fixes (`a2ecb71`), the same command over `resource-admission.integration.test.ts` and `observability.integration.test.ts`: 31 tests, 31 pass, 0 fail, including the extended future-stamp test.
- **Determinism.** The test compares two stamps of one transaction against a one-second bound while the fault is six hours; no retry, sleep, or widened timeout.
- **Links.** The change adds no external link; every link is relative to the repository.

## Checks

- `npm run openspec -- validate stamp-assignment-age-on-database-clock --strict`: valid.
- `make verify` at `2520ab2`: exit 0; 1937 tests, 1935 pass, 0 fail, 2 skipped; coverage lines 99.29%, branches 92.10%, functions 99.04%; contract compatibility, dependency inventory, `validate --all --strict` (70 passed), archive dry run, and package verification passed. No flaky rerun was needed. This file is the only later change.

Environment: macOS (Darwin 25.6.0), Node from `.nvmrc`, Docker test services started by `make verify` and `scripts/services.sh`.

## Independent review

### Review pass 1

- **Reviewer:** OpenCode CLI, model `opencode-go/qwen3.8-max`, variant `medium`, `reviewer` agent (read-only), assigned and run by the coordinating session from the worktree.
- **Invocation:** the kimi-k3.1-pro row of [the agent task protocol](../../../docs/agent-task-protocol.md) with the coordinator-assigned model: `opencode run --standalone --agent reviewer -m 'opencode-go/qwen3.8-max#medium' --format json --title stamp-assignment-age-on-database-clock "$(cat <prompt-file>)" < /dev/null > <log>`.
- **Revision:** `848b5c3`, diff `b0d018a..848b5c3`.
- **Model confirmation:** the stored assistant messages record provider `opencode-go`, model `qwen3.8-max`, variant `medium`; session `ses_e859acd6fffeoT7mVnXasEPE4I`.
- **Snapshot:** `c2f4f735de3e2b419a960307e5d80caf93d600c0217b2c760470d7684ba797ea` before and after; unchanged.
- **Limits:** the reviewer could not run npm (denied by its agent) and verified statically.
- **Findings:** 0 Critical, 0 High, 1 Medium, 4 Low; all fixed in `a2ecb71` and `c88177d`, to be confirmed by pass 2.
  1. **M1:** "written by the database or by placement from its clock" read as placement's application clock. **Fixed:** the requirement says the stamp comes from the database default or, for an assignment, placement's `tx.now()` (498 characters); the proposal says the database clock of placement's transaction.
  2. **L2:** the reader and writer list was incomplete and unscoped. **Fixed:** it is scoped to product code, excludes test SQL, and names the backfill in `1792930400000_observability-signals.sql:16`.
  3. **L3:** acceptance's production caller was not named. **Fixed:** `recordPosition` (`apps/control-plane/src/application/observation-service.ts:186`) passes `tx.now()`, verified in the source; the follow-up is the unguarded seam, not a current skew.
  4. **L4:** the future-stamp clamp was tested only for the outbox. **Fixed:** the test also sets an offered assignment's `changed_at` an hour ahead and asserts both ages are zero; the scenario "A stamp later than the read" covers both ages.
  5. **L5:** the placement test used `row!` without checking the row exists. **Fixed:** `assert.ok(row, 'the assignment and its offer row exist')` narrows the type, and the non-null assertions are gone.

## Limitations

- The offered age is on the database clock by placement's convention, guarded by a test, not by the schema; a new writer of offered rows with another clock would skew it (design, rejected alternative).
- Each age is a wall-clock difference on the database host: a clock step between stamp and read shifts it by the step, and a later stamp reads zero.

## Remaining gates

- Independent review (pass 2 pending).
- Integration into dev by the coordinator (single pull request).
