## Context

ADR 0005 decision 5 already keeps a session on the slot that started it and forbids silently moving it when that slot is unavailable. It says nothing about the harness, and nothing about how long the binding lasts. The terms reviews found that rotation across accounts meets OpenAI's "rotating accounts" prohibition directly and may be read under Anthropic's terms as bypassing protective measures.

## Goals / Non-Goals

**Goals:**
- Record the owner's 2026-10-25 rule: harness and slot fixed per session until the session and its agent are closed.
- Make the rule visible where G3 implements it.

**Non-Goals:**
- Pinning across a task; the owner rejected it.
- Changing D15, least-loaded selection, cooldown, or any code.
- A legal conclusion on whether the rule satisfies any provider's terms.

## Decisions

- **Inline amendment.** The rule refines one decision of ADR 0005 and has a single owner source, so it is recorded as a dated, italic amendment inside decision 5 and named in the status, as ADR 0004 principle 8 and ADR 0003 decision 11 record theirs. A separate ADR, as ADR 0008 is, carries several decisions of its own; this change has one.
- **Reconciliation.** ADR 0005 let an operator or policy explicitly reconcile a session whose slot is unavailable, without saying whether that may move it. Because the owner's rule forbids switching a session's harness or slot, explicit reconciliation now drains or ends the session, and its work may continue in a new session chosen by the normal selection.
- **Plan items.** Items 5 and 12 own the pool contract and its implementation. Item 18 owns harness invocation and reconciliation after a restart, so it carries the clause that a session's harness and slot are never switched. Item 13 records turns and does not choose a harness or slot, so it is unchanged.
- **Qualification records.** Each "Consequences for D15" gets one factual sentence: the rule keeps a running session on its account, while new sessions are still spread across slots. Whether that spreading is rotation stays in the existing "Ambiguous" findings.
- **Spec delta.** The `harness-account-pools` "Session affinity" requirement is modified, with a scenario for a new session of the same task, because the existing requirement names only the slot.

## Risks / Trade-offs

- A session that holds its slot through a long cooldown waits instead of moving → this is the existing ADR 0005 rule for an unavailable slot, kept on purpose.
