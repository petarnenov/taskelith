## Context

`npm run verify:links` (#346) checks every Markdown link under `openspec/changes/`, `openspec/specs/`, and `docs/`, and checks an archived record's relative link against its change directory. On `dev` at `56346d92` all 332 baselined links fail as relative links that leave their change directory. Resolved from the record's archived directory and, failing that, from the active directory it was written in (one level up), they fall into three categories:

- 324 are one `../` too shallow: they resolve from the active directory, 323 from #346's count and 1 from #344.
- 7 resolve as written but leave their change directory: 5 to `docs/` with `../../../../` and 2 to the sibling archived change `2026-10-27-run-g2-native-acceptance-x86-64`.
- 1, `../run-g2-failure-scenarios-composition/verification.md` in `2026-10-26-harden-worker-container-seccomp/verification.md`, links a change that was active when written and is archived as `2026-10-26-run-g2-failure-scenarios-composition`.

## Goals / Non-Goals

**Goals:** every archived link resolves under the #346 rule, reproducibly, with no other byte of an archived record changed; no baseline remains.

**Non-Goals:** editing archived text other than link destinations, including the `ext2/ext3` labels of the 25b, 25c, and Linux-host records (#335); changing the link rule itself.

## Decisions

### Rewrite

`rewrite-archived-links.ts` runs from the repository root: `node --experimental-strip-types openspec/changes/repair-archived-record-links/rewrite-archived-links.ts`. It imports `findLinkProblems` and `localDate` from `scripts/check-record-links.ts` by the working directory, so it keeps working after this change is archived one level deeper. For each problem it requires an archived record, resolves the target in the order of the three categories above, and fails on a link it cannot resolve. It writes `/` plus the resolved repository path, followed by the original `#anchor`, so the anchor still names the same heading of the same file. It replaces only the destination text after the `](` or `]: ` of that link, searching from the link's line. A second run finds no problem and changes nothing.

The script lives in this change directory, not under `scripts/`: it is a one-off migration, and the change record keeps it next to its evidence. Under `scripts/` it would be a permanent tool that nothing runs again. Its comments follow the comment length rule, which `npm run verify:comments` checks for every tracked `*.ts` file. It is not in the `tsconfig.check.json` type check, which covers `scripts/**` and `test/**`, nor in coverage, which covers built product modules.

Root-relative links rather than one more `../`: worker step 6 requires root-relative links out of a change directory, and the checker rejects relative ones that leave it, so one more `../` would still fail.

### Baseline removed

The baseline is dropped rather than kept with zero entries. The spec required that it only lists links that failed when the check was introduced and fails on stale entries, so once empty it can never hold an entry again; keeping it would leave dead code, three tests, a file, and a requirement that describe nothing. A link that later fails in an archived record is fixed in that record, as decision B1 now allows. The checker loses `BASELINE_PATH`, `BaselineEntry`, `BaselineResult`, `parseBaseline`, `baselineLine`, and `applyBaseline`; its report lists every problem or prints `Every checked link conforms.`. The requirement "Record link baseline" is removed, and "Record link check" gains a scenario stating that an archived record's failing link fails the check.

## Risks / Trade-offs

- Archived records change, which #346 avoided. The owner accepted this with decision B1; the link-only diff check in `verification.md` shows that only link destinations change.
- Root-relative links render on GitHub but not in every local Markdown viewer; this is the #346 convention.

## Review checklist

Printed by `make findings ARGS="checklist --capability agent-task-protocol,review-process,integration-flow --files scripts/**,openspec/changes/archive/**"`:

```text
Review checklist (capabilities agent-task-protocol, review-process, integration-flow; files scripts/**, openspec/changes/archive/**), most frequent finding categories first:
1. contract-drift (14): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
2. redaction (5): A secret or private value can leak into output, logs, or records. Example: "The NATS seed pattern misses server, cluster, and curve seeds"
3. docs (4): Documentation is missing, wrong, or out of date with the change. Example: "The safe-to-retry conflict with the supervisor identity contract was recorded only as a limitation"
4. error-handling (4): A failure is swallowed, misreported, or leaves inconsistent state. Example: "The Linux crash windows script mounted the services secrets without checking that their variable is set"
5. process (4): A protocol, governance, or review rule was not followed. Example: "The independent review section was a placeholder naming the reviewer that never ran"
6. stale-citation (3): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
7. evidence-mismatch (2): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. docs (25): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
2. evidence-mismatch (24): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
3. stale-citation (14): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
4. spec-wording (12): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
5. contract-drift (5): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
6. process (3): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
```
