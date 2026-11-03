# Verification: run-github-scm-conformance

## Scope and source

This is G3 plan item 20 (`docs/g3-plan.md`, row 20), sub-change 20d: the live SCM conformance run against GitHub.com, build phase only. A briefed subagent developed it for the worker Zaki from `dev` `f0ed0139` (#429). The phase delivers:

- the `make conformance-github` target and `scripts/github-conformance.ts`;
- the environment check;
- the repository allowlist guard;
- the live fixture of `runSourceControlConformance` over the `scm-github` plugin;
- the cleanup, with a `--cleanup-only` mode;
- the opt-in long-run case;
- the redaction and scan of the evidence;
- network-free unit tests.

The owner's answers of 2026-11-03, sent through the coordinator Niki, are in `design.md` Context. This phase made no GitHub call and read nothing under the owner's conformance secret directory. Excluded: the live run, the long run, and the Octokit promotion. These follow in a later phase, after the owner's setup.

## Revision

- Base: `dev` `f0ed0139`. The checklist was saved with `--at f0ed0139b0f6177ad09762a36b214034d92fead5 --size M`.
- `9dec1ea6` `docs: create the run github scm conformance change`.
- `be5f5567` `chore: add the live github scm conformance run with its repository guard, cleanup, long run, and redacted evidence`.
- `6b0dedf5` `docs: specify the run github scm conformance change and describe the live conformance run`.
- `ea23f250` `docs: record the review route of the run github scm conformance change`. `make verify` run 1 on this tree failed (see "Checks"), so:
- `537d76e7` `chore: keep the github conformance comments within the comment length rule`. This changed the diff, so `route.json` was deleted and routed again, as protocol worker step 4 requires.
- `2840a8e5` `docs: route the run github scm conformance change again after the comment length fix`. `route.json` is unedited and gives the same recommendation. `make verify` run 2 checked its tree, `2a763a75`. The commit after it adds this record.

## Environment

The host is native Ubuntu `hpz600`, Linux 6.8.0-147-generic x86_64. Node.js v24.22.1 is the `.nvmrc` pin that `scripts/with-pinned-node.sh` selects.

## Author self-check

- Scope: the brief's build list only. `git diff f0ed0139 --shortstat` without `openspec/` gives 12 files, 1168 insertions, and 2 deletions. There is no product source, dependency, contract, or lockfile change.
- Guard: the plugin gets the guarded `fetch` through its `fetch` option, and the fixture's native client uses the same one. Any repository except the three disposable ones is refused before the network call, and so is a token request that is not narrowed to them by name. Tests cover `petarnenov/taskelith` by path, encoded slash, Git URL, path traversal, and an unnarrowed or `repository_ids` token request. They also show that the inner fetch is never called on a refusal.
- Secrets: messages name variables only, never values or paths. The console prints counts only. Evidence is redacted with `SECRET_SHAPE_RULES`, then scanned for looser token shapes, the webhook secret, the key's body lines, and every minted token. Tests use synthetic values and a key generated at run time.
- Long run: the design explains why outliving GitHub's one-hour expiry takes about 62 minutes of real time, so the case is opt-in (`LONG_RUN=1`). The tests run it over the emulated GitHub clock, including two defective providers.
- Commit types: `chore` and `docs`. No AI attribution.

## Fail-before

This change adds new tooling, so no earlier behavior was broken to fix. As evidence that the tests guard the behavior, two mutations made before the first commit made the tests fail:

- `checkRequest` always allowing a request failed the three guard tests.
- The evidence scan returning no traces failed the scan test.

Both mutations were reverted.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `env -u NODE_ENV make verify` (run 1) | `ea23f250`, clean | Failed in `verify:comments`: three new three-line comments, in `github-conformance-cleanup.ts`, `github-conformance-long-run.ts`, and `github-conformance.ts`. Fixed in `537d76e7`. |
| `env -u NODE_ENV make verify` (run 2) | `2840a8e5`, tree `2a763a75`, clean | Passed, profile full, stamp written. Tests 4433, suites 49, pass 4386, fail 0, cancelled 0, skipped 47. All files: 99.39 % lines, 92.72 % branches, 98.89 % functions. No known flake failed, and nothing was rerun. |
| `test/github-conformance.test.ts` | inside run 2 | 12 tests pass. |
| `npm run openspec -- validate run-github-scm-conformance --strict` | `6b0dedf5` | `Change 'run-github-scm-conformance' is valid` |
| CLI smoke without network | `be5f5567` | Without the variables, exit 2 names all four. Without arguments, exit 2 prints the usage. With a throwaway generated key and `--out` inside the worktree, exit 2 is refused before any request. |

The new code is development tooling under `scripts/` and `test/`, like `scripts/installation-scenario.ts`, so it is outside the `dist` coverage scope.

### Route

Route (`route.json`, rule version 5): elevated (lines, contracts). Pass 1 reviewer A is `codex gpt-6-astra#high`. Pass 2 reviewer B is `claude claude-fable-5-1#high`. Pass 3 reviewer A is `agy gemini-4-argon-medium#medium`, only after a pass 2 with a Medium or worse finding. The shadow router `jev-1.14.0` agrees. The coordinator assigns the reviewers and their effort.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `2a763a7555e6ddada46b3f53230cd0ec0ae12fba`; tests 4433, pass 4386, fail 0, skipped 47; all files 99.39% lines, 92.72% branches, 98.89% functions.
- `npm run openspec -- validate run-github-scm-conformance --strict`: passed, `Change 'run-github-scm-conformance' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 106 file(s); every pass summary file is valid: 86 file(s); every route file is valid: 39 file(s).`.
- Spec diff against the merge base `f0ed0139b0f6` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

None has run yet. The review starts after this build phase, with the reviewers that the coordinator assigns.

## Limitations

- No live GitHub call has been made. These are assumptions for the live run to confirm (design, Live fixture):
  - GitHub's status codes for refused Git HTTP access;
  - 403 for `git-receive-pack` with a read-only token;
  - the squash title after the pull request.
- The App's installation also covers `petarnenov/taskelith`, so the guard is what keeps the run off that repository.
- Repository names are fixed in code and are not configurable.

## Remaining gates

- PENDING: the live run against GitHub.com, after the owner's setup of the repositories, the App installation, and the secret files.
- PENDING: the long run (`LONG_RUN=1`, about 62 minutes).
- PENDING: the Octokit promotion in the dependency register.
- Independent review passes 1 to 3 as governance requires.
- Archive of the change.
- Integration into dev by the coordinator (single pull request).
