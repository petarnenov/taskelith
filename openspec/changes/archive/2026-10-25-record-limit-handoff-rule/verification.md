## Scope and source

Change `record-limit-handoff-rule`, assigned by the coordinator on 2026-10-25 with Codex CLI (`gpt-6.1-sol`, medium effort, read-only) as the reviewer. Source: the owner's clarification of 2026-10-25 in the project conversation, given in Bulgarian and paraphrased here: when a session's subscription hits a usage or rate limit, the session writes a handoff and stops, and the work continues in a new session that reads the handoff; the new session goes only to a different harness, because the same harness on another subscription after a limit is the clearest case of "rotating accounts"; if no other harness is eligible, the task waits for the cooldown. Scope: ADR 0005 decisions 4 and 5 and status, G3 plan items 4, 5, 12, and 18, "Consequences for D15" in the Codex and Claude Code qualification records, and the `harness-account-pools` "Session affinity" requirement. Excluded: code, and any change to D15, which the owner decided as (a).

## Revision and environment

Branch `record-limit-handoff-rule` from `origin/dev` at `ba24952`. macOS x86_64, Node.js through nvm, OpenSpec through `npm run openspec`.

## Author self-check and evidence check

- The ADR amendment adds the limit rule to decision 4 and limits decision 5's general rule for an unavailable slot to causes other than a limit; no other decision changed.
- "Waits for the cooldown" is read as waiting for the limited slot and continuing on it (`design.md`, "After the wait"); this reading is the author's and is reported to the coordinator.
- The plan clauses are one clause each; item 13 is unchanged because it implements item 4.
- The qualification sentences state what the rule does and add no legal conclusion; no quote was added or changed.
- `git diff origin/dev...HEAD` touches only Markdown under `docs/` and this change.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate record-limit-handoff-rule --strict` | Passed before review |
| `make verify` | Passed at `25083cc` before pass 1, but recorded only after it; passed again at `807bc4b` before pass 2; the `pre-push` hook runs it on the final head |

## Review

Pass 1 (Codex CLI):
- Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, at head `25083cc`; the prompt and output were kept outside the worktree. The prompt named `AGENTS.md`, ADR 0004, the governance review process, ADR 0005, the G3 plan, both qualification records, and the `harness-account-pools` specification with its delta, and asked for a judgment of the "After the wait" reading.
- Model confirmation: the output header shows `model: gpt-6.1-sol`, `reasoning effort: medium`, and `sandbox: read-only`. Session ID `01a174ec-96e9-75b3-bde6-6bb3298da448`.
- Snapshot: `d330dec5761a8ff9dc4086d4bad94884464174da1230c712dc2cd218e25b69d3` before and after the pass.
- Findings: 0 Critical, 0 High, 2 Medium, 1 Low. The reviewer judged the "After the wait" reading sound.
  1. Medium: item 5, the selection contract, lacked the selection after a limit that item 12 implements. Resolution: added to item 5 and to the proposal, design, and tasks.
  2. Medium: `make verify` was recorded as pending before pass 1. It had passed at `25083cc` before the pass but was not recorded; the table now says so.
  3. Low: the delta's last sentence could be read with the slot as the subject. Resolution: the session is the subject.

Pass 2 (Codex CLI):
- Invocation as in pass 1, at head `807bc4b`; the prompt named pass 1's session and asked the reviewer to confirm each resolution and review the whole change again.
- Model confirmation: `model: gpt-6.1-sol`, `reasoning effort: medium`, `sandbox: read-only` in the output header. Session ID `01a174f0-04e1-72b0-a6d0-9f5b04d89dbc`.
- Snapshot: `f87c240b95a22c811937c3d7e5951cbcc8858b53a08781a3c00fccc64002e27c` before and after the pass.
- Findings: 0 Critical, 0 High, 0 Medium, 0 Low. All three pass-1 resolutions were confirmed, and the "After the wait" reading was judged sound again.

After pass 2, only this file and `tasks.md` changed, to record the pass; that change is not reviewed.

## Limitations

Documentation only; nothing is implemented. The handoff's format is left to G3 items 4 and 18.

## Remaining gates

Handoff, integration, and archive.
