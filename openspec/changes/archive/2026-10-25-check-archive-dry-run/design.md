## Context

`openspec archive <change> --yes` applies a change's deltas to the main specs and moves the change under `openspec/changes/archive/`. Strict validation of a change checks only its deltas, so problems that appear only in the applied main spec, such as the placeholder Purpose of a new capability or a requirement over the length limit, surface after merge, when the coordinator archives.

## Goals / Non-Goals

Goals: fail `make verify` on such a change before handoff, deterministically, offline, and without changing the repository. Non-goals: fixing the change automatically, archiving changes in the repository, or cleaning up after SIGKILL.

## Decisions

- **Archive in a copy.** The script copies `openspec/` into a `mkdtemp` directory and runs the pinned CLI (`node_modules/.bin/openspec` of the clone that holds the script, the binary behind `npm run openspec`) with that directory as its working directory, which the CLI takes as the project root. The copy is removed in a `finally` block.
- **Links become files.** The copy follows symbolic links and copies their targets, so that an archive can never write through a link into the repository. A small recursive copy does this, because `cpSync` with `dereference` keeps nested links in Node.js 24.
- **Interruption.** The CLI runs as an asynchronous child process. SIGINT and SIGTERM abort an `AbortController`, which sends SIGTERM to the child; the runner settles only on the child's `close` event, so that the `finally` block removes the copy after the CLI has stopped writing, and the check exits with 128 plus the signal number. SIGKILL cannot be handled and may leave the copy in the system temporary directory.
- **All active changes, then one validation.** Active changes are the directories under `openspec/changes/` other than `archive/`, archived in name order so the result is deterministic. One `validate --all --strict --json` run then checks the copy, as `make verify` checks the repository. Archiving all of them first also catches two changes that conflict once both are applied.
- **Naming the change.** A failed archive names its change and the CLI output. A failed validation item names the changes whose deltas touch it, with each issue's level, path, and message from the JSON report. A delta's capability is the directory of each `spec.md` under the change's `specs/`, nested ones included, with the `/`-separated path the CLI uses as its id.
- **Offline.** `OPENSPEC_TELEMETRY=0`, `DO_NOT_TRACK=1`, and `OPENSPEC_NO_UPDATE_CHECK=1` turn off the CLI's telemetry and update check.
- **Placement.** `make verify` runs `npm run verify:archive` right after the strict validation of the repository, so a broken repository spec fails first with its own message.

## Risks / Trade-offs

- The archive writes today's date into the copy's archive directory names; they never leave the copy and do not affect the result.
- Each active change adds one archive run to `make verify`, a few seconds at most.
