# Verification: adopt-process-performance-recommendations

## Scope and source

A task (size L) from the coordinator's process and token analysis, whose ten recommendations the owner approved on 2026-10-27; Niki briefed it to Pepi, who developed it in a briefed subagent. The coordinator's decisions D1 to D5 bind it, and recommendations 1, 3, 7, and 9 are owner decisions of 2026-10-27 because they change gates or `AGENTS.md`. Scope, decisions, and the review checklist: [proposal.md](proposal.md) and [design.md](design.md). Recommendation 8 needs no edit (`normalize-reviewer-keys` records it), and the flaky test that recommendation 10 names is fixed by `stabilize-workspace-handoff-race-conformance`, not here.

## Revision

- Base: `origin/dev` `10eeab69`.
- Commits, one or more per recommendation, in this order: `5950682a` change documents; `f3e7acaa` recommendation 1 (stamp and `pre-push` skip); `9126d1e1` recommendation 2 (Docker slot); `2a2d413b` recommendation 7 (docs-only profile, `AGENTS.md`); `aa3511cb` `make integrate`; `ba7c290e` recommendation 4 (`make record`); `4f9fdd61` recommendation 3 (conditional pass 3); `4424e155` protocol text for `make integrate`, the profiles, the stamp, and the slot; `f9c971db` recommendations 5 and 6 (context hook, thin sessions, fresh subagents); `f2945283` recommendation 9 (no owner `/clear`); `aefce4e0` recommendation 10 (test-authoring rule); `3bd2360c` a test cleanup; `d718fdb7` `docs/releases.md`; `ef246a1d` this record; `a7da856a` and `db7943dd` the coordinator decisions of 2026-10-27 (tested documentation excluded from the docs-only profile; the unpushed merge, the stamp limitation, and the context estimate recorded); `2e81f539` the review checklist saved as `checklist.json`; `16987d29` the `make verify` record.
- Review pass 1 fixes: `b1201019` Docker slot (findings 2 and 3); `eeece5b3` stamp key and detached HEAD (findings 4 and 13); `deee0864` record generator (findings 10 and 11); `fd663be2` `make integrate` (findings 1, 5, 6, 7, 8, and 9); `6f795c93` protocol and coordinator skill; `31184e8b` design and spec deltas (findings 12 and 15); then this record (finding 14).
- Merges of `origin/dev`: `1cfe104f` (`6b68d6c7`, no conflict); `f93316de` (`14e1a46e`, a conflict in `docs/agent-task-protocol.md` resolved by taking `dev`'s coordinator step 1 and keeping this change's step 2; `dev` changed no requirement that the spec deltas modify); `f726edbf` (`579c227d`, no conflict). The full `make verify` passed on `f726edbf`; `make record` and `make record-check` passed on `16987d29`, whose tree differs from `f726edbf`'s only in this record. The pass 1 fixes have not yet run `make verify`.
- `make verify` of the pass 1 fixes passed on `1089addf`, the merge of `origin/dev` `3f23516a` (no conflict; it changed only the Claude Code reviewer rows of `docs/agent-task-protocol.md` and two living specs that no delta of this change touches); `make record` and `make record-check` passed.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), the coordinator's iMac; Node.js 24.22.1 and npm 12.2.1 through `nvm use`; git 2.33.0; GNU bash 3.2.57; Perl 5.34.1. Docker Desktop for `make verify`, in a slot the coordinator granted; the other checks used no Docker.

## Author self-check

