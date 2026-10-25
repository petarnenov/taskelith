# Verification: fix-clock-independent-migration-order

## Scope and source

Assigned by the coordinator (Niki) on 2026-10-25 to the worker Ziki as the G2 maintenance task `fix-flaky-migration-test`. The symptom was a one-time macOS failure of "a fixed pending migration is checked by its new content" during `make verify`, which passed on an identical rerun. Base revision: `bb79126` on `dev`. The root cause is in the migrator, so the worker reported it to the coordinator with options before changing behavior.

**Coordinator decision (Niki, 2026-10-25): option A.** The migrator checks the order itself, inside the advisory lock, refuses with `precondition-failed` naming the first mismatch, and turns node-pg-migrate's clock-based check off. The change was renamed from `fix-flaky-migration-test` to `fix-clock-independent-migration-order` as the coordinator allowed; the branch had not been pushed. Prepared in the git worktree `../taskelith-worktrees/fix-clock-independent-migration-order`. `@taskelith/postgres` is private, so the commit type is `chore`.

## Environment

Ubuntu 24.04.5 LTS, Linux 6.8.0-147-generic, x86_64; Node.js v24.22.0 and npm 11.19.1 through nvm; Docker Engine 27.3.1, Compose v2.29.7; PostgreSQL 18.6 from `infra/services/compose.yaml` in the Compose project `ziki-flaky`.

## Root cause and reproduction

- node-pg-migrate 9.0.0 inserts each applied file with `run_on = NOW()` inside that file's transaction, and `checkOrder` compares `SELECT name FROM schema_migrations ORDER BY run_on, id` with the files by position (`node_modules/node-pg-migrate/dist/bundle/index.js`, `getRunMigrations` and `checkOrder`).
- If the server clock steps back between two file transactions, the later file sorts first, and every later run fails. A Docker Desktop virtual machine on macOS steps its clock when it corrects it. This is the most likely trigger of the macOS failure, but it was inferred, not observed on that host.
- Test isolation was ruled out. Each test creates its own database (`createTestDatabase`, named by process ID and counter), each `make verify` uses its own Compose project, and the advisory lock is per database.
- Deterministic reproduction: after a run, set the `run_on` of `1792930400000_observability-signals` to 1 ms before that of `1792930000000_resource-admission`, then run again. Without the fix, the run fails with exactly the reported message: "migration failed: Not run migration 1792930000000_resource-admission is preceding already run migration 1792930400000_observability-signals".

## Author self-check before review

- The order check runs after the checksum check, before the pending checksums are recorded, and inside the advisory lock taken at the start of `migrate`.
- An applied name without a file is refused by the existing checksum check, which names it in `details.migrations`; a new test pins that.
- The comparison follows node-pg-migrate's file order (numeric prefix, then name). A test with the file `9_older.sql` shows the difference from a string sort.
- Comments are at most two lines of at most 80 characters.
- Evidence check: no external link or evidence; the node-pg-migrate references are to the installed package.

## Checks

- `node --experimental-strip-types --test packages/adapters/postgres/test/migrations.integration.test.ts` after `npm run build`, against the `ziki-flaky` services:
  - Without the fix in `migrations.ts`, with the tests at the time (15), 12 passed and 3 failed. The failures were the clock step during an interrupted run, the out-of-order run times, and the pending file older than an applied one. The test for an applied migration without its file passed, as a pinning test.
  - With the fix, all 16 tests pass, including the numeric-prefix test added afterwards.
- `npm run openspec -- validate fix-clock-independent-migration-order --strict` passed.
- `make verify` passed: 1003 tests, 988 passed, 0 failed, 15 skipped (macOS-only tests). Coverage was 99.05% lines, 91.59% branches, and 98.64% functions. Strict OpenSpec validation: 56 passed, 0 failed.

## Independent review

Reviewer: Codex (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, as assigned by the coordinator, run from the worktree as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt and log outside the worktree.

## Limitations

- The clock step on the macOS host was not observed. The fix removes the dependence on the clock whatever caused the step.
- node-pg-migrate's 17-digit date prefixes are not used in this repository, and `byRunOrder` compares them numerically, not as dates.

## Remaining gates

- The independent review.
- Coordinator integration into `dev` and archive.
