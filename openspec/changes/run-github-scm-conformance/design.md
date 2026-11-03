## Context

Sub-change 20d of G3 plan item 20. The plugin `@taskelith/scm-github` passes the shared SCM conformance suite over an emulated GitHub (`implement-github-scm-plugin-core`). This change adds the run against GitHub.com. Owner answers of 2026-11-03, through the coordinator:

1. The App is the qualification GitHub App (`docs/qualification/github.md`), today installed on `petarnenov/taskelith` with administration. The run must touch only the three disposable repositories, never `petarnenov/taskelith`, enforced in code.
2. The private repositories `petarnenov/taskelith-conformance-project`, `-foreign`, and `-hidden`; the App is installed on project and foreign only.
3. The private key and the webhook secret are files on hpz600, mode 0600; the target reads paths and IDs from environment variables, names a missing variable, and never prints a value.
4. A manual target, modeled on `make qualify-harnesses`, run on SCM changes, outside `make verify`.

The change ran in three phases: a build phase without any GitHub call, a live phase after the owner's setup, and the fix round of review pass 1. The decisions below describe the delivered state; where a phase changed an earlier decision, the section says so.

## Goals / Non-Goals

**Goals:** the target and script, the live fixture, the guard, the cleanup, the long-run case, the redacted evidence, and network-free tests of their local parts.

**Non-Goals:** a live webhook receiver (the suite signs deliveries itself, as the emulated run does) and a reviewer identity. The build phase also left the plugin, the suite, and the dependencies unchanged and made no GitHub call; the live phase and the fix round changed the plugin, the suite, and the source control port by the coordinator's decisions below, and added two root development dependencies.

## Decisions

### Layout

The run is development tooling, like `scripts/installation-scenario.ts`: `scripts/github-conformance.ts` is the entry point and `scripts/github-conformance-*.ts` hold its parts (settings, guard, native client, fixture, cleanup, evidence, long run). No plugin or module imports test tooling; the product changes of the later phases are in their own sections below. The target runs `npm run build` first because the script imports the built workspace packages.

### Environment check

`readSettings` requires the four variables, reports every missing one in one message, and checks that both IDs are numeric without quoting them. `loadSecrets` reads both files; an unreadable or empty file, or a key file without a PEM private key, fails by variable name, without the path. A single trailing newline is dropped. Repository names are not configurable: the allowlist is the owner's three repositories, and an override could only widen it.

### Allowlist guard

`RequestGuard` wraps `fetch`; the plugin gets the guarded `fetch` through its `fetch` option, and the fixture's native client uses the same one. For each request, before calling the network:

- only `https` on the default port, to `api.github.com` or `github.com`;
- `/repos/{owner}/{repo}/...` and `github.com/{owner}/{repo}.git/...` only for the three repositories, case-insensitive, after percent-decoding and URL normalization;
- `POST /app/installations/{id}/access_tokens` only with a JSON body whose `repositories` names only those repositories and that has no `repository_ids`. An unnarrowed token would cover every repository of the installation, `petarnenov/taskelith` included, so the guard refuses it;
- `/installation/repositories` and `/installation/token`, which name no repository;
- everything else is refused.

The guard sends every request with `redirect: 'manual'` and refuses any 3xx answer, so no redirect hop, to another repository or another host, escapes the check (review pass 1 finding 2). A refusal throws, so the caller sees a local failure, and is recorded; any refusal fails the run. The guard also records each minted token from the token responses, so that the evidence scan knows the run's secrets.

### Live fixture

The fixture acts on GitHub by its own means, an installation token of the project and foreign repositories minted with a JWT signed by `node:crypto`, not by the plugin:

- `prepareHeadBranch` creates two commits through the Git data API and a branch `taskelith-conformance/<uuid>`; `advanceHead` adds a commit and moves the ref; `readBranchHead` reads the ref.
- `attemptAction`: code reads and writes ask for Git's smart HTTP advertisement (`info/refs?service=git-upload-pack` or `git-receive-pack`) with the credential's `authorization`, which GitHub refuses without access and which writes nothing; change request and status writes call the API with the credential's secret. A probe pull request gets its own two-commit branch where the fixture can create one; in the hidden repository it names an absent branch, which GitHub never reaches because it refuses the repository first. Status probes use the base head, or an all-zero commit in the hidden repository.
- `attemptBypassMerge` merges with the fixture's token, the App's own identity, which holds administration; `enforce_admins` must refuse it.
- `observeMergeMethod`: two parents mean a merge commit; one parent with a message the fixture wrote means a rebase, which keeps each message; otherwise a squash. Two commits per prepared head make GitHub title a squash after the pull request, not after the single commit.
- Signed deliveries are made locally with the webhook secret, as in the emulated run; the foreign secret is a different string.

