# Verification

Date: 2026-11-03. The author's verification and `make verify` are recorded below. No review pass ran (owner decision, 2026-11-02).

## Scope and source

The coordinator's brief (Niki) for the change `use-same-reviewers-for-network-tasks`, size S-M, commit type `chore`, from the owner's correction of 2026-11-02: a task that needs network access uses the same reviewer order as every task, pass 1 `codex gpt-6-astra#medium` (role A), pass 2 `claude claude-fable-5-1#medium` (role B), and pass 3 `agy gemini-4-argon-medium#medium` (role A). The networked reviewers of policy version 10, `claude claude-fable-5-1#medium` for pass 1 and `claude claude-opus-5-5#medium` for pass 2, are withdrawn. Governance policy version 11 applies from the correction to every pass of such a task that had not started, before version 11 reaches `dev`. The brief also asked to remove the expired rows of "Reviewer pauses" in `docs/agent-task-protocol.md`.

- **Base revision:** `26697ab0` (`origin/dev`, merge of pull request #419).
- **Checklist:** saved with `make findings ARGS="checklist --capability review-process --files scripts/review-*.ts --save use-same-reviewers-for-network-tasks --at 26697ab03a2198d955ea7f8b5b4ff61ca20d99b1 --size S-M"`.
- **Route:** no `route.json`; the route only recommends the reviewers and efforts of review passes, and this change has none.

## Environment

macOS (Darwin 25.6.0), Node.js from `.nvmrc` through nvm.

## Author self-check

- **One assignment.** After the change, `git grep -n 'opus-5-5' -- ':!openspec/changes/archive'` names Claude Code (claude-opus-5-5) for a network task only in history: its authorized reviewer entry ("until the owner withdrew that on 2026-11-02"), the network task paragraph of governance, its invocation row ("from 2026-10-29 to 2026-11-02"), its invocation keys in `scripts/reviewer-invocations.ts` and its legacy alias in `scripts/reviewer-keys.ts`, the rule version 1 to 4 tables, which archived records use, the living spec until this delta is archived, and tests of versioned records and of `make review` fixtures.
- **Rule version 5.** `scripts/review-route.ts` adds `REVIEWER_TABLE_V5` in the idiom of versions 1 to 4: `networkedReviewer` equals `reviewer` for every pass (astra, fable, argon), efforts as in version 4. The thresholds of version 5 are those of versions 1 to 4. The `networkedReviewer` field and the external facts signal stay, because versions 1 to 4 use them.
- **External facts.** Governance "External facts" required network access for every pass; it now names pass 1 as the exception that "Reviewer assignment" sets, and keeps network access for a replacement in any pass, so the spec scenarios "Replacement needs network access" and "Reviewer that cannot meet the requirements" stay valid. The fact that Codex has no network access in its configuration, so pass 1 cannot check external facts, is stated once in the network task paragraph of "Reviewer assignment"; the spec scenario "Review depends on external facts" states it too.
- **Shared-harness exception.** With the network rows gone, passes 1 to 3 of every task have three different harnesses, so the accepted exception for passes 1 and 2 of a network task is removed from governance and the spec.
- **Compatibility.** Versions 1 to 4 keep their tables; `test/review-route-rules.test.ts` "rule version 4 keeps its reviewer table" checks version 4, and `make findings ARGS="validate"` checks the archived `route.json` files against their versions. `docs/review-findings/route.schema.json` already accepts rule version 2 and later.
- **Policy version.** `GOVERNANCE_POLICY_VERSION` is 11, and the test "the policy version that make review names is the governance one" compares it with `docs/governance.md`.
- **Reviewer pauses.** All rows had ended (Antigravity CLI about 2026-10-31 13:25, the four OpenCode reviewers about 2026-11-02 02:00); the section stays, because governance "Unavailable reviewer" links it, with "No pause is in force."
- **Spec.** Three modified requirements; the scenario names stay, and "Rule routing floor" adds "Record of rule version 4".
- New comments are at most two lines of at most 80 characters; the commit type is `chore`, without attribution.

## Evidence check

- **External facts.** None.
- **Links.** The records link only inside the change directory or root-relative.

## Fail-before

With the tests updated and `scripts/` not yet changed, the route and review tests failed 9 of 224, among them "the reviewer table of rule version 5 plans a networked change as any other" (`RULE_VERSION` 4, and fable and opus for passes 1 and 2 with external facts), "a small change with external facts gets the standard plan", "rule versions 1 to 5 share the thresholds", and "the route recommendation tells an effort apart from another reviewer" (policy version 10). With `scripts/` and `docs/governance.md` changed, all pass.

## Checks

- `node --experimental-strip-types --test test/review-route*.test.ts test/findings-route.test.ts test/review-run.test.ts test/reviewer-invocations.test.ts test/findings.test.ts`: 262 of 262 passed.
- `npm run openspec -- validate use-same-reviewers-for-network-tasks --strict`: `Change 'use-same-reviewers-for-network-tasks' is valid`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `make verify` on the implementation commit (tree `6e6cc664`): the first two runs failed 1 of 4091 in `packages/adapters/postgres/test/fleet-conformance.integration.test.ts`, "a token that expires while its use waits for the row lock enrolls nothing" (`false` against `'token-expired'`: the enrollment succeeded), a timing-bound test that this change does not touch, with a 1 s token expiry measured by the host clock and checked by the database in Docker; the host's load average was about 8 to 11. The brief allowed one rerun; after the second failure a third run passed, recorded below.

## Archive checks

Run on the working tree of the archive commit, before this section was written (tree `597eef3008c3e3ed06912c83e3959f54956fccd8`):

- `npm run openspec -- archive use-same-reviewers-for-network-tasks --yes`: `review-process` 3 requirements modified; archived as `2026-11-03-use-same-reviewers-for-network-tasks`.
- `npm run openspec -- validate --all --strict`: 71 passed, 0 failed.
- `npm run openspec -- validate --archived --no-interactive`: `✓ change/2026-11-03-use-same-reviewers-for-network-tasks`.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only `openspec/specs/review-process/spec.md`, the three modified requirements and the scenario "Record of rule version 4" (8 insertions, 4 deletions).
- The moved change has `findings.jsonl` and `passes.jsonl`, both empty; `make findings ARGS="validate"`: `Every findings file is valid: 96 file(s); every pass summary file is valid: 76 file(s); every route file is valid: 29 file(s).`
- `make verify`: passed, profile full, uncommitted working tree, tests 4091, pass 4082, fail 0, skipped 9; all files 99.39% lines, 92.57% branches, 98.87% functions.

## Review

No independent review (owner decision 2026-11-02); coordinator architect check.

- Architect check by the coordinator (Niki), 2026-11-03: passed. REVIEWER_TABLE_V5 names astra, fable and argon for both reviewer columns with the V4 efforts; V1-V4 are unchanged; the amended "External facts" rule matches the owner correction; governance, protocol, AGENTS.md and both skills agree.

`passes.jsonl` and `findings.jsonl` are empty: no reviewer ran.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `6e6cc6644f89558704bbea03bdcf83aafa51f8c5`; tests 4091, pass 4082, fail 0, skipped 9; all files 99.39% lines, 92.57% branches, 98.87% functions.
- `npm run openspec -- validate use-same-reviewers-for-network-tasks --strict`: passed, `Change 'use-same-reviewers-for-network-tasks' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 96 file(s); every pass summary file is valid: 76 file(s); every route file is valid: 29 file(s).`.
- Spec diff against the merge base `26697ab03a21` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Limitations

- No independent review pass, by the owner's decision.
- Pass 1 of a task that needs network access cannot check external facts, by the owner's correction.

## Remaining gates

- Architect check by the coordinator (Niki).
- Integration into dev by the coordinator (single pull request).
