## Context

`openspec archive <change> --yes` applies a change's deltas to the main specs and moves the change under `openspec/changes/archive/`. Strict validation of a change checks only its deltas, so problems that appear only in the applied main spec, such as the placeholder Purpose of a new capability or a requirement over the length limit, surface after merge, when the coordinator archives.

## Goals / Non-Goals

Goals: fail `make verify` on such a change before handoff, deterministically, offline, and without changing the repository. Non-goals: fixing the change automatically, or archiving changes in the repository.

## Decisions

- **Archive in a copy.** The script copies `openspec/` into a `mkdtemp` directory and runs the pinned CLI (`node_modules/.bin/openspec`, the binary behind `npm run openspec`) with that directory as its working directory, which the CLI takes as the project root. The copy is removed in a `finally` block.
- **All active changes, then one validation.** Active changes are the directories under `openspec/changes/` other than `archive/`, archived in name order so the result is deterministic. One `validate --all --strict --json` run then checks the copy, as `make verify` checks the repository. Archiving all of them first also catches two changes that conflict once both are applied.
- **Naming the change.** A failed archive names its change and the CLI output. A failed validation item names the changes whose `specs/<capability>/` deltas touch it, with each issue's level, path, and message from the JSON report.
- **Offline.** `OPENSPEC_TELEMETRY=0`, `DO_NOT_TRACK=1`, and `OPENSPEC_NO_UPDATE_CHECK=1` turn off the CLI's telemetry and update check.
- **Placement.** `make verify` runs `npm run verify:archive` right after the strict validation of the repository, so a broken repository spec fails first with its own message.

## Risks / Trade-offs

- The archive writes today's date into the copy's archive directory names; they never leave the copy and do not affect the result.
- Each active change adds one archive run to `make verify`, a few seconds at most.