The build phase assumed that GitHub answers 401, 403, or 404 for a refused code access, and 403 for `git-receive-pack` with a read-only token; every live run passed the cases that rely on it.

### Cleanup

`cleanUp` runs in a `finally` after the suite, also after a thrown error, and with `--cleanup-only` alone. For project and foreign it reads the run's branches (`git/matching-refs/heads/taskelith-conformance/`), the open pull requests, and the base branch's protection; `planCleanup`, a pure function, orders the steps: protection removal, closing the pull requests whose head is a run branch, then deleting the run branches. Each step runs on its own; already-done answers (404 for removed protection) count as done. A 422 to a branch deletion is ambiguous, so the cleanup reads the ref again and counts the step done only when it answers 404 (review pass 1 finding 9). GitHub answers the matching refs in one response; the open pull requests are paged with `@octokit/plugin-paginate-rest`, and a listing with more than 50 pages fails instead of returning a part (finding 10). A repository whose state cannot be read is listed as unobserved and fails the run.

After the cleanup, the run revokes every token that the guard saw minted, the plugin's, the suite's, and the fixture's own, renewals included, with `DELETE /installation/token` as each token's holder. A 204 counts as revoked and a 401 as already ended; any other answer is recorded in the report's `revocation` and fails the run (finding 8). Tokens of runs before this fix expire at GitHub within an hour of their mint. Commit statuses, closed pull requests, and merged commits on the disposable base branch remain, as GitHub keeps them. The hidden repository is never written.

### Long-run case

GitHub sets an installation token's expiry one hour after the mint and offers no shorter lifetime, so outliving the original expiry takes over an hour of real time; no faster honest route exists. The case is therefore opt-in (`LONG_RUN=1`), after the suite, about 62 minutes:

1. Issue a read-only credential for the project repository; note its expiry.
2. Every 20 minutes, until two minutes past that expiry: refresh, check that the refresh has a later expiry, that the previous and the new version both read, confirm adoption of the new version, and check that the previous one no longer reads.
3. Past the original expiry, check that the original version and the latest version read as expected, revoke, and check that the latest no longer reads.

The two minutes exceed the plugin's 60 s expiry margin. Findings use the suite's finding shape under the case name `long-run refresh`. A refusal counts only with `forbidden`; another failure code is a finding (review pass 1 finding 4). The case reads every plugin and fixture answer with the suite's own readers (`readUntrustedResult`, `readRunCredential`), and names a thrown value only by `describeThrown`'s fixed category, never by its message (finding 7); a malformed answer ends the case with a finding. The tests run the case over the emulated GitHub with its clock.

### Evidence

