# Verification: adopt-process-performance-recommendations

## Scope and source

A task (size L) from the coordinator's process and token analysis, whose ten recommendations the owner approved on 2026-10-27; Niki briefed it to Pepi, who developed it in a briefed subagent. The coordinator's decisions D1 to D5 bind it, and recommendations 1, 3, 7, and 9 are owner decisions of 2026-10-27 because they change gates or `AGENTS.md`. Scope, decisions, and the review checklist: [proposal.md](proposal.md) and [design.md](design.md). Recommendation 8 needs no edit (`normalize-reviewer-keys` records it), and the flaky test that recommendation 10 names is fixed by `stabilize-workspace-handoff-race-conformance`, not here.

## Revision

- Base: `origin/dev` `10eeab69`.
- Commits, one or more per recommendation, in this order: `5950682a` change documents; `f3e7acaa` recommendation 1 (stamp and `pre-push` skip); `9126d1e1` recommendation 2 (Docker slot); `2a2d413b` recommendation 7 (docs-only profile, `AGENTS.md`); `aa3511cb` `make integrate`; `ba7c290e` recommendation 4 (`make record`); `4f9fdd61` recommendation 3 (conditional pass 3); `4424e155` protocol text for `make integrate`, the profiles, the stamp, and the slot; `f9c971db` recommendations 5 and 6 (context hook, thin sessions, fresh subagents); `f2945283` recommendation 9 (no owner `/clear`); `aefce4e0` recommendation 10 (test-authoring rule); `3bd2360c` a test cleanup; `d718fdb7` `docs/releases.md`; `ef246a1d` this record; `a7da856a` and `db7943dd` the coordinator decisions of 2026-10-27 (tested documentation excluded from the docs-only profile; the unpushed merge, the stamp limitation, and the context estimate recorded); `2e81f539` the review checklist saved as `checklist.json`.
- Merges of `origin/dev`: `1cfe104f` (`6b68d6c7`, no conflict); `f93316de` (`14e1a46e`, a conflict in `docs/agent-task-protocol.md` resolved by taking `dev`'s coordinator step 1 and keeping this change's step 2; `dev` changed no requirement that the spec deltas modify); `f726edbf` (`579c227d`, no conflict). `make verify` ran on `f726edbf`.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), the coordinator's iMac; Node.js 24.22.1 and npm 12.2.1 through `nvm use`; git 2.33.0; GNU bash 3.2.57; Perl 5.34.1. Docker Desktop for `make verify`, in a slot the coordinator granted; the other checks used no Docker.

## Author self-check

- Stamp (D2): `scripts/verify-stamp.ts:144` keys the stamp on the tree, profile, Node.js and npm versions, the lockfile hash, and the service images; `:214` writes it only for a tree that was clean at the start and unchanged at the end; `:194` lets a full stamp satisfy docs-only, never the reverse, and refuses under `CI`; `:225` writes none in a `make -n` dry run. `Makefile:36-45` runs `verify-stamped`; `.githooks/pre-push:9` skips `make verify` only on a satisfying stamp.
- Docs-only profile (D1): `scripts/verify-stamp.ts:29` is the path set, without the tested `docs/review-findings/**` and `docs/qualification/**`; `:82` forces the full profile for `CI`, `dev`, `main`, `TASKELITH_VERIFY_PROFILE=full`, a missing merge base, and an empty change, and refuses any other value of that variable; `Makefile:50` skips only `make test`.
- Docker slot (D3): `scripts/docker-slot.ts:77` takes `mkdir` tickets, `:116` treats a dead process, a reused process ID, and an old unrecorded ticket as stale, `:165` waits first in, first out and reports each new holder, `:208` forwards signals and removes the ticket; `Makefile:86-92` wraps `make test` and adds `make docker-slot`.
- Integration (D5): `scripts/integrate.sh:38` waits on the pause file, `:44` sets the alarm, `:70-82` checks the archive and merges on the local branch, `:84-92` reuses a full stamp or runs the full `make verify`, `:110` prints `LANDED`; `Makefile:257-259` passes the arguments through the environment.
- Records: `scripts/verification-record.ts:64` reads the stamped result line, counts, and coverage from the log; `:177` rewrites only the text between the markers; `:210` recomputes every other part and checks the stamp and the tree.
- Context hook (D4): `scripts/context-warning.ts:36` takes the newest main-thread usage, with the size estimate as fallback; `:84` prints only the warning line and swallows every failure; `.claude/settings.json` runs it on `UserPromptSubmit` with a 5 s timeout.
- Documents: `docs/governance.md:3` (version 6) and `:35` (conditional pass 3); `docs/agent-task-protocol.md` worker steps 4, 6, 8, 9, and 10, coordinator steps 2 to 4, "Subagent execution", "Test authoring", and "Context size"; `AGENTS.md`, `docs/fleet.md`, `docs/releases.md`, and the three skills. The former wording `git merge --no-commit --no-ff origin/dev` remains only in archived changes and in the living requirement that this change's delta removes.
- Spec deltas: `integration-flow` (two MODIFIED, two ADDED), `development-environment` (one ADDED), `agent-task-protocol` (one MODIFIED, one REMOVED, six ADDED), `review-process` (three MODIFIED, one ADDED); every requirement body is at most 491 characters.
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

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `de5a07028782e9a60d937c93d94008248ea0114a`; tests 2403, pass 2400, fail 0, skipped 3; all files 99.34% lines, 92.28% branches, 99.03% functions.
- `npm run openspec -- validate adopt-process-performance-recommendations --strict`: passed, `Change 'adopt-process-performance-recommendations' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 50 file(s); every pass summary file is valid: 30 file(s).`.
- Spec diff against the merge base `579c227d5593` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Pending. Assigned: reviewer A Codex CLI (`gpt-6.1-sol`) for pass 1 and, under the new "Conditional third pass", for pass 3 if it is required; reviewer B Claude Code (`claude-opus-5-5`, effort `high`) for pass 2.

## Limitations

- `make integrate` was never run against GitHub; its tests use a local bare origin and stubs of `make`, `npm`, and `gh`.
- A stamp is local to one clone, so another machine runs `make verify` again. The stamp rarely spares a worker's handoff push: once the worker records the `make verify` result in `verification.md`, the tree differs from the stamped one, so the handoff push still runs `make verify`.
- A change under `docs/review-findings/**` or `docs/qualification/**`, which tests read, gets the full profile; a test that reads another file under `docs/` runs on a docs-only branch only in the full `make verify` at integration.
- The context hook depends on Claude Code's transcript format; it was tried once, read-only, against a real transcript on this machine.

## Follow-ups

- `pre-push` accepts a full stamp whose tree differs from HEAD only in the change's `verification.md` and runs only the non-Docker checks; this needs an owner decision.

## Remaining gates

- `make verify` (Docker) by the worker, then `make record CHANGE=adopt-process-performance-recommendations LOG=<log>` and `make record-check CHANGE=adopt-process-performance-recommendations`
- Independent review: pass 1 (reviewer A), pass 2 (reviewer B), and pass 3 if "Conditional third pass" requires it
- Archive of the change
- Integration into dev by the coordinator (single pull request)
