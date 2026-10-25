## Context

`migrate` takes a PostgreSQL advisory lock and checks applied files against their recorded checksums. It then records the checksums of pending files and runs node-pg-migrate with one transaction per file. node-pg-migrate's `checkOrder` reads `SELECT name FROM schema_migrations ORDER BY run_on, id` and compares it, position by position, with the sorted files (`dist/bundle/index.js`, `getRunMigrations` and `checkOrder`). `run_on` is `NOW()` inside each file's transaction, so the comparison depends on the server clock.

## Goals / Non-Goals

Keep the guarantee that no pending file runs before an applied one, without using the clock. Do not change the checksum checks, the transaction per file, or the advisory lock.

## Decisions

- **Coordinator decision (Niki, 2026-10-25): option A.** The migrator checks the order itself and turns node-pg-migrate's check off. The rejected options were a test-only change, which cannot control the server clock and leaves the product defect, and turning the check off without a replacement, which loses the guarantee.
- **What is compared.** The set of applied names is compared with the ordered file names, not with a recorded order. The first pending file in that order is refused when an applied file comes after it. The order of the applied rows, whether by `run_on` or by `id`, does not matter: applied files are never re-run, and pending files run in file order. This also repairs a database whose `run_on` values are already out of order.
- **Ordering.** The files are ordered by `getMigrationFilePaths` from `node-pg-migrate/migration`, which `loadMigrations` in the runner also uses (`compareMigrationFileNames`: the numeric prefix, with 17-digit prefixes read as UTC dates, then a numeric, punctuation-ignoring locale comparison). Copying that comparator would drift from the library; a plain string sort already disagrees when prefixes differ in length. The import is a subpath of the existing dependency, not a new one.
- **Position.** The check runs after the checksum check and before the pending checksums are recorded, inside the advisory lock held for the whole run. A concurrent migrator therefore cannot change `schema_migrations` between the check and the run. An applied name without a file is refused earlier by the checksum check, which names it.
- **Error.** The refusal is `precondition-failed` with `details.migrations` naming the first offending file in that order, like the checksum refusals. Before this change, node-pg-migrate's own order check surfaced as `internal`.

## Risks / Trade-offs

A database that node-pg-migrate's order check would have refused only because of its `run_on` values now migrates. That is the intended effect.
