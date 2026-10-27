## Context

The conformance case "lets one of two concurrent hand-offs through where executions share a separate account" (`packages/modules/workspace/src/ports/workspace-conformance.ts:580-597`) prepares two workspaces, starts `provider.handOff(FIRST)` and `provider.handOff(SECOND)` together with `Promise.all` (line 589), and expects exactly one success and one refusal with reason `other-workspace-handed-off`. The test file runs every case against the test double `TempDirWorkspaces` with each defect and expects the defect `racesHandOff` to fail exactly this case (`packages/modules/workspace/test/workspace-conformance.test.ts:72` and `:74-78`).

Before this change, at `b87abe75`, the double's `handOff` (`packages/modules/workspace/test/temp-dir-workspaces.ts:275-281`) ran the conforming hand-off inside a per-root chain (`inHandOffChain`, lines 174-186), so a hand-off checks for another hand-off record and writes its own before the next one checks. With `racesHandOff` it called `handOffAlone` (lines 283-290) outside the chain, and nothing else ordered the two hand-offs: each awaits `checkoutOf`, then `handedOffElsewhere` (lines 292-297, a directory listing and `exists` calls), then writes its record.

## Diagnosis

- Failing assertion, observed under load: `Expected values to be strictly deep-equal`, actual `[]`, expected `['lets one of two concurrent hand-offs through where executions share a separate account']`, at `workspace-conformance.test.ts:76`. The racy double passed the case it must fail.
- Cause: the defect assumed that the two unsynchronized hand-offs interleave their file system steps so that both check before either writes. The event loop and the file system thread pool do not guarantee that order. When one hand-off writes its record before the other checks, the second is refused, exactly one succeeds, and the case correctly reports no problem. Host load makes that order more likely.
- Deterministic reproduction without load: a 20 ms delay before the check of `attempt-2` in the old double, in a scratch copy, makes the test fail every time with the same assertion.
- Not a product gap: the case never fails a provider that serializes its hand-offs, as the conforming double shows, and it fails every provider whose two concurrent hand-offs both succeed (mutation checks M1 and M2 in `verification.md`). Like any black-box concurrency check, it detects a racy adapter only when the race occurs during the run; that limitation is recorded, not changed.

## Goals / Non-Goals

Make the defect test deterministic without sleeps or wider bounds, and keep its intent: a provider that lets two concurrent hand-offs both succeed fails the suite. Do not change the conformance case, the port, or the requirement.

## Decisions

- **A check barrier forces the race.** `CheckBarrier` (`temp-dir-workspaces.ts:188-208`) counts the hand-offs in flight. With `racesHandOff`, `handOff` (lines 298-303) calls `racingHandOff` (lines 310-321), which enters the barrier synchronously, before its first `await`, so both calls of `Promise.all` are counted before either proceeds. After its check a hand-off waits in `arrive` until every hand-off in flight has checked, and only then writes. Both hand-offs therefore see no other record and both succeed, whatever the scheduling. A hand-off whose `checkoutOf` fails leaves the barrier without waiting.
- **Sequential hand-offs do not wait.** A lone hand-off is the only one in flight, so `arrive` resolves at once and the other cases keep passing with this defect, as the test expects.
- **The conforming path is unchanged** apart from extracted helpers: it still uses the per-root chain; `markHandedOff` and `otherWorkspaceHandedOff` (lines 529-538) and `mustWait` (lines 323-325) are shared by both paths.

## Review checklist

Output of `make findings ARGS="checklist --capability git-workspace-port --files packages/modules/workspace/**"`:

```text
Review checklist (capabilities git-workspace-port; files packages/modules/workspace/**), most frequent finding categories first:
1. spec-wording (11): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "The contract does not fix the account and cgroup under which the Git processes of workspace operations run"
2. contract-drift (8): Code, a contract document, and its specification disagree. Example: "The safe name rule rejects client-chosen G2 task identifiers, so such a task never gets a workspace"
3. error-handling (5): A failure is swallowed, misreported, or leaves inconsistent state. Example: "The double's reclaim opened every non-directory as a file, so a hard-linked named pipe blocked it forever"
4. concurrency-race (3): Concurrent operations can interleave into a wrong state or result. Example: "The double checked for another hand-off record and wrote its own in separate steps, so two concurrent hand-offs both succeeded"
5. docs (2): Documentation is missing, wrong, or out of date with the change. Example: "The contract said identifiers are printable ASCII characters, though Identifier excludes space"
6. redaction (1): A secret or private value can leak into output, logs, or records. Example: "The promise that a secret is never logged relies on redaction that G2 lacks"
7. stale-citation (1): A cited file line, commit, or record no longer matches its target. Example: "The contract cites the wrong journal section and says the worker is the only writer under its directory"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (50): A recorded result, count, or claim differs from what the checks show.
2. docs (41): Documentation is missing, wrong, or out of date with the change.
3. spec-wording (23): A requirement or scenario is ambiguous, untestable, or inaccurate.
4. stale-citation (21): A cited file line, commit, or record no longer matches its target.
5. process (9): A protocol, governance, or review rule was not followed.
6. contract-drift (7): Code, a contract document, and its specification disagree.
7. scope (5): The change does more or less than its assigned scope.
```

The record-quality examples are omitted above. Applied: concurrency-race is the subject of the change and the barrier keeps the earlier fix, the chain, on the conforming path; error-handling covers the early `leave` on a missing workspace; stale-citation and evidence-mismatch are checked against the cited lines and the command output in `verification.md`.

## Risks / Trade-offs

The defect test no longer depends on scheduling, but it proves only that the case catches a race that happens during the run; the conformance case itself keeps its probabilistic detection of a real adapter's race.
