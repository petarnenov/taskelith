## Context

`LaunchOrchestrator.#forward` handles each journaled cancellation whose evidence is not recorded. Before this change it mapped either target to the intents it touches (`targetedAssignments`), called `cancel` on each intent's live `Launch`, filed `cancel` for every open execution of those intents with a written record, and recorded the evidence once no launch of those intents was live and all their executions were settled. A `Launch` runs an intent's executions one after another, so cancelling it stops whichever execution it runs and launches none again. The watch of each execution already answers a `cancellation.not-applied` report only with the cancellations naming that execution or its attempt (`#cancellationsOf`).

## Contract rule followed

- `docs/contracts/execution-wire-contracts.md:46` (section 4): "A cancellation without `executionId` targets the attempt; with it, only that execution."
- `docs/contracts/execution-wire-contracts.md:42` (section 4, command table): a cancellation is also written by "an `unauthorized-start` for that execution only".
- `docs/contracts/launch-authorization.md:91` (section 7): the authority writes "a cancellation command for that execution only, never for another execution of the attempt".

The contracts are explicit for both targets; the worker-runtime requirement, which said a cancellation "of any execution of an intent SHALL stop the intent's launch", contradicted them and is amended.

## Decisions

- **D1: a launch exposes the execution it runs.** `Launch.runs(executionId)` is true only between the start and the end of that execution's `#execute`; after the execution ends, while the launch backs off before the next one, it runs none. A cancellation of an ended execution therefore never stops the launch of its successor.
- **D2: an execution target stops a launch only while it runs that execution.** Then the launch ends as for an attempt cancellation and launches no other execution: the named execution is stopped, and nothing replaces it.
- **D3: the `cancel` file goes only to the named execution,** when it is open, has a written record, and no launch runs it. For an attempt target the rule is the same over all the intent's executions; a launch is live only while the intent's other executions are `not-started`, so it is unchanged.
- **D4: evidence follows the target.** It is recorded once no launch the cancellation stops is live and every execution it names is settled; for an execution target that is only the named execution.

## Risks / Trade-offs

- `planJournalRecovery` (`packages/modules/execution/src/domain/journal-recovery.ts`, `isCancelled`) still treats an execution-target cancellation of any execution of an intent as cancelling the intent at the next start: it plans no `continue-launch` and no `retry-authorization` for it. A live launch is not affected by this change, but after a worker restart the intent of a stray execution's cancellation is not continued. It is outside this change's scope and is reported as an open question.
- An execution-target cancellation of the execution a launch runs ends the launch, as before; the intent is not launched again by that launch.
