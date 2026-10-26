## Context

Item 24 needs recorded results for every scenario it runs, on several hosts and targets, and three changes (24a, 24b, 24c) produce them. The harness of item 10 already records a seed and prints a rerun hint (`seedFromEnvironment`, `rerunHint`); it has no record of a scenario's outcome. The item 23 installation runs the control plane, PostgreSQL, NATS, and a Linux worker in Docker Compose, and its smoke submits, assigns, and executes one task.

## Decisions

1. **The recorder lives in `@taskelith/testing`.** It is test infrastructure, so it belongs in the harness package, which depends only on the kernel and Node built-ins, and which product code cannot import (deterministic test harness, "Test-only harness package"). The pure part, `scenarioResult`, builds and validates a result from a run, a `RunEnvironment`, and a time; the adapters are `FileScenarioRecorder`, which appends, and `runEnvironment`, which reads the operating system and `git rev-parse HEAD`.
2. **The API.** A scenario reports a `ScenarioRun`: `scenario` (lowercase words joined by hyphens), `seed`, `target`, `outcome`, and an optional `detail`. A `ScenarioRecorder` has one method, `record(run): Promise<void>`. A recorded `ScenarioResult` adds `rerunHint`, `host` (`os.type()` and `os.release()`), `arch` (`os.arch()`, so `arm64` or `x64`), `commit`, and `recordedAt`. `target` is `harness-composition` or `compose-installation`; `outcome` is `passed` or `failed`. An expected product outcome, such as an `uncertain` attempt, is an assertion of the scenario and may appear in `detail`, not an outcome of the record.
3. **JSON Lines, opted in by the environment.** `scenarioRecorderFromEnvironment()` returns a file recorder when `TASKELITH_SCENARIO_RESULTS` names a file, resolved against the working directory, and otherwise `discardingScenarioRecorder`, which validates the run and writes nothing. A scenario therefore records the same way under `make verify` and in an evidence run, and only an evidence run, which sets the variable to `openspec/changes/<change>/results.jsonl`, changes the tree. Each result is one `appendFile` of one line, so several test processes can record into one file. JSON Lines is chosen over a Markdown table because appending needs no parsing and each line stays machine-readable; `verification.md` summarizes the results in prose or a table.
4. **The commit is `HEAD`, without a dirty marker.** An evidence run appends to the change directory, so the tree is dirty after the first record; a marker would carry no information. The results are committed in the same change, after the commit they name.
5. **Adoption by 24b and 24c.** Each scenario test calls `scenarioRecorderFromEnvironment()` once and `record` after its assertions, with the seed it used and its target, and records `failed` before it rethrows a failure. Each change records into its own directory, so the archive keeps the results with the change that produced them.
6. **Crash windows run through the harness on test-side compositions.** Decided by the owner's delegate on behalf of the owner (away run `20261026T145841Z-opencode-11793`): the process-launch crash windows of 24b run on test-side compositions of the real worker modules against the `make` services, with armed crash points and `SIGKILL`, and count as runs "through the harness" with target `harness-composition`. The composed worker has no crash seam: `apps/worker/src/execution-supervision.ts:75` hard-wires `crashPoint: () => undefined`, and product changes are out of scope.
7. **Compose scenarios use the item 23 installation.** The happy path, the worker disk loss, and the untimed `SIGKILL` run against a throwaway Compose project, like the item 23 smoke, and record target `compose-installation`. The untimed `SIGKILL` is not a crash window: it hits whatever the worker is doing and checks only that reconciliation ends consistently.

## Risks and limitations

- `host` and `arch` describe the host that runs the scenario. For `compose-installation` on Docker Desktop, the Linux worker runs in a virtual machine of the same architecture; the record does not name the engine version, which `verification.md` states.
- The record does not prove that the tree at `commit` is the one that ran; `verification.md` states the revision of each evidence run.

## Follow-ups

- Multi-arch tooling for the Linux cgroup checks (`make verify-linux-cgroup`): the Linux supervisor crash windows of 24b run on the x86_64 iMac.
- No operator cancel API, and no Toxiproxy or second worker in the Compose installation: these belong to 24c.
