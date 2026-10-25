## Context

A worker's command consumer is a durable pull consumer named after the worker on the commands stream. Enrollment ensures it before it uses the token, and `repairCommandConsumers` ensures the consumer of every active worker at each control-plane start. Revocation runs only through the administration tool's `revoke-worker`, which calls `EnrollmentService.revoke` with the `LaunchRevokingFleetRegistry` of item 17. That tool connects to the broker's system account only.

## Decisions

1. **The removal belongs to the revocation in `EnrollmentService`.** It follows the registry's `revoke`, so it runs only after the revocation and the launch invalidation of item 17 committed, and before the broker revocations are published. The registry stays a persistence boundary without broker calls.
2. **A removal failure does not fail the revocation.** The leftover consumer is harmless, because the revoked worker's broker users are revoked and no command is addressed to it. The result reports `commandConsumerRemoved`, as a rotation reports `revocationsPublished`; the fleet module has no logger, so the administration tool prints it, with a retry note, and exits with 0 because the revocation succeeded.
3. **The administration tool connects only for the removal.** Its `remove` opens a control-plane transport with the installation's broker authority, removes the consumer, and closes the connection. A failed connection is a failed removal, so it cannot block the revocation. It still never enrolls.
4. **The startup repair is bounded by recency.** Every revocation is kept, and a removal is idempotent, so a start cannot learn which consumers are left over without listing the broker's. It removes those of the `100` latest revoked workers instead, which retries a failed removal at every start while the worker is among them, and bounds the broker calls of a start. In PostgreSQL the revocation time comes from `broker_revocations`, which a revocation fills for every broker user of the worker at that time, so no migration is needed.
5. **Removal is idempotent.** `ConsumerNotFound` from JetStream is a success; any other failure is a broker failure.

## Risks

- A failed removal of a worker that falls out of the `100` latest revoked workers before a start stays. It holds no messages addressed to an active worker; G6 verifies the bound.
