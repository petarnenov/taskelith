# Verification: refresh-g3-dependency-observations

## Scope and source

Follow-up `refresh-g3-dependency-observations` (size S) of G3 item 0, assigned by the coordinator, Niki, on 2026-10-27. Documentation only: no runtime impact. Source: the five Low findings of item 1 pass 1 (Claude Code `claude-fable-5-1`, session `e1f52752-9f08-49d4-b3a8-211f677b68dd`) in the archived revalidation, all `deferred` to this change:

- [`findings.jsonl`](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/findings.jsonl), lines 11 to 15, which are pass 1 L1 to L5 in that order.
- [`verification.md`](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md#item-1), "Item 1", lines 119 to 123, and the follow-up row at line 59.

| Finding | `findings.jsonl` line | Title (quoted) | Row named | Edited lines |
| --- | --- | --- | --- | --- |
| L1 | 11 | "The Claude Agent SDK record names 0.3.310 as latest and 35 CLI advisories, while 0.3.311 and a 36th advisory appeared on 2026-10-26" | `docs/g3-dependencies.md:92` | `docs/g3-dependencies.md:92`, `:98`; `docs/dependencies.md:132` |
| L2 | 12 | "Mantine 9.7.4 superseded the recorded 9.7.3 on the evaluation date" | `docs/g3-dependencies.md:38` | `docs/g3-dependencies.md:40`; `docs/dependencies.md:141` |
| L3 | 13 | "The TanStack Query record names 5.104.5 as latest, while 5.105.0 appeared on 2026-10-26" | `docs/g3-dependencies.md:23` | `docs/g3-dependencies.md:15`, `:23`; `docs/dependencies.md:140` |
| L4 | 14 | "The Vitest row omits two advisories of the mocker package from the same batch, both fixed before the evaluated version" | `docs/g3-dependencies.md:21` | `docs/g3-dependencies.md:21`; `docs/dependencies.md:138` |
| L5 | 15 | "The Vite row does not name the newest advisory, which affects only an older major line" | `docs/g3-dependencies.md:20` | `docs/g3-dependencies.md:20`; `docs/dependencies.md:137` |

`docs/g3-dependencies.md:7` and `docs/dependencies.md:132` also name the 2026-10-27 observations as the exception to "accessed on 2026-10-25" ([design](design.md) D1). Line numbers are those of this branch; the edits add no lines.

## Revision

- Base: `origin/dev` `4cbea974` (#362).
- Reviewed revision: to be recorded with review pass 1.

## Environment

- Host: Linux 7.0.0-38-generic x86_64. Node.js v24.22.1 (`.nvmrc` 24.22.1), npm 12.2.1.
- Network: the npm registry, the GitHub REST API through `gh api` on github.com, and the npm bulk advisory endpoint, all reached directly.
- Reviewers: the coordinator assigned two Claude Code models, reviewer A `claude-fable-5-1` and reviewer B `claude-opus-5-5` with effort high. Reason, from the coordinator: the task needs network access to re-observe primary sources, and Codex has none, so both reviewers are Claude Code models.

## Observations

All on 2026-10-27; the time is the UTC time at which the command that produced the fact finished. The npm registry, the GitHub advisory APIs, and the bulk endpoint are unversioned services.

| Package | Field | Old value (docs, 2026-10-25) | New value | Source | Observed at (UTC) |
| --- | --- | --- | --- | --- | --- |
| `@anthropic-ai/claude-agent-sdk` | `latest` dist-tag | `0.3.310`, 2026-10-23T21:21Z, CLI 2.1.310 | `0.3.311`, 2026-10-26T19:49:59.951Z, `claudeCodeVersion` 2.1.311 | `https://registry.npmjs.org/@anthropic-ai%2Fclaude-agent-sdk` (`dist-tags`, `time`, `versions["0.3.311"].claudeCodeVersion`) | 18:41:33 |
| `@anthropic-ai/claude-agent-sdk` | `next` dist-tag | not recorded | `0.3.312`, 2026-10-27T18:37:18.402Z, `claudeCodeVersion` 2.1.312 | same | 18:41:33 |
| `@anthropic-ai/claude-code` | dist-tags | `stable` 2.1.308, `latest` 2.1.310 | `stable` 2.1.308, `latest` 2.1.311 (2026-10-26T19:47:57.395Z), `next` 2.1.312 | `https://registry.npmjs.org/@anthropic-ai%2Fclaude-code` | 18:41:33 |
| `@anthropic-ai/claude-code` | repository advisories | 35, all fixed; highest fix 2.1.260 (GHSA-gfvf-j8jh-jxxw); most recent high GHSA-pq7j-f95f-qfcv, fixed in 2.1.179 | 36, all `published` with a patched version; highest fix still 2.1.260 (GHSA-gfvf-j8jh-jxxw); most recent high GHSA-5xjx-9qx6-jcrv, published 2026-10-26T11:43:04Z, `< 2.1.251`, fixed in 2.1.251; 35 were published before 2026-10-25 | `gh api /repos/anthropics/claude-code/security-advisories` | 18:41:47 |
| `@anthropic-ai/claude-agent-sdk` | advisories | none | none: 0 in the GitHub Advisory Database, 0 repository advisories, `{}` from the bulk endpoint for 0.3.308, 0.3.310, and 0.3.311 | `gh api /advisories?ecosystem=npm&affects=…`; `gh api /repos/anthropics/claude-agent-sdk-typescript/security-advisories`; bulk endpoint | 18:42:32, 18:43:00, 18:43:58 |
| `@mantine/core`, `@mantine/hooks` | `latest` dist-tag | `9.7.3` (2026-10-17) | `9.7.4`: core 2026-10-25T20:15:13.203Z, hooks 2026-10-25T20:14:28.018Z | `https://registry.npmjs.org/@mantine%2Fcore`, `…/@mantine%2Fhooks` | 18:41:33 |
| `@tanstack/react-query`, `@tanstack/query-core` | `latest` dist-tag | `5.104.5` (2026-10-19) | `5.105.0`: react-query 2026-10-26T09:31:29.126Z, query-core 2026-10-26T09:31:24.687Z | `https://registry.npmjs.org/@tanstack%2Freact-query`, `…/@tanstack%2Fquery-core` | 18:41:33 |
| `@vitest/mocker` | advisories | not named | GHSA-xp26-3454-mjgp (medium): `>= 4.1.11, < 4.1.12` fixed 4.1.12 and `>= 5.0.0-rc.2, < 5.0.3` fixed 5.0.3; GHSA-qxg6-89mg-rqv8 (medium): `>= 2.1.0-beta.7, < 4.1.12` fixed 4.1.12 and `>= 5.0.0-beta.1, < 5.0.3` fixed 5.0.3. Repository advisories published 2026-10-16T07:59:32Z and 07:59:50Z, next to GHSA-p458-7748-mcp3 at 07:59:59Z; they list only the 4.1 ranges | `gh api /advisories?ecosystem=npm&affects=@vitest/mocker`; `gh api /repos/vitest-dev/vitest/security-advisories` | 18:42:32, 18:42:41 |
| `vitest@5.0.5` | `@vitest/mocker` dependency | not recorded | `5.0.5`; the bulk endpoint returns `{}` for `@vitest/mocker` 5.0.5 and both advisories for 5.0.2 | registry document of `vitest`; bulk endpoint | 18:42:41, 18:42:51, 18:43:58 |
| `vite` | newest repository advisory | GHSA-rq7h-c2jc-7f22, GHSA-vfpm-58rq-9qcg, GHSA-9jrq-w75r-8gcw (2026-10-06) named as most recent | GHSA-8g5g-mxqh-grgj (medium), published 2026-10-21T05:36:46Z, range `6.4.4`, fixed in 6.4.5, no CVE; not in the GitHub Advisory Database (`gh api /advisories/GHSA-8g5g-mxqh-grgj`: 404), and the bulk endpoint returns `{}` for `vite` 6.4.4. The three 2026-10-06 advisories stay the newest affecting 8.x | `gh api /repos/vitejs/vite/security-advisories` | 18:42:41, 18:43:00, 18:43:58 |
| `vite`, `vitest` | `latest` dist-tag | `8.3.5`, `5.0.5` | unchanged | registry documents | 18:41:33 |

Advisory pages: [GHSA-5xjx-9qx6-jcrv](https://github.com/anthropics/claude-code/security/advisories/GHSA-5xjx-9qx6-jcrv), [GHSA-xp26-3454-mjgp](https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp), [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8), and [GHSA-8g5g-mxqh-grgj](https://github.com/vitejs/vite/security/advisories/GHSA-8g5g-mxqh-grgj), accessed 2026-10-27.

## Commands

Run in a scratch directory outside the worktree; the downloaded JSON stayed there.

1. `npm view <pkg> dist-tags --json` for each package (started 18:41:17Z): it printed each `dist-tags` object wrapped in an array, the same values as below, so the `time` field was read from the registry documents instead.
2. `curl -s -H 'Accept: application/json' https://registry.npmjs.org/<pkg>` for `@mantine/core`, `@mantine/hooks`, `@tanstack/react-query`, `@tanstack/query-core`, `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/claude-code`, `vite`, `vitest`, and `@vitest/mocker`, printing `dist-tags` and each `time` entry from 2026-10-14 (finished 18:41:33Z). Key output: `@anthropic-ai/claude-agent-sdk {'next': '0.3.312', 'latest': '0.3.311'}`, `0.3.311 2026-10-26T19:49:59.951Z`; `@mantine/core … 'latest': '9.7.4'`, `9.7.4 2026-10-25T20:15:13.203Z`; `@tanstack/react-query … 'latest': '5.105.0'`, `5.105.0 2026-10-26T09:31:29.126Z`.
3. From the SDK document, `versions[v].claudeCodeVersion`: `0.3.310 2.1.310`, `0.3.311 2.1.311`, `0.3.312 2.1.312`.
4. `gh api -X GET /repos/anthropics/claude-code/security-advisories -f per_page=100 --paginate` (18:41:47Z): `36 {'published'}`; highest patched `2.1.260` (`GHSA-gfvf-j8jh-jxxw`); no advisory without a patched version; newest high `('2026-10-26T11:43:04Z', 'GHSA-5xjx-9qx6-jcrv', 'high', ['2.1.251'])`; 35 published before 2026-10-25.
5. `gh api -X GET /advisories -f ecosystem=npm -f affects=<pkg> -f per_page=100 --paginate` for `vite`, `vitest`, `@vitest/mocker`, `@vitest/ui`, `@vitest/browser`, `@anthropic-ai/claude-agent-sdk`, `@tanstack/react-query`, `@mantine/core`, and `@mantine/hooks` (18:42:32Z): `@vitest/mocker` 3 advisories, the newest two `GHSA-xp26-3454-mjgp` and `GHSA-qxg6-89mg-rqv8` with the 5.x ranges fixed in `5.0.3`; 0 for the SDK, TanStack Query, and both Mantine packages.
6. `gh api -X GET /repos/<owner>/<repo>/security-advisories -f per_page=100 --paginate` for `vitejs/vite` (23) and `vitest-dev/vitest` (10) (18:42:41Z): the newest `vite` advisory `GHSA-8g5g-mxqh-grgj medium … 2026-10-21T05:36:46Z [('vite', '6.4.4', '6.4.5')]`.
7. `gh api /advisories/GHSA-8g5g-mxqh-grgj` (18:43:00Z): `Not Found (HTTP 404)`; `gh api /repos/anthropics/claude-agent-sdk-typescript/security-advisories --jq length`: `0`.
8. `curl -s -X POST -H 'Content-Type: application/json' https://registry.npmjs.org/-/npm/v1/security/advisories/bulk -d '<versions>'`: with `@vitest/mocker` 5.0.5 and 5.0.2 among the versions (18:42:51Z) it returned only `@vitest/mocker` `GHSA-qxg6-89mg-rqv8` (`>=5.0.0-beta.1 <5.0.3`) and `GHSA-xp26-3454-mjgp` (`>=5.0.0-rc.2 <5.0.3`); with only the evaluated and newer versions (`vite` 8.3.5, `vitest` 5.0.5, `@vitest/mocker` 5.0.5, `@anthropic-ai/claude-code` 2.1.308, 2.1.310, 2.1.311, the SDK 0.3.308, 0.3.310, 0.3.311, TanStack Query 5.104.5 and 5.105.0, Mantine 9.7.3 and 9.7.4) and with `vite` 6.4.4 alone (18:43:58Z): `{}`, HTTP 200.

## Author self-check

- Each edited fact was checked against the observation table, and each finding's wording against `findings.jsonl` lines 11 to 15.
- `grep` over the repository, excluding `node_modules` and archived changes, for `9.7.3`, `5.104.5`, `0.3.310`, `2.1.310`, "35 CLI" or "35 repository", `GHSA-p458`, `GHSA-rq7h`, "fixed in 8.3.3", and "from 2026-10-06" found the other occurrences listed in [design](design.md) D3; they are not edited. No active change other than this one exists.
- No `package.json`, lockfile, or version proposal changed (`git diff --stat` lists only the two docs and this change).

## Checks and results

Run on 2026-10-27 on this host.

- **`TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`**: exit 0, on the working tree whose staged tree is `27a58e47bd474a177396b2f62c9ac239e89e1bfa`, which differs from the commit only in this section. Last line `Packed file allowlist and installed CLI verification passed.` Coverage over all files: 99.28 % lines, 92.33 % branches, 98.94 % functions. OpenSpec: `Totals: 70 passed, 0 failed (70 items)`. Findings: `Every findings file is valid: 40 file(s); every pass summary file is valid: 20 file(s).` Links: `Every checked link conforms.`
- **`npm run openspec -- validate refresh-g3-dependency-observations --strict`**: `Change 'refresh-g3-dependency-observations' is valid`, with `[INFO] … skip_specs is set in .openspec.yaml: change declares no spec-level behavior changes, zero deltas accepted`.
- **`make findings ARGS="validate"`**: `Every findings file is valid: 40 file(s); every pass summary file is valid: 20 file(s).`
- **`npm run verify:links`** and **`npm run verify:comments`**, after this section was written: `Every checked link conforms.` and `Every comment is within the comment length rule.`

## Independent review

Reviewer A: Claude Code `claude-fable-5-1`, effort medium. Reviewer B: Claude Code `claude-opus-5-5`, effort high. Both are Claude Code models for the reason under Environment.

No pass has run yet.

## Limitations

- Registry and advisory facts are observations of 2026-10-27 and can change after it.
- Only the facts named by the five findings were re-observed; the other 2026-10-25 facts of the evaluation were not rechecked.

## Remaining gates

- Review pass 1 by reviewer A (Claude Code claude-fable-5-1)
- Review pass 2 by reviewer B (Claude Code claude-opus-5-5, effort high)
- Review pass 3 by reviewer A
- Archive
- Integration into dev by the coordinator (single pull request)
