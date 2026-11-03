## Context

Sub-change 20d of G3 plan item 20. The plugin `@taskelith/scm-github` passes the shared SCM conformance suite over an emulated GitHub (`implement-github-scm-plugin-core`). This change adds the run against GitHub.com. Owner answers of 2026-11-03, through the coordinator:

1. The App is the qualification GitHub App (`docs/qualification/github.md`), today installed on `petarnenov/taskelith` with administration. The run must touch only the three disposable repositories, never `petarnenov/taskelith`, enforced in code.
2. The private repositories `petarnenov/taskelith-conformance-project`, `-foreign`, and `-hidden`; the App is installed on project and foreign only.
3. The private key and the webhook secret are files on hpz600, mode 0600; the target reads paths and IDs from environment variables, names a missing variable, and never prints a value.
4. A manual target, modeled on `make qualify-harnesses`, run on SCM changes, outside `make verify`.

This first phase makes no GitHub call. The live run, the long run, and the Octokit promotion follow after the owner's setup.

## Goals / Non-Goals

**Goals:** the target and script, the live fixture, the guard, the cleanup, the long-run case, the redacted evidence, and network-free tests of their local parts.

**Non-Goals:** a live webhook receiver (the suite signs deliveries itself, as the emulated run does), a reviewer identity, changes to the plugin or the suite, dependency changes, and running against GitHub in this phase.

## Decisions

### Layout

The run is development tooling, like `scripts/installation-scenario.ts`: `scripts/github-conformance.ts` is the entry point and `scripts/github-conformance-*.ts` hold its parts (settings, guard, native client, fixture, cleanup, evidence, long run). Product code is unchanged, so no plugin or module imports test tooling. The target runs `npm run build` first because the script imports the built workspace packages.

### Environment check

`readSettings` requires the four variables, reports every missing one in one message, and checks that both IDs are numeric without quoting them. `loadSecrets` reads both files; an unreadable or empty file, or a key file without a PEM private key, fails by variable name, without the path. A single trailing newline is dropped. Repository names are not configurable: the allowlist is the owner's three repositories, and an override could only widen it.

### Allowlist guard

`RequestGuard` wraps `fetch`; the plugin gets the guarded `fetch` through its `fetch` option, and the fixture's native client uses the same one. For each request, before calling the network:

- only `https` on the default port, to `api.github.com` or `github.com`;
- `/repos/{owner}/{repo}/...` and `github.com/{owner}/{repo}.git/...` only for the three repositories, case-insensitive, after percent-decoding and URL normalization;
- `POST /app/installations/{id}/access_tokens` only with a JSON body whose `repositories` names only those repositories and that has no `repository_ids`. An unnarrowed token would cover every repository of the installation, `petarnenov/taskelith` included, so the guard refuses it;
- `/installation/repositories` and `/installation/token`, which name no repository;
- everything else is refused.

A refusal throws, so the caller sees a local failure, and is recorded; any refusal fails the run. The guard also records each minted token from the token responses, so that the evidence scan knows the run's secrets.

### Live fixture

The fixture acts on GitHub by its own means, an installation token of the project and foreign repositories minted with a JWT signed by `node:crypto`, not by the plugin:

- `prepareHeadBranch` creates two commits through the Git data API and a branch `taskelith-conformance/<uuid>`; `advanceHead` adds a commit and moves the ref; `readBranchHead` reads the ref.
- `attemptAction`: code reads and writes ask for Git's smart HTTP advertisement (`info/refs?service=git-upload-pack` or `git-receive-pack`) with the credential's `authorization`, which GitHub refuses without access and which writes nothing; change request and status writes call the API with the credential's secret. A probe pull request gets its own two-commit branch where the fixture can create one; in the hidden repository it names an absent branch, which GitHub never reaches because it refuses the repository first. Status probes use the base head, or an all-zero commit in the hidden repository.
- `attemptBypassMerge` merges with the fixture's token, the App's own identity, which holds administration; `enforce_admins` must refuse it.
- `observeMergeMethod`: two parents mean a merge commit; one parent with a message the fixture wrote means a rebase, which keeps each message; otherwise a squash. Two commits per prepared head make GitHub title a squash after the pull request, not after the single commit.
- Signed deliveries are made locally with the webhook secret, as in the emulated run; the foreign secret is a different string.

Expected outcomes still to confirm in the live run: GitHub answers 401, 403, or 404 for a refused code access, and 403 for `git-receive-pack` with a read-only token.

### Cleanup

