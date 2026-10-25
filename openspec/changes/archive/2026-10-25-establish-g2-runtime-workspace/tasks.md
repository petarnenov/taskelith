## 1. Runtime workspace

- [x] 1.1 Declare `apps/*` workspaces with `@taskelith/control-plane` and `@taskelith/worker`, built, typechecked, tested, and measured like other packages.
- [x] 1.2 Add the service endpoint configuration of the control plane with unit tests.

## 2. Integration services and tests

- [x] 2.1 Add the digest-pinned Compose services with JetStream configuration and the `services-up`, `services-down`, and `test` targets; run `make test` from `make verify`.
- [x] 2.2 Add the integration test convention and a test of the pinned PostgreSQL and NATS versions; install `pg` and `@types/pg` exact-pinned and regenerate the dependency inventory.

## 3. Boundaries

- [x] 3.1 Apply product source rules to applications and add the worker-only reach rule, with tests.

## 4. Documentation and verification

- [x] 4.1 Update architecture section 6, README, `docs/releases.md`, and the dependency register.
- [x] 4.2 Run `make verify` and the fail-closed checks.
- [x] 4.3 Obtain independent review and record results.
