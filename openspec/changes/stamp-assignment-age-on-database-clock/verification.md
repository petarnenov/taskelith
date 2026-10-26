# Verification

Date: 2026-10-27. The author's verification is recorded below; the independent review is pending.

## Scope and source

A G2 follow-up found during B6 `stabilize-observability-lag-test`: the snapshot claimed the database clock stamps every row it ages, but `assignments.changed_at` is a caller-supplied time. Coordinator Niki first chose option (a), a database-stamped column; that implementation found the premise only partly right (placement already writes `changed_at` from `tx.now()`), and Niki then chose option B: keep the schema, state the convention, and test it. Worker session Maki developed it in a briefed and checked subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)), in worktree `taskelith-worktrees/stamp-assignment-age-on-database-clock` on branch `stamp-assignment-age-on-database-clock`. The option A commits are kept on local branch `stamp-assignment-age-option-a`.
- **Base revision:** `b0d018a` on `dev`.
- **Revision verified:** `2520ab2` (the comment, the test, and these records before this file).
- **Scope:** the snapshot comment, a placement test, and the `execution-observability` delta.
- **Out of scope:** schema and migrations, the acceptance writer of `changedAt` (`apps/control-plane/src/application/observation-effects.ts:78`, a coordinator follow-up), and the outbox stamp.

## Author self-check

- The comment names the real stamp of each age; the wrong contract section reference is gone.
- `snapshotOf` already clamps each age at zero (`Math.max(0, …)`), so the later-stamp scenario describes existing code, covered by `a clock that stamped a row in the future never reads as a negative age`.
- Every new comment is at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Commit types are `chore` and `docs`; only a comment and a test of the private `@taskelith/postgres` change, and no published package changes.

## Evidence check

- **Fails when placement uses the application clock.** Line 208 of `packages/modules/scheduling/src/application/capacity-operations.ts` was temporarily changed from `const at = await tx.now();` to `const at = new Date().toISOString() as Instant;`. After `npm run build`, `bash scripts/services.sh run taskelith-stamp-age node --experimental-strip-types --test --test-reporter=spec packages/adapters/postgres/test/resource-admission.integration.test.ts` gave 23 tests, 22 pass, 1 fail: `a placement stamps the assignment change time on the database clock` failed with `AssertionError [ERR_ASSERTION]: 21600.000195`, the six-hour offset. The file was restored with `git checkout` and rebuilt; nothing of this was committed.
- **Passes on the new code.** The same command at `65fbc84`: 23 tests, 23 pass, 0 fail.
- **Determinism.** The test compares two stamps of one transaction against a one-second bound while the fault is six hours; no retry, sleep, or widened timeout.
- **Links.** The change adds no external link; every link is relative to the repository.

## Checks

- `npm run openspec -- validate stamp-assignment-age-on-database-clock --strict`: valid.
- `make verify` at `2520ab2`: exit 0; 1937 tests, 1935 pass, 0 fail, 2 skipped; coverage lines 99.29%, branches 92.10%, functions 99.04%; contract compatibility, dependency inventory, `validate --all --strict` (70 passed), archive dry run, and package verification passed. No flaky rerun was needed. This file is the only later change.

Environment: macOS (Darwin 25.6.0), Node from `.nvmrc`, Docker test services started by `make verify` and `scripts/services.sh`.

## Independent review

Pending.

## Limitations

- The offered age is on the database clock by placement's convention, guarded by a test, not by the schema; a new writer of offered rows with another clock would skew it (design, rejected alternative).
- Each age is a wall-clock difference on the database host: a clock step between stamp and read shifts it by the step, and a later stamp reads zero.

## Remaining gates

- Independent review (pending).
- Integration into dev by the coordinator (single pull request).
