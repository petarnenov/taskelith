## Context

G1 made verification handle workspace packages under `packages/` and left `apps/` for G2 and G3 (archived change `2026-10-24-establish-g1-workspace`). The boundary check already classified `apps/<name>/` paths as packages and had web rules, but applied the product source rules only to `packages/`. `make verify` had no running services; its only container was oasdiff. The owner decided PostgreSQL 18 (D1 (a)), NATS 2.15 (D2 (a)), Compose run by `make` (D5 (a)), and Compose-started services with integration tests in `make verify` (D8 (a)), and approved the image variants and the `pg` driver proposed by the G2 infrastructure evaluation.

## Goals / Non-Goals

Goals: the two runtime workspaces, digest-pinned services for integration tests, integration tests in the coverage gate, and a boundary that keeps worker-only process code out of API and browser bundles.

Non-goals: Toxiproxy and partitions (item 10), migrations and adapters (item 11 and later), control-plane and worker images and the minimal installation (item 23), the NATS client packages, and any runnable command.

## Decisions

### D1. Workspace pattern `apps/*`

`apps/*` follows the architecture's layout, so `apps/web` and `apps/cli` join when they are created. Both packages follow the G1 package contract unchanged. The coverage scope check, the build, and the dependency inventory already read `workspacePackageDirs`, so they include the apps without changes; `npm test` gains `apps/*/test/*.test.ts` and the coverage include `apps/*/dist/**/*.js`, and `tsconfig.check.json` the apps' sources and tests. Package verification needs no change: the tarball allowlist already excludes `apps/`.

Alternative: list `apps/control-plane` and `apps/worker` explicitly. Rejected: every later app would edit the list, as the `packages/modules/*` precedent avoids.

### D2. Minimal package content

The control plane gets one real piece: `readServiceEndpoints`, which reads `TASKELITH_POSTGRES_URL` and `TASKELITH_NATS_URL`, checks their schemes, and returns a kernel `Result` whose failure names the variable but never its value, which may hold a password. It has no defaults, so a missing setting fails at startup; the integration tests read the same variables, which `make test` sets. The worker gets an empty root export: no worker behaviour exists yet, and inventing a parser for it would duplicate the control plane's. An `export {};` module is treated as type-only by the coverage scope check.

Alternatives: a shared configuration package (premature with one consumer), or a placeholder `main` (would imply orchestration that does not exist).

### D3. Compose services, projects, and `make` targets

`infra/services/compose.yaml` pins `postgres:18.6-trixie` and `nats:2.15.1-alpine` by the index digests of the G2 infrastructure evaluation. Data lives in `tmpfs`, so nothing survives `down`. Ports are published as `127.0.0.1::5432` and `127.0.0.1::4222`: localhost only, with a host port Docker chooses free; the NATS monitoring port stays inside the container. PostgreSQL's health check uses TCP, because the image's initialization server listens only on the Unix socket. NATS mounts `nats-server.conf` with a `jetstream` block over the bundled configuration, which has JetStream off, and its health check calls `/healthz?js-enabled-only=true` with BusyBox `wget`, which is why the Alpine variant is used.

`scripts/services.sh` drives one Compose project, named by its caller. `up` checks `docker info` and fails with a message naming Docker, runs `up --detach --wait`, and removes the project when it does not become healthy. `down` runs `down --volumes --remove-orphans`. `run` starts the project, reads the ports back with `docker compose port`, runs a command with `TASKELITH_POSTGRES_URL` and `TASKELITH_NATS_URL` set, and stops the project from an exit trap, which keeps the command's exit status.

The Makefile names the projects from the `cksum` of the worktree path: `taskelith-<id>-verify` for `make test`, which `make verify` calls in place of `npm test`, and `taskelith-<id>-dev` for `make services-up` and `make services-down`, which print the URLs to export. Two `make verify` runs in different worktrees therefore use different projects, with their own containers, network, and ports, and each stops only its own project; manual services in the same worktree are untouched. Docker assigns free host ports, so the projects cannot collide on a port. Checked: a second project ran the integration test, waited while `make test` started, passed, and stopped its own project, then ran the test again and passed.

Alternatives: Testcontainers (D8 (b), not chosen by the owner); one fixed project and fixed ports (concurrent worktrees would stop each other's services, and the pre-push hook runs `make verify` in each); leaving the services running after `make verify` (state would leak between runs).

### D4. Integration tests and Docker

Integration tests are named `*.integration.test.ts` in a package's `test/` directory. They run in the same `npm test` invocation and coverage gate as every other test. They read the service URLs from the environment and, without them or without the services, fail with a message naming `make test`, `make verify`, and the URLs that `make services-up` prints; they are never skipped, because a skipped test would let the gate pass without the evidence D8 (a) requires. Without Docker, `make verify` fails closed, as it already did for the contract check.

The first integration test checks PostgreSQL with `pg@8.23.1` (`SHOW server_version_num` equals 180006) and NATS without a client package: a NATS server sends an `INFO` line on connect, and its `version` and `jetstream` fields prove the pinned version and JetStream. PostgreSQL has no equivalent without implementing its authentication, so `pg` and `@types/pg` are installed exact-pinned as development dependencies of `@taskelith/control-plane`, which owns the test. The NATS client packages wait for item 2's compatibility evidence and item 12.

Alternatives: a `docker exec psql` check (does not prove host reachability), or the NATS monitoring endpoint through `fetch` (needs a second published port and shows the same facts).

### D5. Worker-only code

Worker-only code is identified by location and by capability. Location: `apps/worker` and `packages/adapters/worker-*`, matching the architecture's `worker-process` adapter. Capability: a product package whose `src/` imports `child_process` (with or without `node:`) or `node-pty` at runtime, or imports a worker-only package at runtime, transitively. Type-only imports and tests are ignored, because they do not enter a bundle. Source of `apps/control-plane` and `apps/web` fails when it imports a process-launching module or worker-only code; the message names the chain, for example from an adapter to the OpenSpec plugin, which launches its CLI.

Applications also follow the product source rules: their `src/` may not import scripts or tests, and relative imports across any two product packages fail, not only those involving `packages/`.

Alternatives: a ban on `child_process` everywhere outside the worker, which would fail the existing `sdlc-openspec` plugin; or a direct-import rule only, which a package in between would bypass.

## Risks / Trade-offs

- `make verify` takes longer: the first pull of both images, then a few seconds to start them.
- Two concurrent `make verify` runs in the same worktree would share the verify project; they would already conflict on `dist/` and `coverage/`.
- A run killed with `SIGKILL` leaves its project running; the next `make test` in that worktree reuses and then removes it.
- The transitive rule follows only workspace imports; a third-party package that launches processes is not traced.
