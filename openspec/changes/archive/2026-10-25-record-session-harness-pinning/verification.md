## Scope and source

Change `record-session-harness-pinning`, assigned by the coordinator on 2026-10-25 with Codex CLI (`gpt-6.1-sol`, medium effort, read-only) as the reviewer by rotation. Source: the owner's decision of 2026-10-25 in the project conversation, given in Bulgarian and paraphrased here: to avoid the "rotating accounts" problem the terms reviews found, a session keeps the harness and the subscription slot it started with until its work is finished and the session and its agent are closed; neither is switched during the session; pinning across a whole task is rejected, and a new session of the same task may get a different harness or slot by the normal selection. Scope: ADR 0005 decision 5 and status, G3 plan items 5, 12, and 18, "Consequences for D15" in the Codex and Claude Code qualification records, and the `harness-account-pools` "Session affinity" requirement. Excluded: code, and any change to D15, which the owner decided as (a).

## Revision and environment

Branch `record-session-harness-pinning` from `origin/dev` at `d99423c`. macOS x86_64, Node.js through nvm, OpenSpec through `npm run openspec`.

## Author self-check and evidence check

- The ADR amendment keeps the existing rule for an unavailable slot and adds the harness, the duration, and the per-session scope; no other ADR 0005 decision changed.
- The plan clauses are one clause each and do not restate the ADR; item 13 is unchanged because it chooses neither harness nor slot.
- The qualification sentences state what the rule does and add no legal conclusion; no quote was added or changed.
- `git diff origin/dev...HEAD` touches only Markdown under `docs/` and this change.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate record-session-harness-pinning --strict` | Passed before review |
| `make verify` | Passed before pass 1 (`b28a38f`) and before pass 2 (`bbf0748`); the `pre-push` hook runs it on the final head |

## Review

Pass 1 (Codex CLI):
- Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, at head `b28a38f`; the prompt and output were kept outside the worktree. The prompt named `AGENTS.md`, ADR 0004, the governance review process, ADR 0005, the amendment convention, the G3 plan, both qualification records, and the `harness-account-pools` specification with its delta.
- Model confirmation: the output header shows `model: gpt-6.1-sol`, `reasoning effort: medium`, and `sandbox: read-only`. Session ID `01a174cf-8322-7a02-ab17-3b4cce299408`.
- Snapshot: `ea92a673c8c7fa8c44e821cbbce9c7937aeb75d3ca65709f33379b7ea23db049` before and after the pass.
- Findings: 0 Critical, 0 High, 2 Medium, 1 Low.
  1. Medium: the revoked-slot scenario still allowed the session to continue on another slot after an explicit decision, against the owner's rule. Resolution: explicit reconciliation drains or ends the session and never moves it; its work may continue only in a new session (ADR 0005 decision 5, the delta's requirement and scenarios, and `design.md`).
  2. Medium: the plan item 5 clause and both qualification sentences shortened the binding to "until the session is closed". Resolution: all three now say until its work is finished and the session and its agent are closed.
  3. Low: "Remaining gates" omitted `make verify`. Resolution: added.

Pass 2 (Codex CLI):
- Invocation as in pass 1, at head `bbf0748`; the prompt named pass 1's session and asked the reviewer to confirm each resolution, judge the reconciliation reading in `design.md` against the owner's rule, and review the whole change again.
- Model confirmation: `model: gpt-6.1-sol`, `reasoning effort: medium`, `sandbox: read-only` in the output header. Session ID `01a174d2-ba90-76c1-b56a-22f4a3f38c02`.
- Snapshot: `90540a0d0f9b537341b9589f2a57deb00ff5572fc2728c6cdf8d87e6a0058759` before and after the pass.
- Findings: 0 Critical, 0 High, 0 Medium, 0 Low. All three pass-1 resolutions were confirmed, and the reconciliation reading was judged faithful to the owner's rule.

After pass 2, only this file and `tasks.md` changed, to record the pass; that change is not reviewed.

## Limitations

Documentation only; nothing is implemented.

## Remaining gates

Handoff, integration, and archive.
