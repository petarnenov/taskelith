# Verification: revalidate-g3-foundations

## Scope and source

G3 item 0 ([G3 work plan](/docs/g3-plan.md#work-items), row 0), by the owner's decision of 2026-10-26: an independent revalidation of the merged G3 groundwork, items 1, 2, 3, 5, 6, 7, and 8, against G2 as built ([ADR 0015](/docs/decisions/0015-g2-closure.md)). The coordinator, Niki, assigned it and confirmed the reviewers ([design](design.md) D3). Documentation only: no runtime impact. This change records the revalidation and fixes no artifact; each substantive finding becomes a follow-up change below.

## Revision

- Base of the baseline: `origin/dev` `eda6c283` (#349).
- Reviewed revision of pass 1: `e6d86a67`, the merge of `dev` `71c6ce70` into this branch, which carries the prerequisite `scope-review-passes-by-artifact` (#353).
- Merge of `dev` `a00cbe3a` (#354, finalized G3 work plan) into this branch: `d28ed3ec`, tree `d68e0a6539e8330fad01d6e4bbc8e19ca6b3f433`.
- Reviewed revision of wave 2 (pass 1 of items 1, 5, and 8; pass 2 of items 2, 5, 6, 7, and 8): `b71f19ff`.
- Reviewed revision of pass 3 (items 2, 5, 6, 7, and 8): `ef633b2e`.
- Change records: `e9f35c5d` corrects the Dockerfile lines of design D1 (item 2 pass 1 L2); the pass 1 records follow in one commit. `4977b240` makes the record corrections of wave 2; the wave 2 records follow in one commit. `19a12442` fixes the three pass 3 record findings; the pass 3 records follow in one commit.

## Environment

- Host: macOS, Darwin 25.6.0. Node.js through nvm at the version of `.nvmrc`.
- Reviewer CLIs: OpenCode (`opencode`), Codex CLI `codex-cli` 0.164.0 (from the log header), and Claude Code (`claude`).
- Network access: the OpenCode `reviewer` agent and Claude Code reach the web; Codex runs read-only without network access. Items 1 and 2 therefore use OpenCode or Claude Code only (design D3).

## Author self-check

- Records: checked against the review criteria of design D2 and the [review findings record](/docs/agent-task-protocol.md#review-findings-record).
- Baseline: design D1 checked against `eda6c283`. The reviews found four errors in it, corrected as record findings: the Dockerfile lines (item 2 pass 1 L2), the Linux worker's account (item 6 pass 2 R1), the backoff of rejecting outcomes (item 8 pass 1 L1), and the unknown-exit rule and the deferred writers (item 8 pass 2 L3, L4).
- Evidence: every external link in these records is pinned or labeled with its access date, and `npm run verify:links` passes.

## Checks and results

- **Coordinator exception** (Niki, 2026-10-27). This records-only change started pass 1 without `make verify`. The pre-review checks on `e6d86a67` were `npm run openspec -- validate revalidate-g3-foundations --strict`, `npm run verify:findings`, and `npm run verify:links`, all passing. `make verify` runs before the pass 2 records.
- **`make verify`** (2026-10-27) ran on the merge of `dev` `a00cbe3a`, tree `d68e0a6539e8330fad01d6e4bbc8e19ca6b3f433`, in a temporary detached worktree, because reviews were running in this one: exit 0. Coverage over all files: 99.29 % lines, 92.15 % branches, 99.01 % functions. OpenSpec: 70 passed, 0 failed. Findings: 32 findings files and 12 pass summary files valid. Links conform. The merge `d28ed3ec` of this branch has the same tree, `d68e0a6539e8330fad01d6e4bbc8e19ca6b3f433`, as observed with `git rev-parse HEAD^{tree}`.
- **Pass 1 records** (2026-10-27): `npm run verify:findings`, `npm run verify:links`, `npm run openspec -- validate revalidate-g3-foundations --strict`, and `npm run verify:comments` pass.
- **Wave 2 records** (2026-10-27): the same four checks pass. Each report's listed findings match its own counts per severity, so `passes.jsonl` carries the reported counts.
- **Pass 3 records** (2026-10-27): `npm run openspec -- validate revalidate-g3-foundations --strict`, `make findings ARGS="validate"`, `npm run verify:links`, and `npm run verify:comments` pass.

## Summary per item

| Item | Capability | Result: current / needs a fix | Follow-ups |
| --- | --- | --- | --- |
| 1 | `g3-dependency-evaluation` | Needs a fix, Low only (review complete) | `refresh-g3-dependency-observations` |
| 2 | `harness-qualification`, `scm-qualification` | Needs a fix (review complete after pass 3) | `recheck-provider-terms-pages` |
| 3 | `agent-harness-port` | Current (review complete) | None |
| 5 | `account-pool-port` | Needs a fix (review complete after pass 3) | `align-account-pool-signals`, `align-account-pool-placement-baseline`, `align-slot-credential-delivery` |
| 6 | `git-workspace-port` | Needs a fix (review complete after pass 3) | `align-git-workspace-with-execution-boundary`, `derive-workspace-names-from-task-ids` |
| 7 | `scm-port` | Needs a fix (review complete after pass 3) | `align-scm-port-with-g2-credentials` |
| 8 | `product-ports` | Needs a fix (review complete after pass 3) | `bind-product-writers-to-launch-invalidation`, `align-product-ports-with-g2-lifecycle`, `record-placement-outcome` |

## Follow-up changes

| Proposed name | Item | Size S/M/L | Findings |
| --- | --- | --- | --- |
| `refresh-g3-dependency-observations` | 1 | S | Pass 1 L1, L2, L3, L4, L5 |
| `recheck-provider-terms-pages` | 2 | S | Pass 1 H1, H2 (Medium), L1; pass 2 M2, M3, L1, L2. Not pass 1 H3, which is declined. The OpenAI pages return HTTP 403; keep the Wayback snapshots |
| `align-account-pool-signals` | 5 | M | Pass 1 M1, M2, L1, L2, including capacity reservation section 10 and its living spec `capacity-reservation`; pass 2 M4, L5, L10, L11, L12, L13. Decision for M2: no separate reset signal; a cooldown ends at its stored time. Decision for M1: the usage window is a pool concern; the pool derives the window end from its own slot records, the observed usage times plus a per-harness window length in the pool configuration; when the end is unknown or expired, the tie-breaker is skipped; the harness port does not change, and the size stays M |
| `align-account-pool-placement-baseline` | 5 | M | Pass 2 M3, L3, L4 |
| `align-slot-credential-delivery` | 5 | M | Pass 2 M5, M6, M7, L6, L7, L8, L9. M7 depends on the `@taskelith/secrets` shape that `align-scm-port-with-g2-credentials` sets |
| `align-git-workspace-with-execution-boundary` | 6 | L | Pass 1 H1, M1; pass 2 M1, L1, L2. Assigned to Liki |
| `derive-workspace-names-from-task-ids` | 6 | S | Pass 2 M2. Decision: encode the names (a readable prefix and a digest); the API does not restrict task identifiers |
| `align-scm-port-with-g2-credentials` | 7 | M | Pass 1 H1, M1, L1; pass 2 H1, M1, M2, L1. Assigned to Desi |
| `bind-product-writers-to-launch-invalidation` | 8 | M | Pass 1 H1 (Medium after pass 2 M1); pass 2 M1. Links the re-admission of plan item 44 |
| `align-product-ports-with-g2-lifecycle` | 8 | M | Pass 1 M1, M3, M4; pass 2 H1, M2 (parts b and c), M3, M4, M5, L1, L2. Depends on `record-placement-outcome`; to Desi |
| `record-placement-outcome` | 8 | L | Pass 1 M2 (its G2 part); pass 2 M2 (part a). Scheduling and PostgreSQL |

The summary per item and this list are complete and were handed to the coordinator, Niki, on 2026-10-27, who sized `derive-workspace-names-from-task-ids` as S.

## Independent review

Criteria: `AGENTS.md`, the ADR 0004 principles, the governance review process, the artifact's living spec and contract, and the checks of [design](design.md) D2. Per item, under design D4: reviewer A makes pass 1, reviewer B pass 2, and reviewer A pass 3. A substantive finding is `deferred` to a follow-up change; a correction of these records is `fixed`.

Common facts of pass 3 (items 2, 5, 6, 7, and 8): reviewed revision `ef633b2e`, read-only. Snapshot `036f28fe3bbf6c9676ccc91be2cc56de147441c13e53825fb8d42bce0a0bbc58` before each pass, identical after each. Pass 3 confirms the pass 2 resolutions only; its findings are Low and fixed without another review.

Common facts of wave 2 (pass 1 of items 1, 5, and 8, and pass 2 of items 2, 5, 6, 7, and 8): reviewed revision `b71f19ff`. Snapshot `1b3625fb3c45062ea4a8ef99c08861b0e710f88c80ad13f9b71e42c4c127eb93` before each pass, identical after each. The passes started between about 17:36 and 17:44 and ended between 17:41 and 17:52 local time on 2026-10-27. Prompts and logs stayed outside the worktree.

Common facts of pass 1 (items 2, 3, 6, and 7): reviewed revision `e6d86a67bf5a76aa482ae2edb9c1390752329d50` (merge of `dev` `71c6ce70`). Snapshot before `6fbd4885e3dc66dbd1f081658b682357f2967a6e8d0d8f46edd2e7a484a5ba1a`, identical after each pass. All seven pass 1 runs started in parallel at about 17:05 local time on 2026-10-27. Invocation: `opencode run --standalone --agent reviewer -m 'opencode-go/<model>' --format json --title revalidate-g3-foundations-item-<n>-pass1 "$(cat <prompt-file>)" < /dev/null > <log>`, with the prompt and the log outside the worktree. Model confirmation: the `-m` flag sets the model and variant, and the stored assistant messages record them. Role: A.

### Failed attempts

These attempts did not run to a report. They are not passes and have no line in `passes.jsonl` or `findings.jsonl`.

| Item | Reviewer | Session | What happened |
| --- | --- | --- | --- |
| 1 | OpenCode `kimi-k3.1-pro`, variant `high` | `ses_e820b525cffe70QeGK97LOtBXI` | Exited 1 at 17:32 without a report |
| 5 | OpenCode `qwen3.8-max`, variant `medium` | `ses_e820b51d5ffegVeWxPjFl60S5T` | Hung without a report; the worker stopped it at 17:33 |
| 8 | OpenCode `kimi-k2.7-code`, default variant | `ses_e820b5223ffe6CVwNcR8Pg0t64` | Hung without a report; the worker stopped it at 17:33 |

Cause: the OpenCode Go weekly quota (HTTP 429, `GoUsageLimitError`), which the coordinator reported on 2026-10-27, with a retry after about 2026-11-02 02:00. All four OpenCode reviewers are paused until then.

### Reviewers and replacements

The coordinator, Niki, assigned the replacements on 2026-10-27 under the governance rule "Unavailable reviewer". Only Claude Code has network access among the available reviewers, and items 1 and 2 need it, so their reviewers share that harness.

| Item | Pass 1 A | Pass 2 B | Pass 3 A |
| --- | --- | --- | --- |
| 1 | Claude Code `claude-fable-5-1`, replacing OpenCode `kimi-k3.1-pro` (ran) | Not used: pass 1 was Low-only (assigned: Claude Code `claude-opus-5-5`) | Not used |
| 2 | OpenCode `deepseek-v4-pro` (ran) | Claude Code `claude-opus-5-5` | Claude Code `claude-fable-5-1`, replacing OpenCode (paused); same harness as B for network; confirmed by the coordinator |
| 3 | OpenCode `kimi-k2.7-code` (ran) | Not used: pass 1 had no findings | Not used |
| 5 | Codex `gpt-6.1-sol`, replacing OpenCode `qwen3.8-max` | Claude Code `claude-opus-5-5`, replacing Codex `gpt-6.1-sol` | Codex `gpt-6.1-sol` |
| 6 | OpenCode `kimi-k3.1-pro` (ran) | Claude Code `claude-fable-5-1` | Codex `gpt-6-astra`, replacing OpenCode (paused); confirmed by the coordinator |
| 7 | OpenCode `deepseek-v4-pro` (ran) | Codex `gpt-6-astra` | Claude Code `claude-fable-5-1`, replacing OpenCode (paused); confirmed by the coordinator |
| 8 | Codex `gpt-6-astra`, replacing OpenCode `kimi-k2.7-code` | Claude Code `claude-opus-5-5` | Codex `gpt-6-astra` |

### Item 1

Reviewer A: Claude Code `claude-fable-5-1`, replacing OpenCode `kimi-k3.1-pro`. Reviewer B: not used.

- Pass 1 (reviewer A): Claude Code `claude-fable-5-1`, effort `medium`, session `e1f52752-9f08-49d4-b3a8-211f677b68dd`, with the common facts of wave 2. Invocation: `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`. Model confirmation: the JSON `modelUsage` lists `claude-fable-5-1`, and `claude-haiku-5-5`, the CLI's auxiliary model. The reviewer checked the registries, advisories, and release schedules on the web, accessed 2026-10-27. Findings: critical 0, high 0, medium 0, low 5. Verdict: needs a fix, Low only, so the item's review is complete.
- Pass 2 (reviewer B): not run: pass 1 was Low-only.
- Pass 3 (reviewer A): not run: pass 1 was Low-only.

| Finding | Resolution |
| --- | --- |
| Pass 1 L1 (Low): The Claude Agent SDK record names 0.3.310 as latest and 35 CLI advisories, while 0.3.311 and a 36th advisory appeared on 2026-10-26 (`docs/g3-dependencies.md:92`) | Deferred to the follow-up change refresh-g3-dependency-observations |
| Pass 1 L2 (Low): Mantine 9.7.4 superseded the recorded 9.7.3 on the evaluation date (`docs/g3-dependencies.md:38`) | Deferred to the follow-up change refresh-g3-dependency-observations |
| Pass 1 L3 (Low): The TanStack Query record names 5.104.5 as latest, while 5.105.0 appeared on 2026-10-26 (`docs/g3-dependencies.md:23`) | Deferred to the follow-up change refresh-g3-dependency-observations |
| Pass 1 L4 (Low): The Vitest row omits two advisories of the mocker package from the same batch, both fixed before the evaluated version (`docs/g3-dependencies.md:21`) | Deferred to the follow-up change refresh-g3-dependency-observations |
| Pass 1 L5 (Low): The Vite row does not name the newest advisory, which affects only an older major line (`docs/g3-dependencies.md:20`) | Deferred to the follow-up change refresh-g3-dependency-observations |

The reviewer found the G2 image pins, the base image digest, and the baseline of design D1 consistent with item 1, and every conclusion of item 1 on licenses, advisories, and maintenance still current.

### Item 2

Reviewer A: OpenCode `deepseek-v4-pro`, variant `high`; pass 3 by Claude Code `claude-fable-5-1`, confirmed by the coordinator. Reviewer B: Claude Code `claude-opus-5-5`.

- Pass 1 (reviewer A): OpenCode `opencode-go/deepseek-v4-pro#high`, session `ses_e820b5099ffe47tEDDDalELhZs`, with the common facts above. The reviewer checked the cited provider pages on the web, accessed 2026-10-27. Findings: critical 0, high 2, medium 1, low 2. Verdict: needs a fix.
- Pass 2 (reviewer B): Claude Code `claude-opus-5-5`, effort `high`, session `ff2a68bc-e0a5-4a3d-9808-2c3823e8daf9`, with the common facts of wave 2. Invocation: the Claude Code (`claude-opus-5-5`) row of the [reviewer invocations](/docs/agent-task-protocol.md#reviewer-invocations). Model confirmation: `claude-opus-5-5` in the JSON `modelUsage`. The reviewer checked the provider pages live and through Wayback snapshots, accessed 2026-10-27. Findings: critical 0, high 1, medium 3, low 5. Verdict: needs a fix.
- Pass 3 (reviewer A): Claude Code `claude-fable-5-1`, effort `medium`, the same harness as reviewer B because only Claude Code has network access among the available reviewers, session `a2a9395c-2b85-4e8e-a103-2ac9ca088bde`, with the common facts of pass 3. Invocation and model confirmation as for item 1 pass 1. Findings: critical 0, high 0, medium 0, low 1. Verdict: Low only, so the item's review is complete; the item needs a fix through its follow-ups.

| Finding | Resolution |
| --- | --- |
| Pass 1 H1 (High): the Anthropic Usage Policy names services that route requests through consumer subscriptions; the 2026-10-25 review omitted the clause, which Wayback snapshots of 2026-10-24 (`20261024120451`) and 2026-10-26 (`20261026081456`) carry, and `docs/qualification/claude-code.md` still says pooling is not named | Deferred to `recheck-provider-terms-pages`. The coordinator notified the owner on D15: the clause was omitted at decision time; the anti-circumvention clause (pass 2 M2) and the carve-out conditions against ADR 0005 decision 2 (pass 2 M3) bear on it too |
| Pass 1 H2 (Medium, labelled H2 by the reviewer): the Agent SDK overview states that the SDK is governed by the Commercial Terms; the 2026-10-25 review omitted it, which snapshots `20261020141633` and `20261024042705` carry | Deferred to `recheck-provider-terms-pages` |
| Pass 1 H3 (High): the Codex App Server page was rewritten and no longer carries the authentication statement that `docs/qualification/codex.md` quotes as its most direct source | Declined after pass 2 H1: the live page, checked by pass 2 on 2026-10-27, carries both quoted sentences word for word; pass 1 read a truncated copy. Not part of the follow-up |
| Pass 1 L1 (Low): the legal and compliance page has a sentence allowing customers to provision their own API keys; the 2026-10-25 review omitted it, which snapshots `20261020141144` and `20261024042054` carry | Deferred to `recheck-provider-terms-pages` |
| Pass 1 L2 (Low, record): design D1 cited `infra/installation/Dockerfile:53` to `:55` for the `worker-harnesses` stage | Fixed in `e9f35c5d`: the stage and its `DISABLE_AUTOUPDATER=1` are at lines 72 to 74 |
| Pass 2 H1 (High, record): The records defer pass 1 H3 although the live Codex App Server page still carries the quoted sentences (`openspec/changes/revalidate-g3-foundations/findings.jsonl:3`) | Fixed in `4977b240`: Pass 1 H3 is declined with the live page check of 2026-10-27 and removed from the follow-up |
| Pass 2 M1 (Medium, record): The records say the provider pages changed after the 2026-10-25 review, when that review omitted clauses already on them (`openspec/changes/revalidate-g3-foundations/findings.jsonl:1`) | Fixed in `4977b240`: Pass 1 H1, H2, and L1 now say the 2026-10-25 review omitted the clauses, with the snapshot dates, and the D15 note follows |
| Pass 2 M2 (Medium; missed by pass 1): The record does not quote the broadened Usage Policy clause against bypassing product restrictions (`docs/qualification/claude-code.md:56`) | Deferred to the follow-up change recheck-provider-terms-pages |
| Pass 2 M3 (Medium; missed by pass 1): The record relies on the hosting carve-out without quoting its conditions on authentication and billing (`docs/qualification/claude-code.md:63`) | Deferred to the follow-up change recheck-provider-terms-pages |
| Pass 2 L1 (Low): The record does not quote that a Claude account sign-in must complete through the provider's own flow (`docs/qualification/claude-code.md:63`) | Deferred to the follow-up change recheck-provider-terms-pages |
| Pass 2 L2 (Low; missed by pass 1): The Codex status line still lists the provider terms review as open (`docs/qualification/codex.md:3`) | Deferred to the follow-up change recheck-provider-terms-pages |
| Pass 2 L3 (Low, record; missed by pass 1): Design D3 shows the confirmed pass 3 reviewers as proposed, and verification keeps a gate for their confirmation (`openspec/changes/revalidate-g3-foundations/design.md:108`) | Fixed in `4977b240`: Design D3 no longer marks them proposed, and the gate is removed |
| Pass 2 L4 (Low, record; missed by pass 1): Design D5 and the risks say the record tooling is not merged (`openspec/changes/revalidate-g3-foundations/design.md:137`) | Fixed in `4977b240`: D5 now says the tooling was merged before the first line, and the risk is removed |
| Pass 2 L5 (Low, record; missed by pass 1): The Environment and Author self-check sections are still unfilled (`openspec/changes/revalidate-g3-foundations/verification.md:16`) | Fixed in `4977b240`: Both sections are filled, including each reviewer's network access |
| Pass 3 L1 (Low, record): The follow-up row of recheck-provider-terms-pages omits that the OpenAI pages return HTTP 403 and the Wayback snapshots stay necessary (`openspec/changes/revalidate-g3-foundations/verification.md:51`) | Fixed in `19a12442`, not re-reviewed: the row now says that the OpenAI pages return HTTP 403 and that the snapshots are kept |

Pass 1 found the GitHub terms unchanged and no GitHub finding. Pass 2 confirmed pass 1 L2 and its fix, and found the other Anthropic, OpenAI, and GitHub quotes current; it also found that the cited OpenAI pages refuse plain requests with HTTP 403, so the Wayback snapshots remain necessary.

### Item 3

Reviewer A: OpenCode `kimi-k2.7-code`. Reviewer B: Codex `gpt-6-astra`.

- Pass 1 (reviewer A): OpenCode `opencode-go/kimi-k2.7-code` with the default variant, session `ses_e820b521affeurgQycMvs2Ouxm`, with the common facts above. Findings: critical 0, high 0, medium 0, low 0. Verdict: current. A pass without findings ends the item's review.
- Pass 2 (reviewer B): not run: pass 1 had no findings.
- Pass 3 (reviewer A): not run: pass 1 had no findings.

| Finding | Resolution |
| --- | --- |

### Item 5

Reviewer A: Codex `gpt-6.1-sol`, replacing OpenCode `qwen3.8-max`. Reviewer B: Claude Code `claude-opus-5-5`, replacing Codex `gpt-6.1-sol` (see "Reviewers and replacements").

- Pass 1 (reviewer A): Codex `gpt-6.1-sol`, reasoning effort `medium`, session `01a17e03-828f-7ff2-b4f2-96b1e27c8dfe`, with the common facts of wave 2. Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. Model confirmation: the output header shows the model, the reasoning effort, and the read-only sandbox. Findings: critical 0, high 0, medium 2, low 2. Verdict: needs a fix.
- Pass 2 (reviewer B): Claude Code `claude-opus-5-5`, effort `high`, session `73bd11ab-9a1c-472e-b96e-9ddffb4ce10f`, with the common facts of wave 2. Invocation and model confirmation as for item 2 pass 2. Findings: critical 0, high 0, medium 5, low 13. Verdict: needs a fix.
- Pass 3 (reviewer A): Codex `gpt-6.1-sol`, reasoning effort `medium`, session `01a17e17-519a-7cd3-b887-fafc1e826f9a`, with the common facts of pass 3. Invocation and model confirmation as for item 5 pass 1. Findings: critical 0, high 0, medium 0, low 1. Verdict: Low only, so the item's review is complete; the item needs a fix through its follow-ups.

| Finding | Resolution |
| --- | --- |
| Pass 1 M1 (Medium): The pool requires a usage window end that the harness usage signal does not carry (`docs/contracts/account-pool.md:115`) | Deferred to the follow-up change align-account-pool-signals |
| Pass 1 M2 (Medium): The pool requires a separate reset signal that the harness port does not define (`docs/contracts/account-pool.md:114`) | Deferred to the follow-up change align-account-pool-signals; coordinator decision: no separate reset signal, a cooldown ends at its stored time |
| Pass 1 L1 (Low): The promise to continue as soon as another slot is eligible ignores the G2 placement backoff and rotation (`docs/contracts/account-pool.md:97`) | Deferred to the follow-up change align-account-pool-signals |
| Pass 1 L2 (Low): The session invariant is assigned to G2 item 7, which delivered a per-task invariant; G3 item 4 owns it (`docs/contracts/capacity-reservation.md:172`) | Deferred to the follow-up change align-account-pool-signals, whose scope includes capacity reservation section 10 and its living spec |
| Pass 2 M3 (Medium; missed by pass 1): Slot selection does not fit the G2 reservation transaction, which takes credentials from the caller and a fixed concurrency (`docs/contracts/account-pool.md:36`) | Deferred to the follow-up change align-account-pool-placement-baseline |
| Pass 2 M4 (Medium; missed by pass 1): The pool assumes the control plane can query a harness plugin outside a session for its mechanism and credential health (`docs/contracts/account-pool.md:34`) | Deferred to the follow-up change align-account-pool-signals |
| Pass 2 M5 (Medium; missed by pass 1): The contract and types model a credential as one text and do not cover the per-slot login state of device login (`docs/contracts/account-pool.md:144`) | Deferred to the follow-up change align-slot-credential-delivery |
| Pass 2 M6 (Medium; missed by pass 1): Credential delivery does not keep the credential out of the worker journal or say how a recovered execution gets it again (`docs/contracts/account-pool.md:148`) | Deferred to the follow-up change align-slot-credential-delivery |
| Pass 2 M7 (Medium; missed by pass 1): The secrecy guarantee has no G2 mechanism, since the redaction rules know no subscription token shape (`docs/contracts/account-pool.md:24`) | Deferred to the follow-up change align-slot-credential-delivery, which depends on the secrets shape of align-scm-port-with-g2-credentials |
| Pass 2 L3 (Low; missed by pass 1): A slot write for a declined candidate can stay in the placement transaction that commits on the next candidate (`docs/contracts/account-pool.md:79`) | Deferred to the follow-up change align-account-pool-placement-baseline |
| Pass 2 L4 (Low; missed by pass 1): The list of serializable writers does not include the slot changes that the reservation transaction reads (`docs/contracts/capacity-reservation.md:75`) | Deferred to the follow-up change align-account-pool-placement-baseline |
| Pass 2 L5 (Low; missed by pass 1): An account signal is said to name its slot, but the signal names none and the derivation is not stated (`docs/contracts/account-pool.md:111`) | Deferred to the follow-up change align-account-pool-signals |
| Pass 2 L6 (Low; missed by pass 1): Credential delivery requires no confidential transport, while G2 runs plain HTTP and NATS (`docs/contracts/account-pool.md:148`) | Deferred to the follow-up change align-slot-credential-delivery |
| Pass 2 L7 (Low; missed by pass 1): The contract puts the slot store in a control-plane file namespace that the plan reserves for encrypted credential storage (`docs/contracts/account-pool.md:142`) | Deferred to the follow-up change align-slot-credential-delivery |
| Pass 2 L8 (Low; missed by pass 1): The spec gives the credential port a reservation check that it cannot make outside the transaction (`openspec/specs/account-pool-port/spec.md:81`) | Deferred to the follow-up change align-slot-credential-delivery |
| Pass 2 L9 (Low; missed by pass 1): The redaction placeholder constant duplicates the observability one and is exported from a second package (`packages/modules/scheduling/src/domain/slot-secret.ts:3`) | Deferred to the follow-up change align-slot-credential-delivery |
| Pass 2 L10 (Low; missed by pass 1): The contract says code point order where the module and the capacity contract use code unit order (`docs/contracts/account-pool.md:21`) | Deferred to the follow-up change align-account-pool-signals |
| Pass 2 L11 (Low; missed by pass 1): The status line still says the contract is under independent review (`docs/contracts/account-pool.md:3`) | Deferred to the follow-up change align-account-pool-signals |
| Pass 2 L12 (Low; missed by pass 1): The overview still names a reset signal, a place that pass 1 M2 did not list (`docs/contracts/account-pool.md:14`) | Deferred to the follow-up change align-account-pool-signals |
| Pass 2 L13 (Low; missed by pass 1): The usage window also governs the tie-breaker test of the pool contract and this spec, places that pass 1 M1 did not list (`openspec/specs/harness-account-pools/spec.md:24`) | Deferred to the follow-up change align-account-pool-signals |
| Pass 2 R1 (Low, record; missed by pass 1): Design D5 and the risks say the record tooling is not merged and the record files are empty (`openspec/changes/revalidate-g3-foundations/design.md:137`) | Fixed in `4977b240`: D5 now says the tooling was merged before the first line, and the risk is removed |
| Pass 2 R2 (Low, record): The size of the account pool signals follow-up depends on whether the window fix reaches the harness port (`openspec/changes/revalidate-g3-foundations/verification.md:44`) | Fixed in `4977b240`: The follow-up table records the coordinator's size M and the grouping of all item 5 findings. The coordinator's decision for M1, added after pass 3 L1: the pool derives the window end from its slot records, the observed usage times plus a per-harness window length in the pool configuration; an unknown or expired end skips the tie-breaker; the harness port does not change |
| Pass 3 L1 (Low, record): No concrete decision limits the pass 1 M1 window fix to the pool, on which the size M of align-account-pool-signals rests (`openspec/changes/revalidate-g3-foundations/verification.md:52`) | Fixed in `19a12442`, not re-reviewed: the follow-up row, the pass 2 R2 row, and its finding line record the coordinator's decision; the size stays M |

Pass 2 confirmed the four pass 1 findings and widened M1 and M2 by the places that its L12 and L13 name. It numbered its own Low findings from L3 and its two record findings R1 and R2; its L1 and L2 confirm pass 1. The coordinator confirmed the grouping of the reviewer into three follow-ups. Both passes found the aligned identifiers, the PostgreSQL schema, and the serializable reservation transaction as design D1 states them.

### Item 6

Reviewer A: OpenCode `kimi-k3.1-pro`, variant `high`; pass 3 by Codex `gpt-6-astra`, confirmed by the coordinator. Reviewer B: Claude Code `claude-fable-5-1`.

- Pass 1 (reviewer A): OpenCode `opencode-go/kimi-k3.1-pro#high`, session `ses_e820b523fffeM2gZJeWSk2ZIaJ`, with the common facts above. Findings: critical 0, high 1, medium 1, low 0. Verdict: needs a fix.
- Pass 2 (reviewer B): Claude Code `claude-fable-5-1`, effort `medium`, session `844d632e-c11b-442f-ac39-31c68a9b34a2`, with the common facts of wave 2. Invocation and model confirmation as for item 1 pass 1. Findings: critical 0, high 0, medium 3, low 3. Verdict: needs a fix.
- Pass 3 (reviewer A): Codex `gpt-6-astra`, reasoning effort `medium`, session `01a17e17-519f-7002-a342-30e5c1331a1f`, with the common facts of pass 3. Invocation and model confirmation as for item 7 pass 2. Findings: critical 0, high 0, medium 0, low 0. Verdict: no findings, so the item's review is complete; the item needs a fix through its follow-ups.

| Finding | Resolution |
| --- | --- |
| Pass 1 H1 (High): `worker/workspaces/<attemptId>/checkout/` is the harness working directory, but the execution account (uid 10003) cannot pass the worker's private `worker/` of mode `0700`; the test double does not model the modes | Deferred to `align-git-workspace-with-execution-boundary` |
| Pass 1 M1 (Medium): the contract does not state the account and cgroup of the Git processes of workspace operations, so they could run inside an execution's containment | Deferred to `align-git-workspace-with-execution-boundary` |
| Pass 2 M1 (Medium): The proposed access fix ignores that the Linux worker runs as root with few capabilities and that Git refuses foreign-owned repositories (`docs/contracts/git-workspace.md:26`) | Deferred to the follow-up change align-git-workspace-with-execution-boundary |
| Pass 2 M2 (Medium; missed by pass 1): The safe name rule rejects client-chosen G2 task identifiers, so such a task never gets a workspace (`docs/contracts/git-workspace.md:30`) | Deferred to the follow-up change derive-workspace-names-from-task-ids; coordinator decision: encode the names, with no API restriction |
| Pass 2 R1 (Medium, record): Design D1 and D2 name uid 10001 as the Linux worker account, while the worker runs as root (`openspec/changes/revalidate-g3-foundations/design.md:59`) | Fixed in `4977b240`: D1 and D2 now say the Linux worker runs as root under setpriv and owns the data root; uid 10001 is the control plane's |
| Pass 2 L1 (Low): The contract cites the wrong journal section and says the worker is the only writer under its directory (`docs/contracts/git-workspace.md:16`) | Deferred to the follow-up change align-git-workspace-with-execution-boundary |
| Pass 2 L2 (Low; missed by pass 1): The promise that a secret is never logged relies on redaction that G2 lacks (`docs/contracts/git-workspace.md:84`) | Deferred to the follow-up change align-git-workspace-with-execution-boundary |
| Pass 2 R2 (Low, record): The size M of the workspace follow-up is too small for the worker journal and Linux test work (`openspec/changes/revalidate-g3-foundations/verification.md:45`) | Fixed in `4977b240`: The follow-up is resized to L with the pass 2 findings added |

Pass 1 found the `<attemptId>` rule consistent with G2's attempt identities and the cleanup complete against the control records. Pass 2 confirmed both pass 1 findings and their follow-up, and found that the safe-name rule holds for attempt identities but not for client-chosen task identifiers (its M2).

### Item 7

Reviewer A: OpenCode `deepseek-v4-pro`, variant `high`; pass 3 by Claude Code `claude-fable-5-1`, confirmed by the coordinator. Reviewer B: Codex `gpt-6-astra`.

- Pass 1 (reviewer A): OpenCode `opencode-go/deepseek-v4-pro#high`, session `ses_e820b51e7ffe7wuRbbCB2OJ9La`, with the common facts above. Findings: critical 0, high 1, medium 1, low 1. Verdict: needs a fix.
- Pass 2 (reviewer B): Codex `gpt-6-astra`, reasoning effort `medium`, session `01a17e03-8299-7773-bfdb-6a8bfca0a20a`, with the common facts of wave 2. Invocation: `codex exec -m gpt-6-astra -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. Model confirmation: the output header shows the model, the reasoning effort, and the read-only sandbox. The reviewer ran the existing SCM tests on the existing build, with no build of its own. Findings: critical 0, high 1, medium 2, low 3. Verdict: needs a fix.
- Pass 3 (reviewer A): Claude Code `claude-fable-5-1`, effort `medium`, session `0cf7897e-a64a-4ac9-a2b6-96cab9a52779`, with the common facts of pass 3. Invocation and model confirmation as for item 1 pass 1. Findings: critical 0, high 0, medium 0, low 1. Verdict: Low only, so the item's review is complete; the item needs a fix through its follow-ups.

| Finding | Resolution |
| --- | --- |
| Pass 1 H1 (High): the contract and spec promise that a run credential's secret is never logged or stored, while G2 redacts only the installation's shapes and no spawn path calls `scrubEnvironment` | Deferred to `align-scm-port-with-g2-credentials` |
| Pass 1 M1 (Medium): the webhook receiver does not state that it needs ingress and TLS, which the G2 installation lacks | Deferred to `align-scm-port-with-g2-credentials` |
| Pass 1 L1 (Low): `source-control-readers.ts` parses several opaque identifiers as text, so an empty value passes | Deferred to `align-scm-port-with-g2-credentials` |
| Pass 2 H1 (High; missed by pass 1): Conformance diagnostics copy thrown plugin and fixture text into findings, so a secret can reach the report (`packages/modules/integrations/src/ports/conformance-case.ts:22`) | Deferred to the follow-up change align-scm-port-with-g2-credentials |
| Pass 2 M1 (Medium; missed by pass 1): Credential refresh has no contract for delivery to and adoption by a running run (`docs/contracts/source-control.md:37`) | Deferred to the follow-up change align-scm-port-with-g2-credentials |
| Pass 2 M2 (Medium; missed by pass 1): The Forgejo mapping treats a repository write scope as an allowed superset, though it grants the forbidden code write (`docs/contracts/source-control.md:80`) | Deferred to the follow-up change align-scm-port-with-g2-credentials |
| Pass 2 L1 (Low; missed by pass 1): Repository entries and the status commit also accept empty values, and the local identifier check is not the kernel one (`packages/modules/integrations/src/ports/source-control-readers.ts:31`) | Deferred to the follow-up change align-scm-port-with-g2-credentials |
| Pass 2 L2 (Low, record): The records still show the merged tooling and the confirmed reviewers as pending (`openspec/changes/revalidate-g3-foundations/design.md:137`) | Fixed in `4977b240`: Design D3, D5, and the risks now match verification, and the confirmation gate is removed |
| Pass 2 L3 (Low, record): The SCM follow-up is sized S although it changes runtime readers and their tests (`openspec/changes/revalidate-g3-foundations/verification.md:46`) | Fixed in `4977b240`: The follow-up is resized to M by the coordinator |
| Pass 3 L1 (Low, record): Design D6 defines size M as a contract, its spec, and its port types, while the SCM follow-up also changes the port's readers and conformance case (`openspec/changes/revalidate-g3-foundations/verification.md:57`) | Fixed in `19a12442`, not re-reviewed: by the coordinator's decision, D6 now counts a port's own readers and conformance cases under `src/ports/**` as port types; the size stays M |

Pass 1 proposed two follow-ups; the worker grouped all three findings into one, as the coordinator named it. Pass 2 confirmed the three pass 1 findings and proposed a separate Forgejo change for its M2; the coordinator kept M2 in `align-scm-port-with-g2-credentials` and resized it to M.

### Item 8

Reviewer A: Codex `gpt-6-astra`, replacing OpenCode `kimi-k2.7-code`. Reviewer B: Claude Code `claude-opus-5-5`.

- Pass 1 (reviewer A): Codex `gpt-6-astra`, reasoning effort `medium`, session `01a17e03-8299-7c10-89cb-290230c1c8b7`, with the common facts of wave 2. Invocation and model confirmation as for item 7 pass 2. Findings: critical 0, high 1, medium 4, low 1. Verdict: needs a fix.
- Pass 2 (reviewer B): Claude Code `claude-opus-5-5`, effort `high`, session `6af8a2c9-577b-40bb-86e1-c675ed6c99e1`, with the common facts of wave 2. Invocation and model confirmation as for item 2 pass 2. Findings: critical 0, high 1, medium 5, low 4. Verdict: needs a fix.
- Pass 3 (reviewer A): Codex `gpt-6-astra`, reasoning effort `medium`, session `01a17e17-51a6-7a80-b957-4fe4844c64ce`, with the common facts of pass 3. Invocation and model confirmation as for item 7 pass 2. Findings: critical 0, high 0, medium 0, low 0. Verdict: no findings, so the item's review is complete; the item needs a fix through its follow-ups.

| Finding | Resolution |
| --- | --- |
| Pass 1 H1 (High): Product decisions that change gates, artifacts, or policy are not bound to the G2 launch invalidation protocol (`docs/contracts/product-ports.md:132`) | Deferred to the follow-up change bind-product-writers-to-launch-invalidation. Item 8 pass 2 M1 lowers the severity to Medium: the binding protocol exists, a reference and race tests are missing |
| Pass 1 M1 (Medium): A finished workflow has no current stage, while the board card requires one (`docs/contracts/product-ports.md:62`) | Deferred to the follow-up change align-product-ports-with-g2-lifecycle |
| Pass 1 M2 (Medium): The board and task detail cannot show the scheduling wait or rejecting reason of a task (`packages/modules/execution/src/ports/board-read-model.ts:63`) | Deferred to record-placement-outcome for the G2 record of the placement outcome; its product projection is in align-product-ports-with-g2-lifecycle under item 8 pass 2 M2 |
| Pass 1 M3 (Medium): The Needs you inbox has no source or answer for execution reconciliation (`packages/modules/execution/src/ports/needs-you.ts:9`) | Deferred to the follow-up change align-product-ports-with-g2-lifecycle |
| Pass 1 M4 (Medium): A withdrawn merge request can show that every gate passed after a gate turned stale (`docs/contracts/product-ports.md:97`) | Deferred to the follow-up change align-product-ports-with-g2-lifecycle |
| Pass 1 L1 (Low, record): Design D1 says every decline other than a fleet one backs off, but a rejecting outcome ends the attempt (`openspec/changes/revalidate-g3-foundations/design.md:50`) | Fixed in `4977b240`: Design D1 now limits the backoff to waiting declines and says a rejecting outcome ends the attempt not-started with no retry |
| Pass 2 H1 (High; missed by pass 1): The contract does not say which G2 task stands behind a card, while a G2 run holds many tasks (`docs/contracts/product-ports.md:70`) | Deferred to the follow-up change align-product-ports-with-g2-lifecycle |
| Pass 2 M1 (Medium): Severity correction of pass 1 H1: the launch invalidation duty exists; a reference and race tests are missing (`docs/contracts/product-ports.md:132`) | Deferred to the follow-up change bind-product-writers-to-launch-invalidation, with pass 1 H1 |
| Pass 2 M2 (Medium): G2 keeps no placement outcome reason, and the wait reasons that the card omits are more than pass 1 listed (`packages/modules/execution/src/ports/board-read-model.ts:63`) | Part a, the G2 record, deferred to record-placement-outcome; parts b and c deferred to align-product-ports-with-g2-lifecycle, which depends on it |
| Pass 2 M3 (Medium; missed by pass 1): A task that ended without a merge, by cancellation, rejection, or no retry, has no terminal card disposition (`docs/contracts/product-ports.md:66`) | Deferred to the follow-up change align-product-ports-with-g2-lifecycle |
| Pass 2 M4 (Medium; missed by pass 1): Merge readiness counts passed gates, which holds vacuously for a stage without gates, unlike the G2 stage rule (`docs/contracts/product-ports.md:88`) | Deferred to the follow-up change align-product-ports-with-g2-lifecycle |
| Pass 2 M5 (Medium; missed by pass 1): Standing rules compare an opaque per-run policy revision by age, and the contract and spec disagree on the comparison (`docs/contracts/product-ports.md:150`) | Deferred to the follow-up change align-product-ports-with-g2-lifecycle |
| Pass 2 L1 (Low; missed by pass 1): The board read model reuses the waiting reason names that Scheduling exports with another meaning (`packages/modules/execution/src/ports/board-read-model.ts:63`) | Deferred to the follow-up change align-product-ports-with-g2-lifecycle |
| Pass 2 L2 (Low; missed by pass 1): Withdrawn requests map to not ready even when every gate passed, and auto merge on before a request has no value (`docs/contracts/product-ports.md:88`) | Deferred to the follow-up change align-product-ports-with-g2-lifecycle |
| Pass 2 L3 (Low, record; missed by pass 1): Design D1 says an unknown exit gets the retry budget reason, while no retry opens for it (`openspec/changes/revalidate-g3-foundations/design.md:57`) | Fixed in `4977b240`: D1 now says no automatic retry opens and the reason is the contract's unreached guard |
| Pass 2 L4 (Low, record; missed by pass 1): Design D1 omits the artifact revision writer from the writers deferred to G3 (`openspec/changes/revalidate-g3-foundations/design.md:83`) | Fixed in `4977b240`: D1 now lists the artifact revision, gate, and policy revision writers |

**Severity correction.** Pass 2 M1 lowers pass 1 H1 from High to Medium, because the launch authorization contract already binds every writer of a compared value. The pass 1 line keeps the High that its reviewer reported, with the correction in its resolution; the follow-up `bind-product-writers-to-launch-invalidation` is sized M accordingly. Pass 2 confirmed pass 1 M1, M3, M4, and L1, and found M2 understated (its M2).

## Limitations

- The coordinator confirmed the pass 3 replacements of items 2, 6, and 7 on 2026-10-27; item 2's pass 3 is by the same harness as its reviewer B because only Claude Code has network access among the available reviewers. Item 1's reviewer A is Claude Code for the same reason; its review ended after pass 1.
- Medium or higher findings deferred to a follow-up are not re-reviewed in this change; each follow-up has its own review ([design](design.md) D4).

## Remaining gates

- `make verify` on the final records
- Archive of this change, with the checks of the archived tree
- Integration into dev by the coordinator (single pull request)
- Follow-up fixes land before any other G3 item starts