- Stamp (D2): `scripts/verify-stamp.ts:163` keys the stamp on the tree, its merge base with `origin/dev` (`:98`), profile, Node.js and npm versions, the lockfile hash, and the service images; `:234` writes it only for a tree that was clean at the start and unchanged at the end; `:197` and `:213` let a full stamp satisfy docs-only, never the reverse, and refuse reuse under `CI`; `:245` detects a `make -n` dry run, which writes none. `Makefile:36-45` runs `verify-stamped`; `.githooks/pre-push:9` skips `make verify` only on a satisfying stamp.
- Docs-only profile (D1): `scripts/verify-stamp.ts:30` is the path set, without the tested `docs/review-findings/**` and `docs/qualification/**`; `:83` forces the full profile for `CI`, `dev`, `main`, a detached HEAD, `TASKELITH_VERIFY_PROFILE=full`, a missing merge base, and an empty change, and refuses any other value of that variable; `Makefile:50` skips only `make test`.
- Docker slot (D3): `scripts/docker-slot.ts:104` takes a ticket in the bakery's three steps, with a never-reused path; `:156` treats a holder as gone only when its process ID is free or reused and its process group is empty; `:203` and `:220` remove stale tickets and markers and give the slot to the lowest ticket while no run is choosing; `:289` starts the holder as a process group leader and forwards signals to the group, and `:302` holds the slot and removes the ticket; `Makefile:86-92` wraps `make test` and adds `make docker-slot`.
- Integration (D5): `scripts/integrate.sh:38` waits on the pause file, `:45` is the process-group alarm, `:77` checks the main clone, `:94` finds an earlier pull request, `:127-139` checks the archive and merges on the local branch, `:143` requires a clean tree, `:150-165` reuses a full stamp or runs the full `make verify` and then requires the stamp, `:191-202` checks the deletion, `:205` prints `LANDED`; `Makefile:257-267` passes the arguments unexpanded.
- Records: `scripts/verification-record.ts:67` and `:106` read the last complete run's stamped result line, counts, and coverage from the log; `:224` stores the generated line next to the stamp; `:206` rewrites only the text between the markers; `:254` and `:271` recompute every other part and check the stamp, the tree, and the stored line.
- Context hook (D4): `scripts/context-warning.ts:36` takes the newest main-thread usage, with the size estimate as fallback; `:84` prints only the warning line and swallows every failure; `.claude/settings.json` runs it on `UserPromptSubmit` with a 5 s timeout.
- Documents: `docs/governance.md:3` (version 6) and `:35` (conditional pass 3); `docs/agent-task-protocol.md` worker steps 4, 6, 8, 9, and 10, coordinator steps 2 to 4, "Subagent execution", "Test authoring", and "Context size"; `AGENTS.md`, `docs/fleet.md`, `docs/releases.md`, and the three skills. The former wording `git merge --no-commit --no-ff origin/dev` remains only in archived changes and in the living requirement that this change's delta removes.
- Spec deltas: `integration-flow` (two MODIFIED, two ADDED), `development-environment` (one ADDED, one MODIFIED), `agent-task-protocol` (one MODIFIED, one REMOVED, six ADDED), `review-process` (three MODIFIED, one ADDED); every requirement body is at most 491 characters.
- Review checklist of [design.md](design.md): contract-drift, error-handling, redaction, evidence-mismatch, and stale-citation are checked as it states.

## Checks and results

- Fail-before, each new test against the behavior before its commit:
  - `test/pre-push-hook.test.ts` with the base `.githooks/pre-push` and only the two new stamp tests (`--test-name-pattern=stamp`): tests 2, pass 0, fail 2.
  - `test/docker-slot.test.ts` without `scripts/docker-slot.ts`: `ERR_MODULE_NOT_FOUND`, tests 1, pass 0, fail 1; its `Makefile` test with the base `Makefile`: tests 1, pass 0, fail 1.
  - The docs-only `Makefile` test of `test/verify-stamp.test.ts` with the `Makefile` of `9126d1e1`, before the profile: tests 1, pass 0, fail 1. The other tests of that file and of `test/verification-record.test.ts` and `test/context-warning.test.ts` import modules that did not exist before their commits.
  - `test/integrate-script.test.ts` without `scripts/integrate.sh` and with the `Makefile` of `2a2d413b`: tests 9, pass 0, fail 9.
  - The two tested documentation path tests of `test/verify-stamp.test.ts` (`docs/review-findings/categories.txt`, `docs/qualification/speckit.md`) with the `scripts/verify-stamp.ts` of `1cfe104f` (`--test-name-pattern="D1 paths"`): tests 3, pass 1, fail 2.
