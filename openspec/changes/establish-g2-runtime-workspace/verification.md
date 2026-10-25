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
- Pass 1 fixes: `scripts/services.sh run taskelith-sig-verify sleep 300`, sent `SIGTERM` after the services were healthy, exited 143, removed its project, and left no `sleep` process; `run ... sh -c 'exit 7'` exited 7; `services.sh` without arguments printed the usage and exited 2; with an unreachable `DOCKER_HOST`, `run` failed with the Docker message.
- After the pass 1 fixes, on the merge of `origin/dev` (`ac55cb5`), from a state without `coverage/`: `make doctor` reported every check passed, including Docker; `make verify` passed with 303 tests, 0 failed; coverage 99.63% lines, 95.74% branches, 99.28% functions; inventory 695 paths, 21 reviewed gaps; strict OpenSpec validation 38 passed; archive dry run and package verification passed; no `taskelith-` container remained.
- Pass 2 fixes: `run taskelith-sig2-verify` with a command that takes 3 seconds to stop on `TERM` received `TERM`, then `INT` and `TERM` again; the command printed its stop message before the containers stopped, the project was removed, and the run exited 143. `run` without a command printed the usage and exited 2; `run ... sh -c 'exit 7'` exited 7.
- After the pass 2 fixes, from a state without `coverage/`: `make verify` passed with 303 tests, 0 failed; coverage 99.63% lines, 95.74% branches, 99.28% functions; inventory 695 paths, 21 reviewed gaps; strict OpenSpec validation 38 passed; archive dry run and package verification passed; no `taskelith-` container remained.

## Independent review

Assigned reviewer: Claude Fable 5.1, medium effort, read-only, run by the coordinator. The model was confirmed, and the worktree snapshots before and after the pass were equal.

- **Pass 1** (session `659eabe8-b9ed-47f2-a861-9f38c31b0f63`). Findings: 0 Critical, 0 High, 2 Medium, 10 Low. All accepted and resolved; the resolutions await the next pass:
  1. Medium: a cancelled `make test` could leave its project running. `run` now runs the command in the background, waits for it, and turns `INT`, `TERM`, and `HUP` into exits 130 and 143 that stop the command, so the exit trap removes the project; only `SIGKILL` leaves it.
  2. Medium: `make doctor` did not check Docker. `scripts/environment-checks.ts` adds a check of `docker info` and `docker compose version` with a remedy, with tests, and a MODIFIED delta of "Environment check" names Docker; README says setup does not install Docker.
  3. Low: stale license gap counts. `docs/dependencies.md` and `docs/dependency-inventory.md` now state 21 reviewed paths and point to `license-reviews.json`.
  4. Low: imports whose named bindings all carry an inline `type` counted as runtime imports. The worker-only rule now treats them as erased, with a test; the plugin SDK rule keeps the `import type` form its requirement names.
  5. Low: the launcher list missed common libraries. `execa`, `cross-spawn`, `shelljs`, and `zx` were added, and the spec delta calls the set a named list.
  6. Low: missing boundary tests. Added for `export { s } from '@taskelith/worker'`, `require('child_process')`, inline-type imports and re-exports (accepted), and a mixed inline-type import (rejected).
  7. Low: the NATS INFO reader could hang or throw. It reads only the first line, rejects malformed JSON and a close before the line, and settles once.
  8. Low: `services.sh` without arguments failed obscurely. It prints a usage message and exits 2.
  9. Low: missing ports were not detected and URLs relied on word splitting. Each `compose port` result is checked with a clear message, and the URLs are exported.
  10. Low: the "Application boundaries" requirement duplicated the existing boundary requirement. It is removed; a MODIFIED "Automated hexagonal boundary and TypeScript checks" carries the full text with an added scenario.
  11. Low: design decision labels clashed with the owner's D1–D14. Renamed to Decision 1 to 5.
  12. Low: a test name did not describe its assertion. Renamed to "the repository declares the control plane and worker apps as workspace packages that follow the contract".
- **Pass 2** (session `fd868aad-db75-4b51-865a-b5ab2fd88920`; model confirmed, snapshots equal). All 12 pass-1 findings confirmed resolved. Findings: 0 Critical, 0 High, 1 Medium, 7 Low. All accepted and resolved; the resolutions await the next pass:
  1. Medium: a second signal could interrupt the teardown. The teardown and the command stop ignore `INT`, `TERM`, and `HUP`.
  2. Low: a failed `up` inside `run` tore down twice. `up()` no longer cleans up; the `up` action calls `up || { down; exit 1; }`, and `run` relies on its exit trap.
  3. Low: `run` without a command was accepted. It prints the usage and exits 2.
  4. Low: teardown could start while the tests still ran. On a signal, `run` kills the command and waits for it before exiting.
  5. Low: the inline-type rule silently assumed no `verbatimModuleSyntax`. Recorded in design Decision 5 and the "Types and tests" scenario, with the reason for not enforcing it in the package contract.
  6. Low: integration-flow still named `npm test` in `make verify`. A MODIFIED "Single definition of the checks" (430 characters) names `make test`, with the scenario "Tests run through make test".
  7. Low: the Docker scenario implied that `make test` fails because of `make services-up`. Reworded.
  8. Low: `make test` used the shell's Node.js. It runs through `with-pinned-node.sh use`, which does not switch again under `make verify`.

## Limitations

- Checked on macOS only; Linux CI with Docker is not yet observed for the services.
- Only a run killed with `SIGKILL` leaves its project until the next `make test` in that worktree; repeated signals during teardown are ignored (design, Risks).
- The images' package inventories and scans remain open, as the dependency register states.

## Remaining gates

Independent review; integration by the coordinator.
