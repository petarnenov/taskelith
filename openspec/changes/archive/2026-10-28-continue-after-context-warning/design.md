# Design

## Context

Since 2026-10-25 a session whose context approaches 150,000 tokens tells the
owner and recommends `/compact` or `/clear`, which only the owner can run. On
2026-10-28 the owner kept the warning and the advice but decided that the
session does not stop to wait for them.

## Goals and non-goals

- Goals: every place that states the rule says the session continues
  without waiting, and nothing there implies a stop, pause, or wait.
- Non-goals: the hook, its threshold, its message, the record-first and
  recommend-one rules, and any automatic compaction.

## Decisions

### D1. Where the rule is stated

A search outside `openspec/changes/archive/` and `node_modules` for
`150,000`, `/compact`, `/clear`, `Context size`, `context-warning`, `warns
before`, and the worker bullet found the rule in `docs/agent-task-protocol.md`
"Context size", `AGENTS.md`, the `taskelith-task-protocol` skill, the
`taskelith-coordinator` skill (a pointer to the section), the living spec
`agent-task-protocol`, and the hook. `docs/governance.md` does not hold it.
`docs/fleet.md` mentions `/clear` only to say that the owner does not clear a
worker's session after each integration, and the `taskelith-worker` skill does
not state the rule; both stay unchanged.

### D2. The worker bullet

The bullet said the coordinator "sends it no work until the worker reports
that it is ready again". Ready again means after the owner's `/compact` or
`/clear`, so the worker would sit idle until the owner acted, which is the
wait the owner removed. The bullet now says the worker tells the coordinator
and keeps its task going; the hold on new work is dropped, not reworded.

### D3. The coordinator skill

Its sentence only pointed to the section. It gains one short sentence that
the coordinator warns the owner as the section says and then continues
without waiting, so that the skill does not restate the rule's details.

### D4. The hook stays as it is

`scripts/context-warning.ts` prints "record what a reset would lose, tell the
owner, and recommend /compact or /clear". It tells no session to stop or
wait, so its message and `test/context-warning.test.ts` stay unchanged.

### D5. "Only `/compact` in the middle of a task"

The recommend-one rule still reads right: it chooses which command to
recommend, not whether to pause. The skill sentence now ends "then continue
without waiting", after the parenthesis.

## Risks

- A session that keeps working past the warning may reach the limit before
  the owner acts; the record-first rule keeps what a reset would lose.

## Review checklist

The brief's checklist is saved as [checklist.json](checklist.json). Its top
categories here: contract-drift and docs (the protocol, `AGENTS.md`, the two
skills, and the spec delta say the same thing, D1), error-handling (not
touched: the hook is unchanged, D4), and missing-fail-before-test (no code or
test changes, so no fail-before test applies).