- After the change, `node --experimental-strip-types --test --experimental-test-coverage` with the four new TypeScript scripts included, over `test/verify-stamp.test.ts`, `test/docker-slot.test.ts`, `test/verification-record.test.ts`, `test/context-warning.test.ts`, `test/pre-push-hook.test.ts`, `test/integrate-script.test.ts`, `test/pre-push-checks.test.ts`, and `test/findings.test.ts`: tests 97, pass 97, fail 0. Coverage: `verify-stamp.ts` 100% lines, 100% branches, 100% functions; `docker-slot.ts` 96.32%, 90.14%, 97.06%; `verification-record.ts` 97.88%, 92.24%, 100%; `context-warning.ts` 98.08%, 97.37%, 100%. `scripts/integrate.sh` is shell and has no coverage figure; its nine tests reach every exit status but 6.
- `npx tsc -p tsconfig.check.json`: no error in the new or changed scripts and tests; its other errors come from the workspace packages, which are not built in this worktree.
- `npm run openspec -- validate adopt-process-performance-recommendations --strict`: valid.
- `npm run openspec -- validate --all --strict --no-interactive`: `Totals: 70 passed, 0 failed (70 items)`.
- `npm run verify:comments`: every comment is within the rule. `npm run verify:links`: every checked link conforms. `npm run verify:findings`: 48 findings files and 28 pass summary files valid. `npm run verify:archive`: every active change archives into strictly valid specs. `npm run verify:dependencies`: 731 package paths verified.
- Not run here: `make contract-compatibility`, which starts the `oasdiff` container, and `make verify`, which needs Docker; the worker runs `make verify`.
- Review pass 1 fixes, on `42f78be3` without Docker:
  - Fail-before, each new test against the scripts, `Makefile`, and tests of `16987d29` in a scratch copy: `test/docker-slot.test.ts` does not load (`CHOOSING` is not exported), and old-API copies of its two new behavior tests fail, the ticket path reused after a release (finding 2) and `first-start, second-start, first-end` for a command that outlives its killed holder (finding 3): tests 2, pass 0, fail 2. Old-API copies of the stamp tests, the same tree on a new merge base reused (finding 4) and a detached HEAD given docs-only (finding 13): tests 2, pass 0, fail 2. `test/verification-record.test.ts --test-name-pattern="only the last complete run|hand edit of the recorded"` (findings 11 and 10): tests 2, pass 0, fail 2. The nine new tests of `test/integrate-script.test.ts` (findings 1, 5, 6, 7, 8, and 9): tests 9, pass 0, fail 9; the alarm test without its message assertion still fails with `process 1273 survived`.
  - After the fixes, `node --experimental-strip-types --test --experimental-test-coverage` with the four new TypeScript scripts included, over the eight test files listed above: tests 117, pass 117, fail 0. Coverage: `verify-stamp.ts` 100% lines, 100% branches, 100% functions; `docker-slot.ts` 98.35%, 94.62%, 98.04%; `verification-record.ts` 98.26%, 92.76%, 100%; `context-warning.ts` 98.08%, 97.37%, 100%. `test/integrate-script.test.ts` has 17 tests and reaches every exit status of `scripts/integrate.sh`.
  - `npx tsc -p tsconfig.check.json`: no error in the changed scripts and tests. `npm run openspec -- validate adopt-process-performance-recommendations --strict`: valid; the longest requirement body is 491 characters. `npm run verify:comments`, `verify:links`, `verify:findings`, and `verify:archive`: pass; their outputs are under "Review pass 1".

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `83772c1a11800cee9ac281d7c27bd666f6f89b75`; tests 2424, pass 2421, fail 0, skipped 3; all files 99.34% lines, 92.28% branches, 99.03% functions.
- `npm run openspec -- validate adopt-process-performance-recommendations --strict`: passed, `Change 'adopt-process-performance-recommendations' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 53 file(s); every pass summary file is valid: 33 file(s).`.
- Spec diff against the merge base `3f23516a2e4e` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a17f4c-3d06-77b2-b410-2f9550f5ebbd` | 0 | 5 | 8 | 2 |
<!-- make record: end -->

## Independent review

Assigned: reviewer A Codex CLI (`gpt-6.1-sol`) for pass 1 and, under the new "Conditional third pass", for pass 3 if it is required; reviewer B Claude Code (`claude-opus-5-5`, effort `high`) for pass 2.

### Review pass 1

- **Reviewer:** A, Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox, run by the worker session from the worktree.
- **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- **Revision:** `16987d29`.
- **Model confirmation:** the output header records `model: gpt-6.1-sol`, `reasoning effort: medium`, `sandbox: read-only`; session `01a17f4c-3d06-77b2-b410-2f9550f5ebbd`.
- **Snapshot:** `8abdcdd96ee51690a01105acc40e7fdf56c32abeee8abd409eb2bdd55273f595` before and after; unchanged.
- **Findings:** 0 Critical, 5 High, 8 Medium, 2 Low, all **fixed** for pass 2 to check; `findings.jsonl` has one line per finding.

| # | Severity | Category | Finding | Fix |
| --- | --- | --- | --- | --- |
| 1 | High | contract-drift | `make integrate` let `make` expand `TITLE` and `BODY`, so `$(shell ...)` ran (`Makefile:259`) | `fd663be2`: raw `$(value ...)` under other names, no `MAKEFLAGS`; a real `make` run proves the arguments arrive as typed |
| 2 | High | concurrency-race | A reused ticket number let two runs hold the Docker slot (`scripts/docker-slot.ts:80`) | `b1201019`: bakery tickets with a choosing marker and never-reused paths; step tests replay the interleaving |
| 3 | High | concurrency-race | Stale recovery freed the slot while the killed holder's command ran (`scripts/docker-slot.ts:119`) | `b1201019`: the holder leads the command's process group; stale only when the process and the group are gone |
| 4 | High | contract-drift | The stamp key omitted the merge base (`scripts/verify-stamp.ts:144`) | `eeece5b3`: the key covers the merge base with `origin/dev`, or `none` |
| 5 | High | error-handling | `make integrate` pushed without a stamp of the merged tree (`scripts/integrate.sh:89`) | `fd663be2`: a clean tree (exit 7) and a full stamp after `make verify` (exit 4) before the push |
| 6 | Medium | error-handling | The alarm left the verify run's children running (`scripts/integrate.sh:46`) | `fd663be2`: a process-group supervisor stops the whole group and waits; tested for survivors |
| 7 | Medium | error-handling | A failed delete push or `ls-remote` looked like a deleted branch (`scripts/integrate.sh:104`) | `fd663be2`: exit 6 for a remaining branch, exit 9 for an unconfirmed deletion |
| 8 | Medium | error-handling | A resume opened a second pull request (`scripts/integrate.sh:96`) | `fd663be2`: `gh pr list` finds the open or merged pull request |
| 9 | Medium | error-handling | The main clone was not checked before remote changes (`scripts/integrate.sh:54`) | `fd663be2`: `MAIN NOT READY`, exit 8, unless on a clean, fast-forwardable `dev` |
| 10 | Medium | evidence-mismatch | `make record-check` accepted edited counts and coverage (`scripts/verification-record.ts:216`) | `deee0864`: the recorded line must equal the one `make record` stored next to the stamp |
| 11 | Medium | evidence-mismatch | The log parser mixed runs and accepted a failure after the stamp (`scripts/verification-record.ts:65`) | `deee0864`: only the last run, ending the log, with consistent totals |
| 12 | Medium | contract-drift | "Integration tests in verification" still required `npm test` in every `make verify` | `31184e8b`: a MODIFIED delta limits it to the full profile |
| 13 | Medium | contract-drift | A detached HEAD could get the docs-only profile (`scripts/verify-stamp.ts:85`) | `eeece5b3`: a detached HEAD is full |
| 14 | Low | evidence-mismatch | This record listed passed gates as remaining and missed `16987d29` | `42f78be3`: revision, ticks, gates, and citations updated |
| 15 | Low | docs | The design said CI is never stamped | `31184e8b`: "CI never reuses a stamp" |

- **Checks after the fixes:** under "Checks and results"; `npm run verify:comments`: every comment is within the rule; `npm run verify:links`: every checked link conforms; `npm run verify:findings`: 50 findings files and 30 pass summary files valid; `npm run verify:archive`: every active change archives into strictly valid specs; `npm run openspec -- validate --all --strict --no-interactive`: `Totals: 70 passed, 0 failed (70 items)`. The generated part above still shows the state of `f726edbf` and no review pass; `make record` after the next `make verify` regenerates it.
- **Note, found after pass 1:** `make record` and `make record-check` let `make` expand `CHANGE` and `LOG`, the class of finding 1; the worker found it after pass 1, not a reviewer, so `findings.jsonl` has no line for it. The fix applies the `make integrate` pattern, and a real `make` run in `test/verification-record.test.ts` proves the arguments arrive as typed (it fails against the old `Makefile`: `make record ran a $(shell) of the arguments`). It is unreviewed until pass 2.

## Limitations

- `make integrate` was never run against GitHub; its tests use a local bare origin and stubs of `make`, `npm`, and `gh`.
- A stamp is local to one clone, so another machine runs `make verify` again. The stamp rarely spares a worker's handoff push: once the worker records the `make verify` result in `verification.md`, the tree differs from the stamped one, so the handoff push still runs `make verify`.
- A change under `docs/review-findings/**` or `docs/qualification/**`, which tests read, gets the full profile; a test that reads another file under `docs/` runs on a docs-only branch only in the full `make verify` at integration.
- The Docker slot holder runs in a new session (Node.js `detached: true`, `setsid`), so the wrapped command has no controlling terminal; `services.sh` needs none. A new process group in the same session (Perl `setpgrp`) was rejected for its `SIGTTOU` and `SIGTTIN` risk; the worker (Pepi) decided this.
- The stamp key does not cover the branch's own history: two histories with the same tree and merge base with `origin/dev` count as equivalent, a theoretical residual of finding 4 for the findings validation, which reads branch commits. Keying on the HEAD commit would defeat stamp reuse across the record commit and is not adopted.
- The context hook depends on Claude Code's transcript format; it was tried once, read-only, against a real transcript on this machine.

## Follow-ups

- `pre-push` accepts a full stamp whose tree differs from HEAD only in the change's `verification.md` and runs only the non-Docker checks; this needs an owner decision.

## Remaining gates

- Independent review: pass 2 (reviewer B), and pass 3 if "Conditional third pass" requires it
- Archive of the change
- Integration into dev by the coordinator (single pull request)
