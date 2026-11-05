## 1. Change

- [x] 1.1 Create the change `consume-session-observations` and save the brief's checklist

## 2. Schema tables (scope 1)

- [x] 2.1 Name the two session commands and the ten session observations in `COMMAND_SCHEMAS` and `OBSERVATION_SCHEMAS`
- [x] 2.2 Replace the filtered table test with one that names the four messages of items 21 and 38 left out
- [x] 2.3 Add session builders with the derived `observationId` to `packages/adapters/nats/test/messages.ts`, and tests of each session observation, a malformed one, an item 21 observation, and a session command at a worker of version 1

## 3. Control plane protocol window (scope 2)

- [x] 3.1 Export `CONTROL_PLANE_PROTOCOL_VERSIONS`, versions 1 to 2, from `@taskelith/contracts`
- [x] 3.2 Use it at enrollment, at a capacity declaration, and at a protocol rejection of an offer
- [x] 3.3 Tests of the window, of a worker window that reaches version 2, and of windows above it

## 4. Session observations through the timeline (scopes 3, 4, 5)

- [x] 4.1 Give `ControlPlaneTransaction` the timeline stores and `ObservationService` a timeline bound per transaction
- [x] 4.2 Add `session-observation-effects.ts`: the ownership check, one report per observation type, refusals and repeats
- [x] 4.3 Register the ten effects behind the recovery epoch gate
- [x] 4.4 Unit tests: each type, `turn-invalid`, the other not-delivered reasons, acceptance unknown, refusals, repeats, ownership, the epoch gate, the log's content, and failures that are returned
- [x] 4.5 Postgres integration tests: one commit, the wire paths, ownership, the epoch gate, a store failure, the kill points before and after the three commits, and two races under SERIALIZABLE retry

## 5. Plan and specs (scope 6)

- [x] 5.1 Record the split of 13c, the promotion guard, and the lifecycle wiring of item 18 in `docs/g3-plan.md` rows 13 and 18
- [x] 5.2 Spec deltas of `observation-consumption`, `execution-wire-contracts`, and `nats-transport`; strict validation

## 6. Verification

- [x] 6.1 Fail-before runs and mutation controls
- [x] 6.2 Route, `make verify`, `make record`, and `make record-check`

## 7. Review and archive

- [ ] 7.1 Independent review
- [ ] 7.2 Archive the change
