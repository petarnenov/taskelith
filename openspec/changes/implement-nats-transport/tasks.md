## 1. Adapter

- [x] 1.1 Create `@taskelith/nats` with the transport address, the limits, and the topology.
- [x] 1.2 Add the JetStream and outbox publishers.
- [x] 1.3 Add the validating consumers and `applyOnce`.
- [x] 1.4 Add the quarantine with capture, records, and redrive.
- [x] 1.5 Count the `@nats-io` packages as infrastructure SDKs in the boundary check.

## 2. Documentation

- [x] 2.1 Add the provisional transport row to `docs/operational-targets.md`.
- [x] 2.2 Update the dependency register and regenerate the inventory.

## 3. Verification and review

- [x] 3.1 Add unit, integration, crash, and partition tests.
- [ ] 3.2 Run `make verify` and record the results.
- [ ] 3.3 Obtain independent review (Claude Fable 5.1, medium, read-only) and record the results.
