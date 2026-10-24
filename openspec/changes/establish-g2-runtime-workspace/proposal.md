## Why

G2 item 9 of the [G2 work plan](../../../docs/g2-plan.md). Runtime code for the control plane and the worker needs its own workspaces, integration tests against real PostgreSQL and NATS (D8 (a)), and a boundary that keeps process-launching worker code out of API and browser bundles (architecture section 6). The owner started G2, decided D1, D2, D5, and D8 on 2026-10-25, and approved the item 1 proposals of the [G2 infrastructure evaluation](../../../docs/g2-infrastructure.md) the same day; by D14 (a) items run in dependency order.

## What Changes

- Add `apps/*` to the npm workspaces with two private packages: `apps/control-plane` (`@taskelith/control-plane`), whose only code reads its PostgreSQL and NATS endpoints from the environment, and `apps/worker` (`@taskelith/worker`), an empty root export until worker code arrives. Neither exposes a runnable command.
- Add `infra/services/compose.yaml` and `infra/services/nats-server.conf`: PostgreSQL `postgres:18.6-trixie` and NATS `nats:2.15.1-alpine` pinned by index digest, health checks, data in `tmpfs`, JetStream on, and ephemeral ports on `127.0.0.1` only. Toxiproxy is item 10.
- Add `scripts/services.sh` and `make services-up`, `make services-down`, and `make test`; `make verify` runs `make test`, which starts its own per-worktree Compose project, runs `npm test` with the service URLs, and stops that project also on failure, so parallel worktrees do not interfere. `make services-up` uses a separate project and prints the URLs. Without Docker, both fail closed.
- Run `apps/*/test/*.test.ts` in `npm test` and measure `apps/*/dist`; integration tests are named `*.integration.test.ts`. The first one checks PostgreSQL `server_version_num` 180006 with `pg@8.23.1` and NATS 2.15.1 with JetStream from the server's INFO line.
- Extend the boundary check: applications follow the product source rules, and control-plane and web source cannot import process-launching modules or worker-only code, directly or through other packages.
- Typecheck application sources and tests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-packages`: `apps/*` are workspaces; inventory links may target any declared workspace package directory.
- `trust-and-operational-foundation`: worker-only code and application boundary rules.
- `development-environment`: integration services and integration tests in `make verify`.

## Impact

`package.json`, `package-lock.json`, `tsconfig.check.json`, `Makefile`, the new `scripts/services.sh`, the new `apps/` and `infra/services/` directories, `scripts/check-boundaries.ts` and its tests, `test/workspace-packages.test.ts`, the dependency inventory (`docs/dependencies/*.json`, two license reviews), the G2 rows of `docs/dependencies.md`, architecture section 6, README, and `docs/releases.md`. `make verify` now needs Docker for the services as well as for the contract check, and takes longer. The published npm package is unchanged.
