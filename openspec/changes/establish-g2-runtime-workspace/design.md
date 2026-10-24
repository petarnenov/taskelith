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

The control plane gets one real piece: `readServiceEndpoints`, which reads `TASKELITH_POSTGRES_URL` and `TASKELITH_NATS_URL`, checks their schemes, and returns a kernel `Result` whose failure names the variable but never its value, which may hold a password. It has no defaults, so a missing setting fails at startup; the integration test helper supplies the Compose endpoints when the variables are unset. The worker gets an empty root export: no worker behaviour exists yet, and inventing a parser for it would duplicate the control plane's. An `export {};` module is treated as type-only by the coverage scope check.

Alternatives: a shared configuration package (premature with one consumer), or a placeholder `main` (would imply orchestration that does not exist).

### D3. Compose services and `make` targets

`infra/services/compose.yaml` pins `postgres:18.6-trixie` and `nats:2.15.1-alpine` by the index digests of the G2 infrastructure evaluation, with the fixed project name `taskelith-services`. Data lives in `tmpfs`, so nothing survives `down`. Ports bind to `127.0.0.1` on 55432 and 54222, away from the default ports a developer's own servers may use; the NATS monitoring port stays inside the container. PostgreSQL's health check uses TCP, because the image's initialization server listens only on the Unix socket. NATS mounts `nats-server.conf` with a `jetstream` block over the bundled configuration, which has JetStream off, and its health check calls `/healthz?js-enabled-only=true` with BusyBox `wget`, which is why the Alpine variant is used.

`make services-up` checks `docker info` first and fails with a message naming Docker, then runs `up --detach --wait`, removing the services when they do not become healthy. `make services-down` runs `down --volumes --remove-orphans`. `make test` runs `npm test` between them and keeps the test exit status. `make verify` calls `make test` in place of `npm test`.

Alternatives: Testcontainers (D8 (b), not chosen by the owner); leaving the services running after `make verify` (faster reruns, but state would leak between runs).

### D4. Integration tests and Docker

Integration tests are named `*.integration.test.ts` in a package's `test/` directory. They run in the same `npm test` invocation and coverage gate as every other test. Without the services they fail with a message naming `make services-up`, `make test`, and `make verify`; they are never skipped, because a skipped test would let the gate pass without the evidence D8 (a) requires. `npm test` alone therefore needs `make services-up` first. Without Docker, `make verify` fails closed, as it already did for the contract check.

The first integration test checks PostgreSQL with `pg@8.23.1` (`SHOW server_version_num` equals 180006) and NATS without a client package: a NATS server sends an `INFO` line on connect, and its `version` and `jetstream` fields prove the pinned version and JetStream. PostgreSQL has no equivalent without implementing its authentication, so `pg` and `@types/pg` are installed exact-pinned as development dependencies of `@taskelith/control-plane`, which owns the test. The NATS client packages wait for item 2's compatibility evidence and item 12.

Alternatives: a `docker exec psql` check (does not prove host reachability), or the NATS monitoring endpoint through `fetch` (needs a second published port and shows the same facts).

### D5. Worker-only code

Worker-only code is identified by location and by capability. Location: `apps/worker` and `packages/adapters/worker-*`, matching the architecture's `worker-process` adapter. Capability: a product package whose `src/` imports `child_process` (with or without `node:`) or `node-pty` at runtime, or imports a worker-only package at runtime, transitively. Type-only imports and tests are ignored, because they do not enter a bundle. Source of `apps/control-plane` and `apps/web` fails when it imports a process-launching module or worker-only code; the message names the chain, for example from an adapter to the OpenSpec plugin, which launches its CLI.

Applications also follow the product source rules: their `src/` may not import scripts or tests, and relative imports across any two product packages fail, not only those involving `packages/`.

Alternatives: a ban on `child_process` everywhere outside the worker, which would fail the existing `sdlc-openspec` plugin; or a direct-import rule only, which a package in between would bypass.

## Risks / Trade-offs

- `make verify` takes longer: the first pull of both images, then a few seconds to start them.
- The fixed project name and ports make two concurrent `make verify` runs on one machine, such as in two worktrees, share the services: the run that finishes first stops them under the other, and its tests fail. Running them one at a time avoids it; a per-worktree project name and ports are a possible follow-up.
- `make verify` stops services that a developer started with `make services-up`.
- The transitive rule follows only workspace imports; a third-party package that launches processes is not traced.
