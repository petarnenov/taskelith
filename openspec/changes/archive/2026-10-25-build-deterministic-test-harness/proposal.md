## Why

G2 work item 10 ([docs/g2-plan.md](../../../docs/g2-plan.md)). Architecture section 13 requires G2 to build a deterministic test harness, and section 14 states that "fake brokers and mocked timers alone cannot prove distributed failure behavior". The launch authorization, supervisor identity, and worker journal contracts name the tests that later items run through this harness: a wall clock wrong by more than `skew`, a suspend longer than `ttl`, a crash at each of CP1 to CP12 and before and after each of W1 to W6, a paused or killed supervisor, and partition and reconnect. Decision D8 (a) selects a Toxiproxy container for partitions, controlled through `fetch` without a client package.

## What Changes

- Add the private workspace package `@taskelith/testing` (`packages/testing`) with the harness primitives:
  - `SimulatedHost`: a settable wall clock that serves the SDLC module's `Clock` port, a suspend-inclusive deadline clock (as `CLOCK_BOOTTIME`), and a suspend-exclusive uptime clock (as `CLOCK_MONOTONIC`), advanced only by the test;
  - identifier sources: sequential identifiers and seeded version 4 UUIDs, both through the kernel's `parseIdentifier`;
  - `SeededRandom`, a recorded seed read from `TASKELITH_TEST_SEED` or drawn fresh, and a rerun hint;
  - `CrashPoints`: records the named points a run reaches and crashes at an armed occurrence, by throwing in process or by `SIGKILL` of a child armed through `TASKELITH_CRASH_POINT`;
  - `ScenarioProcess`: a child that leads its own process group, with kill, pause (`SIGSTOP`), and resume (`SIGCONT`) of the group;
  - `Toxiproxy`: a `fetch` client that addresses a configured route, disconnects it, black-holes it in both directions, heals it, and resets the server.
- Add a Toxiproxy service, `ghcr.io/shopify/toxiproxy:2.13.0` pinned by the index digest of [docs/g2-infrastructure.md](../../../docs/g2-infrastructure.md), to the G2 item 9 Compose project, with the routes `postgres` and `nats` from `infra/services/toxiproxy-routes.json`; `scripts/services.sh` exports `TASKELITH_TOXIPROXY_URL`, `TASKELITH_POSTGRES_PROXY_URL`, and `TASKELITH_NATS_PROXY_URL` like the item 9 URLs. Add an integration test that partitions PostgreSQL and NATS through it and observes the effect.
- Extend the boundary check: only tests and scripts import `@taskelith/testing`; product sources of packages and applications do not.
- Add `packages/testing` to the workspaces and to the architecture's package layout, and update the Toxiproxy row of the dependency register.

## Capabilities

### New Capabilities
- `deterministic-test-harness`: the harness primitives, their determinism, and the rule that product code does not depend on them.

### Modified Capabilities
- `development-environment`: the integration services include Toxiproxy and print its URLs.

## Impact

New private workspace package; the published `taskelith` package and CLI are unchanged. No new npm dependency is added: the harness uses Node built-ins and the kernel, and its partition test uses the `pg@8.23.1` and `@types/pg@8.23.1` pins that item 9 installed, as development dependencies. One container image, Toxiproxy, joins the item 9 Compose project. Depends on G2 item 9, `establish-g2-runtime-workspace`, for the Compose project, `scripts/services.sh`, and the integration test target. Later items (4's CP points through item 15, 5's W points through item 14, 17, 20, 21, and 24) use these primitives and name their own crash points.
