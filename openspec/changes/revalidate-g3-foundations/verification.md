# Verification: revalidate-g3-foundations

## Scope and source

G3 item 0 ([G3 work plan](/docs/g3-plan.md#work-items), row 0), by the owner's decision of 2026-10-26: an independent revalidation of the merged G3 groundwork, items 1, 2, 3, 5, 6, 7, and 8, against G2 as built ([ADR 0015](/docs/decisions/0015-g2-closure.md)). The coordinator, Niki, assigned it and confirmed the reviewers ([design](design.md) D3). Documentation only: no runtime impact. This change records the revalidation and fixes no artifact; each substantive finding becomes a follow-up change below.

## Revision

- Base and reviewed revision of the artifacts: `origin/dev` `eda6c283` (#349).
- Change records: to be filled with each commit of this change.
- Prerequisite: `scope-review-passes-by-artifact`, not yet merged ([design](design.md) D5).

## Environment

To be filled: host, Node.js version from `.nvmrc`, and the network access of each reviewer.

## Author self-check

To be filled before pass 1 of any item: the records against the review criteria, the baseline of design D1 against `eda6c283`, and the evidence check (every external link pinned or labeled, and `npm run verify:links`).

## Checks and results

To be filled: `npm run openspec -- validate revalidate-g3-foundations --strict`, `npm run verify:links`, `npm run verify:findings`, and `make verify`, each with its date and result.

## Summary per item

| Item | Capability | Result: current / needs a fix | Follow-ups |
| --- | --- | --- | --- |
| 1 | `g3-dependency-evaluation` | | |
| 2 | `harness-qualification`, `scm-qualification` | | |
| 3 | `agent-harness-port` | | |
| 5 | `account-pool-port` | | |
| 6 | `git-workspace-port` | | |
| 7 | `scm-port` | | |
| 8 | `product-ports` | | |

## Follow-up changes

| Proposed name | Item | Size S/M/L | Findings |
| --- | --- | --- | --- |

## Independent review

Criteria: `AGENTS.md`, the ADR 0004 principles, the governance review process, the artifact's living spec and contract, and the checks of [design](design.md) D2. Per item, under design D4: reviewer A makes pass 1, reviewer B pass 2, and reviewer A pass 3. A substantive finding is `deferred` to a follow-up change; a correction of these records is `fixed`.

### Item 1

Reviewer A: OpenCode `kimi-k3.1-pro`. Reviewer B: Claude Code `claude-fable-5-1`.

- Pass 1 (reviewer A): not run. Reviewer, invocation, model confirmation, session, snapshot before and after, findings by severity, and verdict to be filled.
- Pass 2 (reviewer B): not run.
- Pass 3 (reviewer A): not run.

| Finding | Resolution |
| --- | --- |

### Item 2

Reviewer A: OpenCode `deepseek-v4-pro`. Reviewer B: Claude Code `claude-opus-5-5`.

- Pass 1 (reviewer A): not run. Reviewer, invocation, model confirmation, session, snapshot before and after, findings by severity, and verdict to be filled.
- Pass 2 (reviewer B): not run.
- Pass 3 (reviewer A): not run.

| Finding | Resolution |
| --- | --- |

### Item 3

Reviewer A: OpenCode `kimi-k2.7-code`. Reviewer B: Codex `gpt-6-astra`.

- Pass 1 (reviewer A): not run. Reviewer, invocation, model confirmation, session, snapshot before and after, findings by severity, and verdict to be filled.
- Pass 2 (reviewer B): not run.
- Pass 3 (reviewer A): not run.

| Finding | Resolution |
| --- | --- |

### Item 5

Reviewer A: OpenCode `qwen3.8-max`. Reviewer B: Codex `gpt-6.1-sol`.

- Pass 1 (reviewer A): not run. Reviewer, invocation, model confirmation, session, snapshot before and after, findings by severity, and verdict to be filled.
- Pass 2 (reviewer B): not run.
- Pass 3 (reviewer A): not run.

| Finding | Resolution |
| --- | --- |

### Item 6

Reviewer A: OpenCode `kimi-k3.1-pro`. Reviewer B: Claude Code `claude-fable-5-1`.

- Pass 1 (reviewer A): not run. Reviewer, invocation, model confirmation, session, snapshot before and after, findings by severity, and verdict to be filled.
- Pass 2 (reviewer B): not run.
- Pass 3 (reviewer A): not run.

| Finding | Resolution |
| --- | --- |

### Item 7

Reviewer A: OpenCode `deepseek-v4-pro`. Reviewer B: Codex `gpt-6-astra`.

- Pass 1 (reviewer A): not run. Reviewer, invocation, model confirmation, session, snapshot before and after, findings by severity, and verdict to be filled.
- Pass 2 (reviewer B): not run.
- Pass 3 (reviewer A): not run.

| Finding | Resolution |
| --- | --- |

### Item 8

Reviewer A: OpenCode `kimi-k2.7-code`. Reviewer B: Claude Code `claude-opus-5-5`.

- Pass 1 (reviewer A): not run. Reviewer, invocation, model confirmation, session, snapshot before and after, findings by severity, and verdict to be filled.
- Pass 2 (reviewer B): not run.
- Pass 3 (reviewer A): not run.

| Finding | Resolution |
| --- | --- |

## Limitations

- No finding or pass line can be recorded before `scope-review-passes-by-artifact` is merged into this branch ([design](design.md) D5).
- Medium or higher findings deferred to a follow-up are not re-reviewed in this change; each follow-up has its own review ([design](design.md) D4).

## Remaining gates

- Prerequisite `scope-review-passes-by-artifact` merged into `dev` and into this branch
- Passes of items 1, 2, 3, 5, 6, 7, and 8
- Summary per item and follow-up list complete, handed to the coordinator
- Integration into dev by the coordinator (single pull request)
- Follow-up fixes land before any other G3 item starts
