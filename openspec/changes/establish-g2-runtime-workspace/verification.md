# Verification: establish-g2-runtime-workspace

## Scope and source

G2 item 9 of the [G2 work plan](../../../docs/g2-plan.md), `establish-g2-runtime-workspace`, which depends on item 1. Sources: the owner's start of G2 on 2026-10-25, decisions D1 (a), D2 (a), D5 (a), and D8 (a), D14 (a) (items start in dependency order and merge without a per-item approval), and the owner's approval on 2026-10-25 of the proposals of the [G2 infrastructure evaluation](../../../docs/g2-infrastructure.md) (image variants and `pg@8.23.1` with `@types/pg@8.23.1`). Base revision: `ddef6d2` on `dev`. Prepared in a git worktree on branch `establish-g2-runtime-workspace`.

Scope: `scripts/services.sh`, `apps/control-plane` and `apps/worker`, `infra/services/`, the `Makefile` targets `test`, `services-up`, and `services-down`, `package.json`, `package-lock.json`, `tsconfig.check.json`, `scripts/check-boundaries.ts` and its tests, `test/workspace-packages.test.ts`, the dependency inventory with two license reviews, the G2 rows of `docs/dependencies.md`, architecture section 6, README, `docs/releases.md`, and this change. Excluded: Toxiproxy (item 10), NATS client packages, migrations, adapters, and images.

## Environment

macOS (Darwin 25.6.0), Node v24.22.1, npm 12.2.1, Docker 29.5.2 with Docker Compose v5.1.3.

## Author self-check

- Neither app exposes a runnable command; the worker's root export is empty, and the control plane's only code is its endpoint configuration.
- The image references in `infra/services/compose.yaml` equal the index digests in the G2 infrastructure evaluation, section 8.
- No `feat` or `fix` commit: the change touches only private packages, tooling, and documentation.

## Checks

- Before the per-run isolation fix, `make services-up` pulled both images by digest and reported both containers healthy; a raw connection to the NATS port returned `INFO` with `"version":"2.15.1"` and `"jetstream":true`, and `psql` in the container returned `server_version_num` 180006.
- With the services stopped, `node --test apps/control-plane/test/services.integration.test.ts` failed both tests with `connect ECONNREFUSED` and the remedy naming `make services-up`, `make test`, and `make verify` (the fixed-port version).
- With `DOCKER_HOST=unix:///nonexistent.sock`, `make services-up` and `make test` exited non-zero with "Docker is not available. Start Docker; make verify needs it for the integration services." before running tests.
- `make dependency-inventory` first failed on two unreviewed license coverage gaps, `pg-types@2.2.0` and `pgpass@1.0.5`; after their reviews were added it generated 695 package paths with 21 reviewed gaps.
- Per-run isolation (coordinator request before review): while a second project, `taskelith-concurrency-b-verify`, ran the integration test, slept 100 seconds, and ran it again through `scripts/services.sh run`, `make test` started its own project `taskelith-379063309-verify` on other ephemeral ports, passed 302 tests, and stopped only its own project; both runs of the second project then passed, and it removed itself (exit 0). `scripts/services.sh run taskelith-fail-verify false` exited 1 and left no container. `make services-up` printed `export TASKELITH_POSTGRES_URL=postgres://taskelith:taskelith@127.0.0.1:61514/taskelith` and `export TASKELITH_NATS_URL=nats://127.0.0.1:61515` for project `taskelith-379063309-dev`, and `make services-down` removed it. With `DOCKER_HOST=unix:///nonexistent.sock`, `make test` failed with the Docker message.
- Before the isolation fix, from a state without `coverage/`, `make verify` passed: comment length check; services started and healthy; 302 tests passed, 0 failed, including both integration tests; coverage 99.63% lines, 95.74% branches, 99.28% functions, with `apps/control-plane/dist/index.js` and `service-endpoints.js` in the report; "Every product module is in the coverage report."; services removed; contract compatibility; dependency inventory verified (695 paths, 21 reviewed gaps); strict OpenSpec validation 36 passed; archive dry run; package verification. No `taskelith-services` container remained afterwards.
- After the isolation fix, from a state without `coverage/`, `make verify` passed: 302 tests, 0 failed; coverage 99.63% lines, 95.74% branches, 99.28% functions; inventory 695 paths; strict OpenSpec validation 36 passed; archive dry run and package verification passed; no `taskelith-` container remained.

## Independent review

Independent review: pending.

## Limitations

- Checked on macOS only; Linux CI with Docker is not yet observed for the services.
- A run killed with `SIGKILL` leaves its project until the next `make test` in that worktree (design, Risks).
- The images' package inventories and scans remain open, as the dependency register states.

## Remaining gates

Independent review; integration by the coordinator.
