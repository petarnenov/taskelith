# Verification: repair-archived-record-links

## Scope and source

Owner decision B1 (2026-10-27): repair the archived record links that `check-change-record-links` (#346) baselined, instead of keeping the baseline. Briefed by the coordinator to a worker session and developed by a subagent briefed by it, under [subagent execution](/docs/agent-task-protocol.md#subagent-execution), in the git worktree `../taskelith-worktrees/repair-archived-record-links` on branch `repair-archived-record-links`. Base revision: `56346d92` on `dev`. Scope: link destinations in `openspec/changes/archive/**`, `scripts/check-record-links.ts`, `test/check-record-links.test.ts`, `scripts/record-links-baseline.tsv` (removed), worker step 6 of `docs/agent-task-protocol.md`, `docs/decisions/0015-g2-closure.md` line 140, `docs/foundation.md` line 89, and this change with its rewrite script and empty `findings.jsonl` and `passes.jsonl`. Scope addition by coordinator Niki during the task (2026-10-27): ADR 0015 line 120, the decision 5 follow-up on the in-memory rotation cursor `#after`, keeps its text and gains a resolution note naming `persist-placement-rotation-cursor` and stating that its citation `placement-service.ts:51`, `:85` is stale because that change removed `#after`; when it landed as #349 (merge `eda6c283`), the coordinator asked to cite both without merging `origin/dev`. Mapping fixtures (found by `make verify`, design.md, "Mapping fixtures"): three fixture files, two digests, and the README of the private `@taskelith/sdlc-openspec` package. Exclusions: no other archived text, in particular not the `ext2/ext3` labels of the 25b, 25c, and Linux-host records (#335); no other line of ADR 0015 or `docs/foundation.md`. Commit types `docs` and `chore`: the published package does not change.

## Revision

The change, its delta, and the rewrite script in `4e6a664a`; the archived link repair in `baf368c0`; the baseline removal from the checker, its tests, and worker step 6 in `4c0f79c2`; the ADR 0015 and `docs/foundation.md` notes in `b89580dd`; the mapping fixtures in `fcf9e311`; the #349 citation in `54d2b2d2`; `tasks.md` and this record in the commit after it.

## Environment

Linux 7.0.0-38-generic x86_64, Node.js v24.22.1 from `.nvmrc`, npm 12.2.1, dependencies from `npm ci --ignore-scripts`.

## Links on the base

With `scripts/record-links-baseline.tsv` emptied on `56346d92` (fail-before):

```sh
: > scripts/record-links-baseline.tsv && npm run --silent verify:links
```

Exit code 1, 332 lines of the form `<file>:<line>: relative link leaves the change directory; use a root-relative link: <target>`, and the summary `Record link problems: 332, stale baseline entries: 0; see docs/agent-task-protocol.md step 6.` The baseline was then restored. With it, the check on `56346d92` reported `Every checked link conforms; 332 archived links remain in scripts/record-links-baseline.tsv.`

The 332 problems are in 176 files of 83 of the 199 archived changes, in three categories (design.md, "Context"): 324 one `../` too shallow, 7 that resolve but leave their change directory, and 1 to a change that was active when linked and is now archived.

## Rewrite

From the repository root on `56346d92` plus the script:

```sh
node --experimental-strip-types openspec/changes/repair-archived-record-links/rewrite-archived-links.ts
```

Output:

```text
one level too shallow: 324
active change since archived: 1
leaves the change directory: 7
Rewrote 332 links in 176 files.
```

`git diff --stat 56346d92 baf368c0 -- openspec/changes/archive`: 176 files changed, 244 insertions, 244 deletions. Reproducibility: in a separate detached worktree at `56346d92` with the script of `4e6a664a`, the same command printed the same output, `git diff --quiet baf368c0 -- openspec/changes/archive` exited 0, and a second run printed `Rewrote 0 links in 0 files.`

## Link-only diff check

For each changed archived file, both versions with every inline link destination and reference definition destination removed must be equal:

```sh
strip() { sed -E 's/\]\([^)[:space:]]*/](/g; s/^( {0,3}\[[^]]+\]:)[[:space:]]+[^[:space:]]+/\1/'; }
n=0; bad=0
for f in $(git diff --name-only origin/dev -- openspec/changes/archive); do
  n=$((n+1))
  diff <(git show origin/dev:"$f" | strip) <(strip < "$f") > /dev/null || { bad=$((bad+1)); echo "non-link change: $f"; }
done
echo "files: $n, files with non-link changes: $bad"
```

Result: `files: 176, files with non-link changes: 0`. No original destination contains a parenthesis or space, so `[^)[:space:]]*` covers each whole destination. `git diff origin/dev -- openspec/changes/archive | grep '^+[^+]' | grep -o '](/[^)]*' | wc -l`: 332 root-relative destinations added. `git grep -c 'ext2/ext3'` over `openspec/changes/archive` lists 17 files on `origin/dev` and 17 on this branch; the one diff line holding `ext2/ext3` changes only a link destination on that line, as the check above shows.

## Mapping fixtures

The first `make verify` on `b89580dd` failed in `npm test`. With `TMPDIR` under `/tmp` it reported 322 failures, because this host has an empty `/tmp/.git` directory, not created by this task, so the data root guard treats every temporary data root as inside a Git working tree; every later run sets `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`. With that, 2165 tests ran and 1 failed: `each fixture change is its archived change byte for byte` (`packages/plugins/sdlc-openspec/test/openspec-mapping-fixtures.test.ts`) on `draft-sdlc-framework-port/design.md`. Before the copy, the fixture's `design.md`, `proposal.md`, and `verification.md` equaled the `origin/dev` archive (`cmp`). After copying the rewritten files and replacing the `design.md` and `proposal.md` digests, `node --experimental-strip-types --test packages/plugins/sdlc-openspec/test/*.test.ts packages/plugins/sdlc-speckit/test/*.test.ts` after `npm run build`: 34 of 34 passed, and `git grep` finds neither old digest.

## Author self-check

- Baseline decision: dropped, not kept empty (design.md, "Baseline removed"). The spec delta removes "Record link baseline" and adds the scenario "Archived record" to "Record link check"; worker step 6 and the checker agree that every archived link is checked with no exception list.
- Contract-drift: `git grep -n -i 'record-links-baseline\|baselined'` outside `openspec/changes/archive/` and this change finds only the historical sentences of ADR 0015 line 140, which now notes that this change removed the baseline, and the requirement "Record link baseline" in `openspec/specs/integration-flow/spec.md`, which this change's REMOVED delta deletes on archive. `docs/foundation.md` line 89 names the baseline without the file name and gains the same note.
- Anchors: each rewritten destination keeps its original `#anchor` and names the same file as before, and `npm run verify:links` checks every anchor.
- Comments in the checker and the rewrite script are within the comment length rule.
- Stale citations: the ADR 0015 line 120 note says its earlier citation is stale instead of editing it, as the coordinator asked.

## Checks

On `54d2b2d2` with this record, except the test count of the checker, run on `b89580dd`, whose checker and tests did not change after it:

- `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='scripts/check-record-links.ts' test/check-record-links.test.ts`: 21 of 21 passed (24 before; the 3 baseline tests are removed and the report test is rewritten); 95.45 % lines, 88.79 % branches, 100 % functions.
- `npm run verify:links`: `Every checked link conforms.`
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `npm run openspec -- validate repair-archived-record-links --strict`: `Change 'repair-archived-record-links' is valid`.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` on `54d2b2d2` with this record: exit 0; `npm test` 2165 tests, 2118 passed, 0 failed, 47 skipped, all files 99.24 % lines, 92.22 % branches, 98.92 % functions; `npm run verify:links` `Every checked link conforms.`; `npm run openspec -- validate --all --strict --no-interactive` 70 passed, 0 failed; `npm run verify:findings` 26 findings files and 6 pass summary files valid; `npm run verify:archive` and `npm run verify:package` passed.

## Independent review

Pass 1, reviewer A: Codex CLI `gpt-6-astra`, invoked as `codex exec -m gpt-6-astra -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>` on `0a06da1e` (`56346d92..0a06da1e`). The output header confirmed model `gpt-6-astra`, reasoning effort `medium`, sandbox `read-only`, and session `01a17dbf-8e90-7591-9c30-5cfea401bfe1`. The worktree snapshot was `3b5706a7c286f538b6be7224cb3781cb9d2c8883ecc368ce67595a4ca3cd1274` before and after the pass. Findings: Critical 0, High 0, Medium 0, Low 1, as in `passes.jsonl`.

- Low (evidence-mismatch, this record, "Rewrite"): the recorded `git diff --stat 56346d92 baf368c0` covers the whole tree (184 files, 451 insertions, 576 deletions), not the 176 recorded files. Fixed, unreviewed: the command is limited to `-- openspec/changes/archive`, whose output is 176 files, 244 insertions, 244 deletions.

The reviewer confirmed the 332 rewritten destinations in 176 files of 83 changes, no other changed byte in the archived records, all 60 anchors and the `ext2/ext3` labels preserved, the 324/1/7 split, the baseline removal consistent across checker, tests, delta, and docs, and ADR edits on the allowed lines only. A Low-only pass ends the review ([review process](/docs/governance.md#independent-review-process)), so passes 2 and 3 did not run and the fix is unreviewed.

## Limitations

- The rewrite script is checked by `npm run verify:comments` only; it is not type-checked or covered, as design.md, "Rewrite", explains. Its result is checked by `npm run verify:links`, the link-only diff check, and the reproducibility run.

## Remaining gates

- Integration into dev by the coordinator (single pull request)
