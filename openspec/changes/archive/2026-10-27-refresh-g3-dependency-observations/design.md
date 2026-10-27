## Context

G3 item 1 (`qualify-g3-dependencies`) evaluated the G3 libraries and tools with sources accessed on 2026-10-25. G3 item 0 revalidated it on 2026-10-27. Pass 1 by Claude Code `claude-fable-5-1` found five Low findings, deferred to this change ([revalidation record](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md#item-1)):

| Finding | Title | Row |
| --- | --- | --- |
| Pass 1 L1 | The Claude Agent SDK record names 0.3.310 as latest and 35 CLI advisories, while 0.3.311 and a 36th advisory appeared on 2026-10-26 | `docs/g3-dependencies.md:92`, and `:98` for the advisories |
| Pass 1 L2 | Mantine 9.7.4 superseded the recorded 9.7.3 on the evaluation date | `docs/g3-dependencies.md:38` |
| Pass 1 L3 | The TanStack Query record names 5.104.5 as latest, while 5.105.0 appeared on 2026-10-26 | `docs/g3-dependencies.md:23` |
| Pass 1 L4 | The Vitest row omits two advisories of the mocker package from the same batch, both fixed before the evaluated version | `docs/g3-dependencies.md:21` |
| Pass 1 L5 | The Vite row does not name the newest advisory, which affects only an older major line | `docs/g3-dependencies.md:20` |

The register's "G3 dependencies" section in `docs/dependencies.md` repeats these facts in shorter form, in lines 132, 137, 138, 140, and 141.

## Goals / Non-Goals

**Goals:**

- Make the five named facts current, from primary sources, with the date 2026-10-27 on each.
- Keep the matching register rows consistent with the evaluation.

**Non-Goals:**

- Changing a proposed version, the register pin `@anthropic-ai/claude-agent-sdk@0.3.308`, `package.json`, or a lockfile. Items 19 and 28 and the owner choose the versions they install, and the evaluation already says each installing item rechecks versions and advisories.
- Re-evaluating a newer version in full (integrity, provenance, peers, license). Only the facts the findings name are re-observed.
- Editing dated records outside the two documents (D3).

## Decisions

### D1. Dated re-observation next to the evaluated facts

Each corrected fact says "observed 2026-10-27". The 2026-10-25 facts it does not replace stay, because they still describe the evaluated version. The "Evidence and markers" paragraph and the register's section introduction name the exception to "accessed on 2026-10-25". This meets the `g3-dependency-evaluation` requirement "G3 dependency evidence", which asks for the access date of every unversioned source.

- **L1.** The "Latest" row now gives 0.3.311 with CLI 2.1.311 as observed on 2026-10-27, and keeps 0.3.310 as the latest of 2026-10-25, which the integrity, upstream, and manifest facts below it still describe. It also gives the `next` dist-tag 0.3.312, published during the observation. The "Advisories" row gives the 36 advisories of the `anthropics/claude-code` repository (35 on 2026-10-25), 32 of which name the npm package and the newest high one, GHSA-5xjx-9qx6-jcrv.
- **L2 and L3.** The newer release and its `latest` dist-tag are added to the "Published" fact (Mantine) and the maintenance cell (TanStack Query). Section 1's lead now says "latest version on 2026-10-25".
- **L4.** The Vitest row names GHSA-xp26-3454-mjgp and GHSA-qxg6-89mg-rqv8 with their fixed versions from the GitHub Advisory Database, which, unlike the repository advisories, lists the 5.x range (fixed in 5.0.3).
- **L5.** The Vite row keeps the 8.x advisories as the 8.x line's most recent and names GHSA-8g5g-mxqh-grgj, a repository advisory that affects only `vite@6.4.4`.

### D2. No spec delta

No requirement changes: the edits are facts under the existing requirements "G3 dependency evaluation", "G3 dependency evidence", and "G3 dependency candidates". Under [worker step 2](/docs/agent-task-protocol.md#worker-steps), documentation-only work under an existing requirement sets `skip_specs: true` in `.openspec.yaml` and adds no `specs/` files. Precedent: [`revalidate-g3-foundations`](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md#checks-and-results) set it, `validate --strict` passed, and `npm run openspec -- archive <change> --yes` archived it with an empty `git diff` of `openspec/specs`; no `--skip-specs` option was needed. A later finding on these docs names the capability `g3-dependency-evaluation`, or `dependency-register` for the register.

### D3. Other occurrences stay

The same superseded values appear in other dated records, which this change does not edit, because each states its own assessment date or is an archived record:

- `docs/integration-candidates.md:44` names CLI 2.1.310 as npm `latest` and Agent SDK 0.3.310, under its assessment date 2026-10-24.
- `docs/qualification/claude-code.md:11` says the SDK has only `latest` (0.3.310) and `next` dist-tags. On 2026-10-27 `latest` is 0.3.311 and `next` is 0.3.312.
- `docs/g3-plan.md:193`, `docs/decisions/0011-mantine-ui-proof-of-concept.md:12`, and `docs/ui-poc/README.md:57` and `:70` name Mantine 9.7.3 as the version observed in D17 or used by the proof of concept, which is still correct.

No active change other than this one exists, so no design record of an active change repeats the facts.

## Risks / Trade-offs

- [Registry facts move daily] → Each fact carries its observation date, and the installing items recheck before pinning.
- [Two reviewers of one harness] → Both reviewers need network access, and Codex has none; `verification.md` records the coordinator's reason.

## Review checklist

Output of `make findings ARGS="checklist --capability dependency-register,g3-dependency-evaluation,dependency-inventory --files docs/g3-dependencies.md,docs/dependencies.md"` on 2026-10-27:

```text
Review checklist (capabilities dependency-register, g3-dependency-evaluation, dependency-inventory; files docs/g3-dependencies.md, docs/dependencies.md), most frequent finding categories first:
1. docs (3): Documentation is missing, wrong, or out of date with the change. Example: "The Ubuntu register row still said the linux/arm64 installation images were not built or run"
2. stale-citation (3): A cited file line, commit, or record no longer matches its target. Example: "The TanStack Query record names 5.104.5 as latest, while 5.105.0 appeared on 2026-10-26"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (44): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
2. docs (41): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
3. stale-citation (19): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
4. spec-wording (18): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
5. process (9): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
6. contract-drift (6): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
7. scope (5): The change does more or less than its assigned scope. Example: "Design D6 defines size M as a contract, its spec, and its port types, while the SCM follow-up also changes the port's readers and conformance case"
```
