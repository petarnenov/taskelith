# Verification: run-github-scm-conformance

## Scope and source

This is G3 plan item 20 (`docs/g3-plan.md`, row 20), sub-change 20d: the live SCM conformance run against GitHub.com. A briefed subagent developed it for the worker Zaki from `dev` `f0ed0139` (#429), in a build phase without network and a live phase after the owner's setup. The build phase delivers:

- the `make conformance-github` target and `scripts/github-conformance.ts`;
- the environment check;
- the repository allowlist guard;
- the live fixture of `runSourceControlConformance` over the `scm-github` plugin;
- the cleanup, with a `--cleanup-only` mode;
- the opt-in long-run case;
- the redaction and scan of the evidence;
- network-free unit tests.

The owner's answers of 2026-11-03, sent through the coordinator Niki, are in `design.md` Context. The build phase made no GitHub call. Only the tooling read the contents of the owner's secret files; no agent read, printed, or copied anything under that directory, and agents got only the files' paths and the redacted evidence.

The live phase delivers:

- the discovery mode (`--discover`) that found the installation and checked what it sees;
- the live runs, the long run, the cleanup checks, and their redacted evidence in `docs/qualification/github-conformance/`;
- the fixes of two live-run findings (below);
- the live evidence in the Octokit rows of the dependency register, which stay `candidate` after the pass 1 fix round.

The pass 1 fix round delivers the fixes of the 14 review findings, the coordinator's decisions (listed apart below), a live run, a cleanup-only run, and a new long run after the fixes.

## Revision

- Base: `dev` `f0ed0139`. The checklist was saved with `--at f0ed0139b0f6177ad09762a36b214034d92fead5 --size M`.
- `9dec1ea6` `docs: create the run github scm conformance change`.
- `be5f5567` `chore: add the live github scm conformance run with its repository guard, cleanup, long run, and redacted evidence`.
- `6b0dedf5` `docs: specify the run github scm conformance change and describe the live conformance run`.
- `ea23f250` `docs: record the review route of the run github scm conformance change`. `make verify` run 1 on this tree failed (see "Checks"), so:
- `537d76e7` `chore: keep the github conformance comments within the comment length rule`. This changed the diff, so `route.json` was deleted and routed again, as protocol worker step 4 requires.
- `2840a8e5` `docs: route the run github scm conformance change again after the comment length fix`. `route.json` is unedited and gives the same recommendation. `make verify` run 2 checked its tree, `2a763a75`. The commit after it adds this record.

The hashes above are those before the rebase. On the coordinator's instruction the branch was rebased onto `dev` `d0d59478` (#434, `stabilize-webhook-limit-test`) without conflicts; the rebase gave every commit a new hash. The commits after the rebase, oldest first:

- `ca4c90b1`, `45cdb6f0`, `03a45ffe`, `d42556a1`, `803828d5`, `3d8872f8`, `d0be1ef0`: the build phase above, in the same order.
- `d30c4cdb` `chore: add a discovery mode to the github conformance run that finds the app installation`.
- `c3de8be0` `chore: narrow the github plugin's own identity tokens to the route's repository` (finding 1).
- `2813fae2` `chore: wait for an ended scm credential version's refusal within the propagation window` (finding 2).
- `da097e1a` `docs: state the scm credential end propagation window in the source control contract and the scm-port spec`.
- `5795b6f3` `docs: record the github live conformance evidence and promote the octokit dependencies to accepted` (the promotion is reverted in the pass 1 fix round).
- `a018d996` `docs: route the run github scm conformance change again after the live run fixes`. The live-phase fixes changed the diff, so `route.json` was deleted and routed again; it is unedited.

- `fc1aa519`, `95eee174`: the records of the live phase.

The pass 1 fix round, oldest first:

- `8ebe9fe8` `chore: narrow every scm-github installation token and bound the revocation window wait` (findings 1, 3, and 13; it also commits pass 1's line of `passes.jsonl`).
- `fb7b1dc8` `chore: harden the github conformance guard, evidence, long run, and cleanup` (findings 2 and 4 to 10, the root development dependencies, and the regenerated inventory).
- `8e13cfe2` `chore: raise the source control port to 0.3.0 for the credential end propagation window` (finding 12).
- `eb8451df` `docs: keep the octokit rows candidate and describe the pass 1 fixes of the run github scm conformance change` (findings 11 and 14).
- FIXROUND_EVIDENCE_COMMITS

## Environment

The host is native Ubuntu `hpz600`, Linux 6.8.0-147-generic x86_64. Node.js v24.22.1 is the `.nvmrc` pin that `scripts/with-pinned-node.sh` selects.

## Author self-check

- Scope: the brief's build list only. `git diff f0ed0139 --shortstat` without `openspec/` gives 12 files, 1168 insertions, and 2 deletions. There is no product source, dependency, contract, or lockfile change. After the live phase, `git diff origin/dev --shortstat` without `openspec/` and the evidence directory gives 29 files, 1685 insertions, and 43 deletions: the live-phase product changes are the token narrowing in `@taskelith/scm-github` and the propagation window in `@taskelith/integrations` (the port constant, the fixture's clock, the suite's wait, and the report's `endings`), as the coordinator decided. The live phase had no dependency or lockfile change; the source control contract changed in sections 2, 3, 7, 8, and 9. The pass 1 fix round adds `@octokit/core@7.0.8` and `@octokit/plugin-paginate-rest@16.0.0` as exact root development dependencies, removes the pagination plugin from `@taskelith/scm-github`, regenerates `docs/dependencies/licenses.json` and `docs/dependencies/sbom.cdx.json`, and raises the port to `0.3.0`; `npm ls` shows 16.0.0 at the root and 15.0.0 nested under `@semantic-release/github`.
- Guard: the plugin gets the guarded `fetch` through its `fetch` option, and the fixture's native client uses the same one. Any repository except the three disposable ones is refused before the network call, and so is a token request that is not narrowed to them by name. Since the pass 1 fix round every request goes out with `redirect: 'manual'`, and any 3xx answer is refused. Tests cover `petarnenov/taskelith` by path, encoded slash, Git URL, path traversal, and an unnarrowed or `repository_ids` token request. They also show that the inner fetch is never called on a refusal.
- Secrets: messages name variables only, never values or paths. The console prints counts only. Evidence is redacted with `SECRET_SHAPE_RULES`, then scanned for looser token shapes, the webhook secret, the key's body lines, and every minted token. Tests use synthetic values and a key generated at run time.
- Long run: the design explains why outliving GitHub's one-hour expiry takes about 62 minutes of real time, so the case is opt-in (`LONG_RUN=1`). The tests run it over the emulated GitHub clock, including two defective providers.
- Commit types: `chore` and `docs`. No AI attribution.

## Live-run findings

These came from the live runs, not from a review, so they are not in `findings.jsonl`.

1. **Unnarrowed token of the plugin's own identity** (run `live-1`). The plugin requested installation tokens for its own operations without naming a repository; such a token covers every repository of the installation, `petarnenov/taskelith` included. The guard refused them before the call, and ten cases failed. `c3de8be0` narrows each such token to the route's repository; its test in `packages/plugins/scm-github/test/github-api.test.ts` failed before the fix.
2. **Revocation propagation** (runs `live-1` and `live-2`). `adopted credential` and `credential isolation` failed: right after a revocation, GitHub's Git smart HTTP still accepted the revoked token, while the REST API refused it at once. An ad hoc probe, whose output was not kept, saw 200 at 0 and 2 seconds and 401 from 5 seconds on; this is an unrecorded observation, not evidence. The 30-second window rests on the suite's recorded endings: the slowest of all recorded runs took 11.8 seconds (`long-1`). The coordinator Niki decided option B on 2026-11-03: the contract states the window `REVOCATION_PROPAGATION_SECONDS`, 30 seconds, within which every surface refuses an ended version, and that no consumer relies on an end alone to isolate runs; the suite and the long run wait for the refusal within the window and record each latency. `2813fae2` and `da097e1a` implement it (`design.md`, "Revocation propagation window"). No other check was loosened.

## Fail-before

This change adds new tooling, so no earlier behavior was broken to fix. As evidence that the tests guard the behavior, two mutations made before the first commit made the tests fail:

- `checkRequest` always allowing a request failed the three guard tests.
- The evidence scan returning no traces failed the scan test.

Both mutations were reverted.

For finding 2, the new tests in `packages/modules/integrations/test/source-control-conformance.test.ts` failed under two mutations of `awaitRefusal` in `src/ports/revocation-window.ts`, each built and run before the commit:

- No repetition, one attempt as before the change: three tests failed, among them "a version refused within the propagation window passes, with each latency".
- A window twice as long: two tests failed, among them "a version that still works after the propagation window is reported".

Both mutations were reverted and the 35 tests of that file passed.

### Pass 1 fixes

Each behavior fix of pass 1 has a test written before the fix and run against the code before it (`95eee174` with the new tests; a stub module stood in for the not yet written `scripts/github-conformance-revocation.ts`, so that the other tests of the file could run). Then the fixes were made and the same tests passed (68 of 68 in the three files).

- `packages/plugins/scm-github/test/run-credentials.test.ts`, "every installation token request is narrowed, also when a refused one resolves its repositories" (finding 1): failed, "an installation token request named no repository", the escape through the 422 fallback.
- `packages/modules/integrations/test/revocation-window.test.ts` (finding 3), seven fake-clock tests: all failed. "a refusal that answers after the window is late", "a sleep that overshoots the window ends the wait without another attempt", "an already expired window makes no attempt", "later probes share the ending of the first", and "a probe that never answers is bounded by the window" (it hung until its 5-second test timeout) failed on the behavior; the other two failed on the new `refusal` field of the result.
- `test/github-conformance.test.ts`, 10 of 25 failed: "the guarded fetch follows no redirect, to any host" (finding 2: the fake fetch followed the redirect to `petarnenov/taskelith` and to an external host); "the long run reports a refusal check that fails with another code than forbidden" and "the long run stops on a malformed probe result" (finding 4); "the evidence scan finds a known secret of any accepted length and through JSON escaping" (finding 5); "the evidence redacts and scans every GitHub token family" (finding 6); "the long run names no payload of a thrown value" (finding 7); "the outer cleanup revokes every minted token once and records each failure" (finding 8, against the stub); "a branch deletion refused with 422 is done only when the ref is gone" and the updated "a cleanup step is done when GitHub reports it done or already done" (finding 9); "a listing beyond the page limit fails instead of returning a part" (finding 10). "the fixture client mints a new token on renewal and the guard witnesses both" passed before the fix, as the guard already saw every mint; it guards finding 8's input.

Findings 11, 12, and 14 change documents and the spec delta, and finding 13 changes tests only, so they have no fail-before test; finding 12's delta archived into strictly valid specs on a scratch copy of `openspec/` (`openspec archive`, then `openspec validate --specs --strict`: 71 passed, 0 failed).

## Coordinator decisions

These are not review findings and are not in `findings.jsonl`; review pass 2 reviews them. `design.md` "Coordinator decisions" gives the reasons.

1. Port version: `0.3.0`, citing the source control contract's draft status rule (section 2, rule 7) and the contracts' "changed meaning" version rule; `REVOCATION_PROPAGATION_SECONDS` stays out of the plugin SDK's `draft` namespace, with a follow-up to expose it (Niki, 2026-11-03).
2. The Octokit rows stay `candidate` in `docs/dependencies.md` and `docs/g3-dependencies.md`, with the live evidence and the open adoption, upgrade, and recovery evidence; the exception sentence is reverted (Niki, 2026-11-03).
3. `docs/qualification/github.md` "Remaining before admission" marks done only three evidenced items, each with its report: token refresh past an hour (`long-2`), private repositories (`live-5`), and narrowing within an installation of several repositories (`live-5`); the rest stays open (Niki, 2026-11-03).
4. The finding-2 probe is worded as an unrecorded observation; the window rests on the recorded endings (Niki, 2026-11-03).
5. `@octokit/plugin-paginate-rest@16.0.0` stays because the cleanup's open pull request listing pages; it and `@octokit/core@7.0.8` are exact root development dependencies; the plugin drops the pagination plugin; the register rows record both. The SBOM, the licenses, and the inventory are regenerated. `npm pack --dry-run` of `taskelith` lists the same five files before and after the change (`LICENSE`, `README.md`, `dist/cli.js`, `docs/architecture.md`, `package.json`); only `package.json`'s `devDependencies` differ (Niki, 2026-11-04).
6. Long-run evidence: `long-1` recorded only each ending's latency, not the code of each refusal, so it cannot be re-judged offline under the fixed rules of findings 3 and 4; it is not claimed as evidence under them. A new long run after the fixes, `long-2`, replaces it (Niki, 2026-11-04).
7. Security fixes: the finding 1 and finding 2 tests reproduce the escapes before the fix; the guard treats any 3xx as a refusal; minted tokens are revoked at cleanup from now on. Tokens of the runs before this fix were not revoked by a cleanup; GitHub ends each installation token at the latest one hour after its mint, so nothing else is needed for them (Niki, 2026-11-04).

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `env -u NODE_ENV make verify` (run 1, before the rebase) | `ea23f250`, clean | Failed in `verify:comments`: three new three-line comments, in `github-conformance-cleanup.ts`, `github-conformance-long-run.ts`, and `github-conformance.ts`. Fixed in `537d76e7`. |
| `env -u NODE_ENV make verify` (run 2, before the rebase) | `2840a8e5`, tree `2a763a75`, clean | Passed, profile full, stamp written. Tests 4433, suites 49, pass 4386, fail 0, cancelled 0, skipped 47. All files: 99.39 % lines, 92.72 % branches, 98.89 % functions. No known flake failed, and nothing was rerun. |
| `env -u NODE_ENV make verify` (run 3, after the rebase) | `fc1aa519`, tree `d2d35096`, clean | Passed at the first attempt, profile full, stamp written. Tests 4669, pass 4622, fail 0, skipped 47. All files: 99.41 % lines, 92.80 % branches, 98.84 % functions. No known flake failed, and nothing was rerun. |
| `test/github-conformance.test.ts` | inside run 2 | 12 tests pass. |
| `npm run openspec -- validate run-github-scm-conformance --strict` | `6b0dedf5` | `Change 'run-github-scm-conformance' is valid` |
| CLI smoke without network | `be5f5567` (before the rebase) | Without the variables, exit 2 names all four. Without arguments, exit 2 prints the usage. With a throwaway generated key and `--out` inside the worktree, exit 2 is refused before any request. |

The new code is development tooling under `scripts/` and `test/`, like `scripts/installation-scenario.ts`, so it is outside the `dist` coverage scope.

### Live runs

All with `make conformance-github`, App ID 5456916, installation 174871289, on hpz600. Each report is in `docs/qualification/github-conformance/`, as the run saved it after its redaction and scan.

| Run | Revision | Result |
| --- | --- | --- |
| `--discover` | before the rebase | project and foreign visible (200), hidden not (404), no problem, no guard refusal. |
| `live-1` | before the rebase, before both fixes | FAIL: 10 findings, guard refusals of the unnarrowed token requests. |
| `live-2` | before the rebase, after fix 1 | FAIL: 2 findings, `adopted credential` and `credential isolation`. |
| `cleanup-1` | `CLEANUP_ONLY=1` after `live-2` | PASS: 0 steps left. |
| `live-3` | before the rebase, after both fixes | PASS: 17 cases, 0 findings, 0 guard refusals, 55 cleanup steps done, 9 min 54 s; slowest ending 10.2 s. |
| `cleanup-2` | `CLEANUP_ONLY=1` after `live-3` | PASS: 0 steps left. |
| `long-1` | `LONG_RUN=1`, before the rebase, after both fixes | PASS: 18 cases, 0 findings, 55 cleanup steps done, 71 min 57 s; four refreshes and adoptions past the original expiry; slowest ending 11.8 s. |
| `live-4` | after the rebase onto `d0d59478` | PASS: 17 cases, 0 findings, 0 guard refusals, 55 cleanup steps done, 9 min 40 s; slowest ending 9.8 s. |
| `cleanup-3` | `CLEANUP_ONLY=1` after `live-4` | PASS: 0 steps left. |
| `live-5` | `fb7b1dc8`, after the pass 1 fixes | PASS: 17 cases, 0 findings, 0 guard refusals, 55 cleanup steps done, 9 min 19 s; slowest ending 9.4 s; 23 tokens: 11 revoked, 12 already ended, 0 failed. |
| `cleanup-4` | `CLEANUP_ONLY=1` after `live-5` | PASS: 0 steps left; 1 token revoked. |
| `long-2` | `LONG_RUN=1`, `eb8451df` with only uncommitted records | PASS: 18 cases, 0 findings, 0 guard refusals, 55 cleanup steps done, 71 min 36 s; four refreshes and adoptions past the original expiry; slowest ending 10.3 s; 29 tokens: 1 revoked, 28 already ended or expired, 0 failed. |

Every ending was refused within the window; the evidence README lists each latency. `long-1` is not re-judged: its report holds only each ending's latency, not the code of each refusal, so `long-2` replaces it as the long-run evidence under the fixed rules of findings 3 and 4. The fix round changed the live path (guard, plugin, cleanup, revocation, long run), so `live-5`, `cleanup-4`, and `long-2` ran after it. The 55 cleanup steps of a run are one protection removal, 13 closed pull requests, and 41 deleted branches.

### Route

Route (`route.json`, rule version 5, routed again in `a018d996`): elevated (lines, files, security, contracts). Pass 1 reviewer A is `codex gpt-6-astra#high`. Pass 2 reviewer B is `claude claude-fable-5-1#high`. Pass 3 reviewer A is `agy gemini-4-argon-medium#medium`, only after a pass 2 with a Medium or worse finding. The shadow router `jev-1.14.0` agrees. The coordinator assigns the reviewers and their effort.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `d2d350965c33cb325a561a0ccb9f1fe80144c651`; tests 4669, pass 4622, fail 0, skipped 47; all files 99.41% lines, 92.80% branches, 98.84% functions.
- `npm run openspec -- validate run-github-scm-conformance --strict`: passed, `Change 'run-github-scm-conformance' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 111 file(s); every pass summary file is valid: 91 file(s); every route file is valid: 44 file(s).`.
- Spec diff against the merge base `d0d594782357` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

- Pass 1, reviewer A: Codex CLI `gpt-6-astra` at effort medium, session `01a1a361-8932-7770-9eac-c24aaf5229a3`, against `d0d59478`: 3 High, 10 Medium, 1 Low. All 14 are fixed in the pass 1 fix round and recorded in `findings.jsonl`; the coordinator's decisions above are listed apart.
- Pass 2 has not run yet.

## Limitations

- The live runs confirmed the fixture's assumptions about GitHub's refusals and the squash title: every case passed. They do not prove a bound on GitHub's propagation delay, which GitHub does not publish; a slower propagation than the window fails the run.
- The probe that timed finding 2 kept no evidence file; it is an unrecorded observation, and the recorded latencies come from the suite's own endings.
- `long-1` is not evidence under the rules of the pass 1 fix round; `long-2` is.
- Tokens minted by the runs before the pass 1 fix round were not all revoked by their cleanup; they ended at GitHub at the latest one hour after their mint.
- The App's installation also covers `petarnenov/taskelith`, so the guard is what keeps the run off that repository.
- Repository names are fixed in code and are not configurable.

## Remaining gates

- Independent review passes 2 and 3 as governance requires.
- Archive of the change.
- Integration into dev by the coordinator (single pull request).
