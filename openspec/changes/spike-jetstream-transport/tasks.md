## 1. Spike

- [x] 1.1 Add the NATS clients as exact-pinned development dependencies and regenerate the dependency inventory.
- [x] 1.2 Extend `infra/services/nats-server.conf` with the spike users and `no_auth_user`.
- [x] 1.3 Add the spike integration tests and their fixture.

## 2. Record

- [x] 2.1 Write `docs/g2-jetstream-spike.md` and update the register rows.
- [x] 2.2 Add the `jetstream-transport-spike` capability.

## 3. Verification and review

- [x] 3.1 Run `make verify` and `openspec validate --strict`.
- [ ] 3.2 Obtain the independent review and record the results.