The run writes `report.json` into `OUT` (outside the worktree, created with mode 0700, file mode 0600): mode, times, repositories, case count, findings, whether the long run ran, a stop reason, the cleanup steps, and the guard's refusals. Its text is redacted with `redactWith` from `@taskelith/observability` with `SECRET_SHAPE_RULES` (PEM keys, `ghs_` tokens, JWTs, `Basic` credentials, and the other shared shapes) and a local rule for every GitHub token family (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, and fine-grained `github_pat_`), then scanned with looser patterns (those token families, a PEM private key marker, a JWT prefix, a bare `Basic` value) and the run's known secrets (the webhook secret, the key's body lines, every minted token), each as written and as JSON escapes it (review pass 1 findings 5 and 6). A known secret of any length is scanned; the settings refuse a webhook secret shorter than eight characters, which would match ordinary text by chance. Any trace fails the run with the trace kinds only and saves nothing. The console prints counts only.

### Revocation propagation window (live-run finding 2)

The first live runs failed `adopted credential` and `credential isolation`: right after a revocation, GitHub's Git smart HTTP still accepted the revoked token, while the REST API refused it at once. An ad hoc probe, whose output was not kept, saw the Git advertisement answer 200 at 0 and 2 seconds after a revocation and 401 from 5 seconds on; it is an unrecorded observation, not evidence. This is GitHub's propagation delay, not a plugin defect: the plugin's revocation returned only after GitHub confirmed it.

The coordinator Niki decided on 2026-11-03 (option B) that the contract states what GitHub guarantees instead of an end at once:

- An adoption confirmation or a revocation requests the end before it returns, and every surface, Git's smart HTTP included, refuses an ended version within `REVOCATION_PROPAGATION_SECONDS`, 30 seconds, counted from the operation's return (source control contract section 3, and section 7 for GitHub). A permission or repository that a version was never granted is still refused at once. The constant is in the port entry and stays out of the plugin SDK's `draft` namespace; exposing it there is a follow-up.
- The contract says that no consumer relies on an end alone to isolate runs; fencing and the workspace hand-off stay the isolation boundary.
- The port's version rises from `0.2.0` to `0.3.0`. The source control contract's draft status rule (`docs/contracts/source-control.md` section 2, rule 7, line 25) raised the port to `0.2.0` for a changed meaning of refresh, not for a new operation, and the contracts' version rule (`docs/contracts/execution-wire-contracts.md` line 33) gives "a changed meaning" the next version; the window changes the meaning of an end, so the minor version rises (coordinator decision, 2026-11-03). The contract compatibility check covers the OpenAPI and AsyncAPI documents only, so no breaking-changes entry applies. The `scm-port` delta modifies every requirement and scenario that demanded an end at once.
- The suite waits for the refusals of one ending together (`awaitRefusals`): each round repeats every attempt that still succeeds, then sleeps about a second (`REVOCATION_POLL_MS`) on the fixture's clock. All probes of an ending, the two versions of one revocation included, share its window. An attempt starts only within the window, its answer counts only within it, and an attempt that never answers is bounded by it through the clock's `timeout`; so a late refusal, a success at the window's end, an attempt the window left no time for, and a refusal with another code than `forbidden` are all findings (review pass 1 finding 3). The report's `endings` record the slowest answer of each ending. The long run uses the same wait.
- The fixture supplies the clock (`SourceControlConformanceFixture.clock`), so the in-memory SCM and the emulated GitHub run the window on their own clocks without waiting, and the window tests use a fixed service clock and assert exact latencies (finding 13). The in-memory SCM's `endingLagMs` keeps an ended version working for a set time; tests cover a lag just within and just past the window.

No other check was loosened.

### Narrowed tokens of the plugin's own identity (live-run finding 1, review pass 1 finding 1)

The first live run's guard refused the plugin's own installation token request, which named no repository: such a token covers every repository of the installation, `petarnenov/taskelith` included. `c57cc336` (before the rebase) narrowed each token of the plugin's own identity to the repository of the route that uses it. Review pass 1 found one path left: after GitHub refused a run's token request with 422, the plugin listed the installation's repositories with an installation-wide token. The plugin now asks GitHub, by the App's JWT, for the installation of each requested repository (`GET /repos/{owner}/{repo}/installation`): 404 or another installation means outside the installation. `GithubApi` offers only two identities: `asApp`, typed to the JWT routes, and `asInstallation`, which requires the route's repository and mints a token narrowed to it. No path requests an installation token without repositories, which a test of every token request checks.

## Coordinator decisions

These are not review findings; review pass 2 reviews them.

1. Port version `0.3.0`, citing the version rules above; the constant stays out of the plugin SDK's `draft` namespace, with the follow-up "expose `REVOCATION_PROPAGATION_SECONDS` in the plugin SDK" (Niki, 2026-11-03).
2. The Octokit rows stay `candidate` in `docs/dependencies.md` and `docs/g3-dependencies.md`, each noting the evidence gathered and the adoption evidence still open; the exception sentence of the live phase is reverted; they move to `accepted` in the admission task (Niki, 2026-11-03).
3. `docs/qualification/github.md` "Remaining before admission" marks done only the items that the live evidence covers, each with its report (Niki, 2026-11-03).
4. The finding-2 probe is an unrecorded observation; the 30-second window rests on the suite's recorded endings (Niki, 2026-11-03).
5. `@octokit/plugin-paginate-rest@16.0.0` stays, because the cleanup's listing of open pull requests pages; the tooling pages with it, not with a loop of its own. It and `@octokit/core@7.0.8` become exact root development dependencies, as scripts resolve from the root, where the release tooling's 15.0.0 was; 15.0.0 stays nested under `@semantic-release/github`. The plugin no longer uses the pagination plugin, so its `package.json` drops it (Niki, 2026-11-04).
6. Because review pass 1 findings 3 and 4 change how the long run is judged and `long-1` did not record each refusal's code, a new long run after the fixes replaces it as evidence (Niki, 2026-11-04).
7. The F1 and F2 tests reproduce the escape before the fix; redirects are never followed and any 3xx is a refusal; minted tokens are revoked at cleanup from now on, and tokens of earlier runs end at GitHub within an hour (Niki, 2026-11-04).

## Risks / Trade-offs

- The App holds administration on its installation; the guard, not GitHub, keeps the run off `petarnenov/taskelith`. A separate installation for the conformance repositories would remove that reliance and is an owner choice.
- Merges accumulate commits on the disposable repositories' `main`; this is expected for disposable repositories.
- The run depends on the repositories' settings: a `main` branch with a commit, and merge commits, squash, and rebase all allowed.
- GitHub publishes no bound for the delay. The recorded live runs of 2026-11-03 saw their slowest ending refused after 11.8 seconds, so the 30-second window leaves more than twice that. A slower propagation fails the run, which then needs a new decision rather than a longer wait.
