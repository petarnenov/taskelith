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
- The order is node-pg-migrate's own: `getMigrationFilePaths` from `node-pg-migrate/migration`, which the runner's `loadMigrations` also uses. (Before review pass 1, the check copied the comparator; see the review.)
- Comments are at most two lines of at most 80 characters.
- Evidence check: no external link or evidence; the node-pg-migrate references are to the installed package.

## Checks

- `node --experimental-strip-types --test packages/adapters/postgres/test/migrations.integration.test.ts` after `npm run build`, against the `ziki-flaky` services:
  - With `migrations.ts` of the base `bb79126`, after review pass 1: 12 passed and 8 failed. The failures were the clock step during an interrupted run, the out-of-order run times, the pending file older than an applied one, and the order-agreement test with its four cases. The test for an applied migration without its file passed, as a pinning test.
  - With `migrations.ts` of `80e150e` (the copied comparator): 15 passed and 5 failed, all in the order-agreement test.
  - With the fix: 20 passed, 0 failed.
- `npm run openspec -- validate fix-clock-independent-migration-order --strict` passed.
- `make verify` after the pass 1 fixes passed: 1007 tests, 992 passed, 0 failed, 15 skipped (macOS-only). Coverage was 99.04% lines, 91.60% branches, and 98.64% functions. Strict OpenSpec validation: 56 passed, 0 failed.
- `make verify` before review pass 1 (the tree of `80e150e`) passed: 1003 tests, 988 passed, 0 failed, 15 skipped (macOS-only tests). Coverage was 99.05% lines, 91.59% branches, and 98.64% functions. Strict OpenSpec validation: 56 passed, 0 failed.

## Independent review

Reviewer: Codex (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, as assigned by the coordinator, run from the worktree as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt and log outside the worktree.

- **Pass 1 — session `01a1746b-2953-7122-b61e-981b7a0b7b02`, head `80e150e`.** The header confirmed the model, reasoning effort medium, and the read-only sandbox. The worker's snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) was `25b631e3…69d5fd59` before and after the pass. The reviewer's own snapshot, taken in its sandbox, matched before and after its checks. The reviewer confirmed the check under the same advisory lock, the empty and first runs, the missing-file refusal, and the determinism of the clock-step tests, and reproduced the original message through the installed `checkOrder`. Findings: 0 Critical, 1 High, 2 Medium, 2 Low.
  - High: the copied comparator's tie-break was a plain `localeCompare`, unlike node-pg-migrate's numeric, punctuation-ignoring comparison of the full names (`1_step2` after `1_step10`, `1_a-b` after `1_a`). Resolved: the check uses node-pg-migrate's `getMigrationFilePaths`, and a test covers both cases.
  - Medium: 17-digit prefixes, which node-pg-migrate reads as UTC dates, were compared as numbers. Resolved by the same change; a test covers `20200101000000000_older` after `1792929600000_applied`.
  - Medium: the reported file was the first offender in string order, not in run order (`10_older` instead of `9_older` after `12_applied`). Resolved: the first pending file in node-pg-migrate's order is named; a test covers it.
  - Low: `proposal.md` presented the clock step as the established cause of the macOS failure. Resolved: it separates the reproduced mechanism from the inferred trigger.
  - Low: task 3.1 claimed a before-fix failure for a test added after that run. Resolved: every new test was run against the base implementation, as recorded above.
- **Pass 2 — session `01a17471-ed08-7922-8126-352bf412d40b`, head `572cbb7`.** The header confirmed the model, reasoning effort medium, and the read-only sandbox. The snapshot was `54b452c1…aa9edd49` before and after the pass. The reviewer confirmed the resolution of each pass 1 finding and the agreement between the legacy subpath and the bundle, and found nothing else. Findings: 0 Critical, 0 High, 0 Medium, 0 Low. Only this record entry, task 3.3, and the remaining gates changed after the pass; `make verify` ran again in the `pre-push` hook of the handoff push.

## Limitations

- The clock step on the macOS host was not observed. The fix removes the dependence on the clock whatever caused the step.
- `node-pg-migrate/migration` is a subpath of the legacy build of the pinned node-pg-migrate 9.0.0. Its `getMigrationFilePaths` is the same function the main entry's runner uses, but an upgrade must keep that subpath.

## Remaining gates

- Coordinator integration into `dev` and archive.