`cleanUp` runs in a `finally` after the suite, also after a thrown error, and with `--cleanup-only` alone. For project and foreign it reads the run's branches (`git/matching-refs/heads/taskelith-conformance/`), the open pull requests, and the base branch's protection; `planCleanup`, a pure function, orders the steps: protection removal, closing the pull requests whose head is a run branch, then deleting the run branches. Each step runs on its own; already-done answers (404 for removed protection, 422 for a missing ref) count as done. A repository whose state cannot be read is listed as unobserved and fails the run. Commit statuses, closed pull requests, and merged commits on the disposable base branch remain, as GitHub keeps them. The hidden repository is never written.

### Long-run case

GitHub sets an installation token's expiry one hour after the mint and offers no shorter lifetime, so outliving the original expiry takes over an hour of real time; no faster honest route exists. The case is therefore opt-in (`LONG_RUN=1`), after the suite, about 62 minutes:

1. Issue a read-only credential for the project repository; note its expiry.
2. Every 20 minutes, until two minutes past that expiry: refresh, check that the refresh has a later expiry, that the previous and the new version both read, confirm adoption of the new version, and check that the previous one no longer reads.
3. Past the original expiry, check that the original version and the latest version read as expected, revoke, and check that the latest no longer reads.

The two minutes exceed the plugin's 60 s expiry margin. Findings use the suite's finding shape under the case name `long-run refresh`. The tests run the case over the emulated GitHub with its clock.

### Evidence

The run writes `report.json` into `OUT` (outside the worktree, created with mode 0700, file mode 0600): mode, times, repositories, case count, findings, whether the long run ran, a stop reason, the cleanup steps, and the guard's refusals. Its text is redacted with `redactWith(text, SECRET_SHAPE_RULES)` from `@taskelith/observability` (PEM keys, `ghs_` tokens, JWTs, `Basic` credentials, and the other shared shapes), then scanned with looser patterns (any `gh?_` token, a PEM private key marker, a JWT prefix, a bare `Basic` value) and the run's known secrets (the webhook secret, the key's body lines, every minted token). Any trace fails the run with the trace kinds only and saves nothing. The console prints counts only.

### Revocation propagation window (live-run finding 2)

The first live runs failed `adopted credential` and `credential isolation`: right after a revocation, GitHub's Git smart HTTP still accepted the revoked token. A probe on the project repository answered 200 at 0 and 2 seconds after the revocation and 401 from 5 seconds on; the REST API refused the token at once. This is GitHub's propagation delay, not a plugin defect: the plugin's revocation returned only after GitHub confirmed it.

The coordinator Niki decided on 2026-11-03 (option B) that the contract states what GitHub guarantees instead of an end at once:

- An adoption confirmation or a revocation requests the end before it returns, and every surface, Git's smart HTTP included, refuses an ended version within `REVOCATION_PROPAGATION_SECONDS`, 30 seconds (source control contract section 3, and section 7 for GitHub). The constant is in the port entry. The port is a draft, its operations are unchanged, and so is its version `0.2.0`. The contract compatibility check covers the OpenAPI and AsyncAPI documents only, so no breaking-changes entry applies.
- The contract says that no consumer relies on an end alone to isolate runs; fencing and the workspace hand-off stay the isolation boundary.
- `expectEnded` in the shared suite, and the long run, repeat each attempt with an ended version about once a second (`awaitRefusal`, `REVOCATION_POLL_MS`) until it is refused or the window has passed. Every attempt starts within the window. A success at the window's end, or a refusal with another code than `forbidden`, is a finding, as before. The report's `endings` record the slowest refusal of each ending, and the evidence keeps them.
- The fixture supplies the clock (`SourceControlConformanceFixture.clock`), so the in-memory SCM and the emulated GitHub run the window on their own clocks without waiting. The in-memory SCM's `endingLagMs` keeps an ended version working for a set time; tests cover a lag just within and just past the window.

No other check was loosened.

### Narrowed tokens of the plugin's own identity (live-run finding 1)

The first live run's guard refused the plugin's own installation token request, which named no repository: such a token covers every repository of the installation, `petarnenov/taskelith` included. `c57cc336` narrows each token of the plugin's own identity to the repository of the route that uses it, with a test that failed before the fix.

## Risks / Trade-offs

- The App holds administration on its installation; the guard, not GitHub, keeps the run off `petarnenov/taskelith`. A separate installation for the conformance repositories would remove that reliance and is an owner choice.
- Merges accumulate commits on the disposable repositories' `main`; this is expected for disposable repositories.
- The run depends on the repositories' settings: a `main` branch with a commit, and merge commits, squash, and rebase all allowed.
- The fixture's status codes for GitHub's Git HTTP refusals are assumptions until the live run confirms them.
- The 30-second window is three to six times the delay seen on 2026-11-03; GitHub publishes no bound, so a slower propagation fails the run, which then needs a new decision rather than a longer wait.
