## Context

The placement queue ranks each project's waiting tasks by `placement_waiting_since`, then by task id (`packages/adapters/postgres/src/capacity-repositories.ts:162-174`), and the placement service orders the read again with `fairWaitingOrder`, which ranks within a project by the same waiting time (`packages/modules/scheduling/src/domain/fair-order.ts:58-72`, `apps/control-plane/src/application/placement-service.ts:89`). The waiting time is the submit transaction's database `now()`, so it follows the database server's wall clock, not the submit order.

## Goals / Non-Goals

**Goals:** make the capacity decline test independent of the database clock; state in the spec that the stored waiting stamp, not the submit order, decides the order.

**Non-Goals:** changing the product's ordering, the stamp's source, or any timeout, retry, or tolerance.

## Decisions

- Pin the stamps in the test rather than change the product. Ordering by the stored stamp is the requirement; a clock step that reorders the stamps is a correct input the test did not control. Alternative rejected: ordering by a submit sequence, which would change the contract.
- Pin all 51 stamps, one second apart in submit order, because the test's expectation names `task-a01` as the oldest of 50 and `task-b` as newer than all of them.
- Add a scenario to "Waiting placements" instead of `skip_specs` (coordinator decision): it makes the clarified contract explicit. The existing mirror test at `apps/control-plane/test/placement.integration.test.ts:316` already protects it, so no new test is needed.

## Risks / Trade-offs

- The pinned test no longer uses the stamps the submits write; the other tests of the file and the capacity conformance suite still do.
