## Why

G3 plan item 20 (`docs/g3-plan.md`, row 20) requires the SCM conformance suite run through `make` against GitHub.com with the plugin's own credential, including a run that outlives a credential's original expiry and exercises the revised refresh (source control contract section 9). This is sub-change 20d. Its first phase builds the run without calling GitHub: the owner is still creating the disposable repositories, installing the App, and placing its secret files (owner answers of 2026-11-03, through the coordinator).

## What Changes

- `make conformance-github OUT=<dir>`, a manual target run on SCM changes and not part of `make verify`, which builds the workspace and runs `scripts/github-conformance.ts`; `LONG_RUN=1` adds the long-run case, `CLEANUP_ONLY=1` only resets the repositories.
- The script reads only paths and IDs from `TASKELITH_GITHUB_APP_KEY_FILE`, `TASKELITH_GITHUB_WEBHOOK_SECRET_FILE`, `TASKELITH_GITHUB_APP_ID`, and `TASKELITH_GITHUB_INSTALLATION_ID`, fails naming each missing or invalid variable, and never prints a value.
- An allowlist guard on every request, the plugin's included, refuses any repository other than `petarnenov/taskelith-conformance-project`, `-foreign`, and `-hidden`, and any token request not narrowed to them by name, before the call.
- A live conformance fixture that wires `runSourceControlConformance` to the `scm-github` plugin over the live API: the project, foreign, and hidden repositories, the project's remote URL, and native setup and observation by the App's own token outside the plugin.
- A cleanup after every run, in a `finally`, that removes the base branch's protection, closes the run's pull requests, and deletes its branches; also callable alone.
- An opt-in long-run case of about 62 minutes that refreshes and adopts the credential past the original version's expiry.
- Evidence redacted by the shared `SECRET_SHAPE_RULES` and then scanned with looser patterns and the run's known secret values; any trace fails the run and saves nothing.
- Network-free unit tests of the environment check, the guard, the cleanup planning, the redaction and scan, and the long run against the emulated GitHub.
- The propagation window of a credential's end (live-run finding 2, coordinator decision of 2026-11-03): `REVOCATION_PROPAGATION_SECONDS` in the port, the suite and the long run waiting for the refusal within it on the fixture's clock, and the latencies in the report.
- The plugin's own identity narrows each installation token to the route's repository, and resolves a refused token request's repositories by the App's JWT, so it never requests an installation-wide token (live-run finding 1, review pass 1 finding 1).
- The port's version rises to `0.3.0`, as the window changes the meaning of an end (coordinator decision).

## Capabilities

### Modified Capabilities

- `scm-qualification`: the live GitHub conformance run, its repository allowlist, cleanup, long-run case, and redacted evidence.
- `scm-port`: the propagation window within which every surface refuses an ended credential version, and the requirements that demanded an end at once.

## Impact

- Code: `scripts/github-conformance*.ts` (new), `test/github-conformance.test.ts` (new), `Makefile`, the shared conformance suite, its fixture type, and the port version in `@taskelith/integrations`, and the token requests of `@taskelith/scm-github`, which no longer uses `@octokit/plugin-paginate-rest`.
- Docs: `docs/qualification/github.md` (live conformance section), `docs/contracts/source-control.md` sections 2, 3, 7, 8, and 9, and the Octokit rows of the dependency register, which stay `candidate`.
- Two exact root development dependencies for the tooling, `@octokit/core@7.0.8` and `@octokit/plugin-paginate-rest@16.0.0` (coordinator decision); no OpenAPI, wire, migration, or published `taskelith` package file change.
- The live runs and the long runs followed the owner's setup in a later phase of this sub-change.
