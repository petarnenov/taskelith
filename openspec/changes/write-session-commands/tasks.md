## 1. Change

- [x] 1.1 Create the change `write-session-commands` and save the brief's checklist

## 2. Domain and service

- [x] 2.1 Add `Turn.deliveryCommands`, `ConsumedResponse.commandId`, and `RequestRecording.operation` to the session record
- [x] 2.2 Add `domain/session-commands.ts`: the due commands and the derived IDs, tests of each transition
- [x] 2.3 Add the `commands` port, the in-memory adapter, and the writer `#withDueCommands` in `SessionTimelineService`
- [x] 2.4 Enforce the operation check of a standing rule after the domain's rules; record the operation in the repeat comparison and the digest when present
- [x] 2.5 Exclude the stored command IDs from `turn-changed`

## 3. Scheduling and adapters

- [x] 3.1 Widen `WorkerCommandType` and export `appendWorkerCommand` from Scheduling
- [x] 3.2 Add `PostgresSessionCommands`: the attempt's running assignment, the protocol version, and `no-reader`
- [x] 3.3 Integration tests against PostgreSQL: the schema of each written message, a turn's end, a consumed response, the port's refusals, the outbox backstop, the crash points

## 4. Control plane

- [x] 4.1 Keep the operation on `session.request.recorded`, classify `commands.append` as a write, pin the digest with a test
- [x] 4.2 Add `@taskelith/workspace` (production) and `@taskelith/git-workspace` (development) and compose the digest, the task branch ref, and the log

## 5. Contract and specs

- [x] 5.1 Add rules 8 and 9 to `docs/contracts/session-timeline.md` section 5.2 and `unavailable` to section 2
- [x] 5.2 Spec deltas of `session-turn-model` and `observation-consumption`; strict validation and a scratch archive

## 6. Verification

- [x] 6.1 Fail-before runs of each new behavior, recorded in `verification.md`
- [x] 6.2 `make findings ARGS="route --change write-session-commands"`, committed unedited
- [x] 6.3 `make verify` on the clean tree of the branch

## Resume point

Pass 2 (role B, Claude Code claude-fable-5-1, medium, session 931ed9e8-6d4d-4b5d-a210-ce092a8642c8) reported 4 Low on 71d8b782; snapshot unchanged; its report is not yet in `passes.jsonl` or `findings.jsonl`. No pass 3. Next: record pass 2, fix the Low findings, `make verify`, `make record`, archive as the last commit, hand off to Niki, and stop (owner order). Open: Niki's answer on adding the 503 of rule 9 to `control-plane-wire-contracts.md:139`.
