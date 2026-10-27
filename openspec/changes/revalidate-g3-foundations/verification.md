# Verification: revalidate-g3-foundations

## Scope and source

G3 item 0 ([G3 work plan](/docs/g3-plan.md#work-items), row 0), by the owner's decision of 2026-10-26: an independent revalidation of the merged G3 groundwork, items 1, 2, 3, 5, 6, 7, and 8, against G2 as built ([ADR 0015](/docs/decisions/0015-g2-closure.md)). The coordinator, Niki, assigned it and confirmed the reviewers ([design](design.md) D3). Documentation only: no runtime impact. This change records the revalidation and fixes no artifact; each substantive finding becomes a follow-up change below.

## Revision

- Base of the baseline: `origin/dev` `eda6c283` (#349).
- Reviewed revision of pass 1: `e6d86a67`, the merge of `dev` `71c6ce70` into this branch, which carries the prerequisite `scope-review-passes-by-artifact` (#353).
- Merge of `dev` `a00cbe3a` (#354, finalized G3 work plan) into this branch: `d28ed3ec`, tree `d68e0a6539e8330fad01d6e4bbc8e19ca6b3f433`.
- Change records: `e9f35c5d` corrects the Dockerfile lines of design D1 (item 2 pass 1 L2); the pass 1 records follow in one commit.

## Environment

To be filled: host, Node.js version from `.nvmrc`, and the network access of each reviewer.

## Author self-check

To be filled before pass 1 of any item: the records against the review criteria, the baseline of design D1 against `eda6c283`, and the evidence check (every external link pinned or labeled, and `npm run verify:links`).

## Checks and results

- **Coordinator exception** (Niki, 2026-10-27). This records-only change started pass 1 without `make verify`. The pre-review checks on `e6d86a67` were `npm run openspec -- validate revalidate-g3-foundations --strict`, `npm run verify:findings`, and `npm run verify:links`, all passing. `make verify` runs before the pass 2 records.
- **`make verify`** (2026-10-27) ran on the merge of `dev` `a00cbe3a`, tree `d68e0a6539e8330fad01d6e4bbc8e19ca6b3f433`, in a temporary detached worktree, because reviews were running in this one: exit 0. Coverage over all files: 99.29 % lines, 92.15 % branches, 99.01 % functions. OpenSpec: 70 passed, 0 failed. Findings: 32 findings files and 12 pass summary files valid. Links conform. The merge `d28ed3ec` of this branch has the same tree, `d68e0a6539e8330fad01d6e4bbc8e19ca6b3f433`, as observed with `git rev-parse HEAD^{tree}`.
- **Pass 1 records** (2026-10-27): `npm run verify:findings`, `npm run verify:links`, `npm run openspec -- validate revalidate-g3-foundations --strict`, and `npm run verify:comments` pass.

## Summary per item

| Item | Capability | Result: current / needs a fix | Follow-ups |
| --- | --- | --- | --- |
| 1 | `g3-dependency-evaluation` | Pending: pass 1 not run | |
| 2 | `harness-qualification`, `scm-qualification` | Needs a fix (pending pass 2) | `recheck-provider-terms-pages` |
| 3 | `agent-harness-port` | Current (review complete) | None |
| 5 | `account-pool-port` | Pending: pass 1 not run | |
| 6 | `git-workspace-port` | Needs a fix (pending pass 2) | `align-git-workspace-with-execution-boundary` |
| 7 | `scm-port` | Needs a fix (pending pass 2) | `align-scm-port-with-g2-credentials` |
| 8 | `product-ports` | Pending: pass 1 not run | |

## Follow-up changes

| Proposed name | Item | Size S/M/L | Findings |
| --- | --- | --- | --- |
| `recheck-provider-terms-pages` | 2 | S | Pass 1 H1, H2 (Medium), H3, L1 |
| `align-git-workspace-with-execution-boundary` | 6 | M | Pass 1 H1, M1 |
| `align-scm-port-with-g2-credentials` | 7 | S | Pass 1 H1, M1, L1 |

## Independent review

Criteria: `AGENTS.md`, the ADR 0004 principles, the governance review process, the artifact's living spec and contract, and the checks of [design](design.md) D2. Per item, under design D4: reviewer A makes pass 1, reviewer B pass 2, and reviewer A pass 3. A substantive finding is `deferred` to a follow-up change; a correction of these records is `fixed`.

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
| 1 | Claude Code `claude-fable-5-1`, replacing OpenCode `kimi-k3.1-pro` | Claude Code `claude-opus-5-5`, replacing `claude-fable-5-1` (same harness: network) | Claude Code `claude-fable-5-1` |
| 2 | OpenCode `deepseek-v4-pro` (ran) | Claude Code `claude-opus-5-5` | Claude Code `claude-fable-5-1`, replacing OpenCode (paused); same harness as B for network; proposed to the coordinator |
| 3 | OpenCode `kimi-k2.7-code` (ran) | Not used: pass 1 had no findings | Not used |
| 5 | Codex `gpt-6.1-sol`, replacing OpenCode `qwen3.8-max` | Claude Code `claude-opus-5-5`, replacing Codex `gpt-6.1-sol` | Codex `gpt-6.1-sol` |
| 6 | OpenCode `kimi-k3.1-pro` (ran) | Claude Code `claude-fable-5-1` | Codex `gpt-6-astra`, replacing OpenCode (paused); proposed to the coordinator |
| 7 | OpenCode `deepseek-v4-pro` (ran) | Codex `gpt-6-astra` | Claude Code `claude-fable-5-1`, replacing OpenCode (paused); proposed to the coordinator |
| 8 | Codex `gpt-6-astra`, replacing OpenCode `kimi-k2.7-code` | Claude Code `claude-opus-5-5` | Codex `gpt-6-astra` |

### Item 1

Reviewer A: Claude Code `claude-fable-5-1`, replacing OpenCode `kimi-k3.1-pro`. Reviewer B: Claude Code `claude-opus-5-5` (see "Reviewers and replacements").

- Pass 1 (reviewer A): not run. The attempt of OpenCode `kimi-k3.1-pro` failed (see "Failed attempts").
- Pass 2 (reviewer B): not run.
- Pass 3 (reviewer A): not run.

| Finding | Resolution |
| --- | --- |

### Item 2

Reviewer A: OpenCode `deepseek-v4-pro`, variant `high`; pass 3 by Claude Code `claude-fable-5-1`, proposed to the coordinator. Reviewer B: Claude Code `claude-opus-5-5`.

- Pass 1 (reviewer A): OpenCode `opencode-go/deepseek-v4-pro#high`, session `ses_e820b5099ffe47tEDDDalELhZs`, with the common facts above. The reviewer checked the cited provider pages on the web, accessed 2026-10-27. Findings: critical 0, high 2, medium 1, low 2. Verdict: needs a fix.
- Pass 2 (reviewer B): not run.
- Pass 3 (reviewer A): not run.

| Finding | Resolution |
| --- | --- |
| Pass 1 H1 (High): the current Anthropic Usage Policy names services that route requests through consumer subscriptions; `docs/qualification/claude-code.md` omits the clause and still says pooling is not named | Deferred to `recheck-provider-terms-pages`. Reported to the coordinator for the owner, because it bears on owner decision D15 |
| Pass 1 H2 (Medium, labelled H2 by the reviewer): the Agent SDK overview now states that the SDK is governed by the Commercial Terms; the record does not say so | Deferred to `recheck-provider-terms-pages` |
| Pass 1 H3 (High): the Codex App Server page was rewritten and no longer carries the authentication statement that `docs/qualification/codex.md` quotes as its most direct source | Deferred to `recheck-provider-terms-pages` |
| Pass 1 L1 (Low): the legal and compliance page adds a sentence allowing customers to provision their own API keys; the record misses it | Deferred to `recheck-provider-terms-pages` |
| Pass 1 L2 (Low, record): design D1 cited `infra/installation/Dockerfile:53` to `:55` for the `worker-harnesses` stage | Fixed in `e9f35c5d`: the stage and its `DISABLE_AUTOUPDATER=1` are at lines 72 to 74 |

The reviewer found the GitHub terms unchanged and no GitHub finding.

### Item 3

Reviewer A: OpenCode `kimi-k2.7-code`. Reviewer B: Codex `gpt-6-astra`.

- Pass 1 (reviewer A): OpenCode `opencode-go/kimi-k2.7-code` with the default variant, session `ses_e820b521affeurgQycMvs2Ouxm`, with the common facts above. Findings: critical 0, high 0, medium 0, low 0. Verdict: current. A pass without findings ends the item's review.
- Pass 2 (reviewer B): not run: pass 1 had no findings.
- Pass 3 (reviewer A): not run: pass 1 had no findings.

| Finding | Resolution |
| --- | --- |

### Item 5

Reviewer A: Codex `gpt-6.1-sol`, replacing OpenCode `qwen3.8-max`. Reviewer B: Claude Code `claude-opus-5-5` (see "Reviewers and replacements").

- Pass 1 (reviewer A): not run. The attempt of OpenCode `qwen3.8-max` failed (see "Failed attempts").
- Pass 2 (reviewer B): not run.
- Pass 3 (reviewer A): not run.

| Finding | Resolution |
| --- | --- |

### Item 6

Reviewer A: OpenCode `kimi-k3.1-pro`, variant `high`; pass 3 by Codex `gpt-6-astra`, proposed to the coordinator. Reviewer B: Claude Code `claude-fable-5-1`.

- Pass 1 (reviewer A): OpenCode `opencode-go/kimi-k3.1-pro#high`, session `ses_e820b523fffeM2gZJeWSk2ZIaJ`, with the common facts above. Findings: critical 0, high 1, medium 1, low 0. Verdict: needs a fix.
- Pass 2 (reviewer B): not run.
- Pass 3 (reviewer A): not run.

| Finding | Resolution |
| --- | --- |
| Pass 1 H1 (High): `worker/workspaces/<attemptId>/checkout/` is the harness working directory, but the execution account (uid 10003) cannot pass the worker's private `worker/` of mode `0700`; the test double does not model the modes | Deferred to `align-git-workspace-with-execution-boundary` |
| Pass 1 M1 (Medium): the contract does not state the account and cgroup of the Git processes of workspace operations, so they could run inside an execution's containment | Deferred to `align-git-workspace-with-execution-boundary` |

The reviewer found the `<attemptId>` rule consistent with G2's attempt identities and the cleanup complete against the control records.

### Item 7

Reviewer A: OpenCode `deepseek-v4-pro`, variant `high`; pass 3 by Claude Code `claude-fable-5-1`, proposed to the coordinator. Reviewer B: Codex `gpt-6-astra`.

- Pass 1 (reviewer A): OpenCode `opencode-go/deepseek-v4-pro#high`, session `ses_e820b51e7ffe7wuRbbCB2OJ9La`, with the common facts above. Findings: critical 0, high 1, medium 1, low 1. Verdict: needs a fix.
- Pass 2 (reviewer B): not run.
- Pass 3 (reviewer A): not run.

| Finding | Resolution |
| --- | --- |
| Pass 1 H1 (High): the contract and spec promise that a run credential's secret is never logged or stored, while G2 redacts only the installation's shapes and no spawn path calls `scrubEnvironment` | Deferred to `align-scm-port-with-g2-credentials` |
| Pass 1 M1 (Medium): the webhook receiver does not state that it needs ingress and TLS, which the G2 installation lacks | Deferred to `align-scm-port-with-g2-credentials` |
| Pass 1 L1 (Low): `source-control-readers.ts` parses several opaque identifiers as text, so an empty value passes | Deferred to `align-scm-port-with-g2-credentials` |

The reviewer proposed two follow-ups; the worker grouped all three findings into one, as the coordinator named it.

### Item 8

Reviewer A: Codex `gpt-6-astra`, replacing OpenCode `kimi-k2.7-code`. Reviewer B: Claude Code `claude-opus-5-5`.

- Pass 1 (reviewer A): not run. The attempt of OpenCode `kimi-k2.7-code` failed (see "Failed attempts").
- Pass 2 (reviewer B): not run.
- Pass 3 (reviewer A): not run.

| Finding | Resolution |
| --- | --- |

## Limitations

- The pass 3 replacements of items 2, 6, and 7 are proposed to the coordinator and not yet confirmed.
- Medium or higher findings deferred to a follow-up are not re-reviewed in this change; each follow-up has its own review ([design](design.md) D4).

## Remaining gates

- Pass 1 of items 1, 5, and 8 with the replacement reviewers; passes 2 and, where needed, 3 of items 2, 6, and 7
- `make verify` before the pass 2 records
- Coordinator confirmation of the proposed pass 3 replacements
- Summary per item and follow-up list complete, handed to the coordinator
- Integration into dev by the coordinator (single pull request)
- Follow-up fixes land before any other G3 item starts
