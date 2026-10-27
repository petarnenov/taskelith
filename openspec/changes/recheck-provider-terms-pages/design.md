## Context

G3 item 0 re-reviewed the provider terms record of G3 item 2 and deferred its item 2 findings to this change; the archived [verification of `revalidate-g3-foundations`](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md#item-2) and its `findings.jsonl` hold them. The owner decided D15 (a) on 2026-10-25 from the review of that day. The coordinator told the owner that the review omitted the routing clause, and D15 and ADR 0005 decision 2 are pending the owner's view; this change records facts and the open question only.

## Decisions

- **D1. Verbatim quotes from the live pages.** Each added passage is quoted word for word from the page as served on 2026-10-27, with the access date in the record ("(accessed 2026-10-27)"). The Claude Code docs pages render typographic apostrophes (U+2019), while their Markdown exports (`.md` suffix) use ASCII apostrophes; the record keeps the ASCII apostrophes it already used, and the quote checks normalize U+2019 to ASCII and collapse whitespace. The Markdown exports also carry link and emphasis markup, such as `[Anthropic's Commercial Terms of Service](…)` and `**The Claude Code binary must not be modified.**`; a check against an export first replaces each Markdown link with its text and removes the `**` and `*` emphasis markers. The links that the Agent SDK overview carries inside its sentence are not reproduced.
- **D2. Omitted, not added.** Pass 1 H1, H2, and L1 and pass 2 M2, M3, and L1 concern passages that were on the pages before the 2026-10-25 review. The record says so and names dated Wayback Machine snapshots of each page from 2026-10-20 and 2026-10-24 that carry every added passage, plus the 2026-10-26 snapshot of the Usage Policy that pass 1 H1 cites. The Usage Policy passages belong to the version effective Nov 12, 2026, which the page marked current already showed then; the record also states what the Sep 15, 2025 version has instead, because the record's other Usage Policy quotes come from that version.
- **D3. Placement.** Each passage goes where its finding points: the routing and bypass clauses and the hosting conditions into "Account sharing and pooled subscriptions" (pass 1 H1, pass 2 M2 and M3), the sign-in and API key passages into "Credential storage and intermediation" (pass 2 L1, pass 1 L1), the Agent SDK terms into "Which terms govern" (pass 1 H2), and the routing, bypass, and hosting passages also into "Consequences for D15" (pass 2 M2 and M3 cite those lines). Each section's "text says" and "ambiguous" bullets name the new passages; the ambiguity bullets state questions, not conclusions.
- **D4. No decision on D15 or ADR 0005.** D15 and ADR 0005 decision 2 are the owner's (PENDING-HUMAN). The record ends "Consequences for D15" with one paragraph: the facts that the decision of 2026-10-25 was taken without these passages, and an "Open question for the owner" with no recommendation. `docs/g3-plan.md` and ADR 0005 are not edited.
- **D5. Pass 1 H3 declined again.** The Codex App Server sentences that `docs/qualification/codex.md` quotes are on the live page and on a Wayback snapshot of 2026-10-24; `verification.md` records the evidence. `codex.md` changes only its status line (pass 2 L2).
- **D6. OpenAI pages.** `openai.com` still answers HTTP 403 to a scripted request; the Codex record keeps its Wayback snapshots unchanged. The App Server page lives on `learn.chatgpt.com`, which answered 200.
- **D7. No spec delta.** The `harness-qualification` requirement "Provider terms review" already requires quoting each relevant clause with its URL, effective date, and access date, and leaves the risk to the owner. The change sets `skip_specs: true` in `.openspec.yaml`, as documentation-only work under an existing requirement may ([worker step 2](/docs/agent-task-protocol.md#worker-steps)), like the docs-only follow-up `refresh-g3-dependency-observations` of the same item 0.
- **D8. Reviewers.** The coordinator assigned two Claude Code reviewers, reviewer A `claude-fable-5-1` and reviewer B `claude-opus-5-5` with effort `high`, because the review needs network access to re-read the provider pages ([External facts](/docs/governance.md#independent-review-process)) and Codex, the other harness, has none.

## Risks

- The pages are unversioned and may change after 2026-10-27; the Wayback snapshots pin what the record cites for the dates before the 2026-10-25 review, and the live passages carry their access date.
- The Wayback Machine had no snapshot of the Usage Policy, Legal and compliance, or Agent SDK overview page on 2026-10-25 itself; the record cites the closest snapshots before (2026-10-24) and, for the Usage Policy, after (2026-10-26) that date.

## Review checklist

Output of `make findings ARGS="checklist --capability harness-qualification,harness-account-pools --files docs/qualification/claude-code.md,docs/qualification/codex.md"` on 2026-10-27 at `4cbea974`:

```text
Review checklist (capabilities harness-qualification, harness-account-pools; files docs/qualification/claude-code.md, docs/qualification/codex.md), most frequent finding categories first:
1. docs (7): Documentation is missing, wrong, or out of date with the change. Example: "The Codex status line still lists the provider terms review as open"
2. contract-drift (1): Code, a contract document, and its specification disagree. Example: "The usage window also governs the tie-breaker test of the pool contract and this spec, places that pass 1 M1 did not list"
3. stale-citation (1): A cited file line, commit, or record no longer matches its target. Example: "The Codex App Server page no longer carries the quoted authentication statement that anchors the strongest OpenAI conclusion"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (44): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
2. docs (41): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
3. stale-citation (19): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
4. spec-wording (18): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
5. process (9): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
6. contract-drift (6): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
7. scope (5): The change does more or less than its assigned scope. Example: "Design D6 defines size M as a contract, its spec, and its port types, while the SCM follow-up also changes the port's readers and conformance case"
```
