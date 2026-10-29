## Why

G3 item 13 ([G3 plan](/docs/g3-plan.md) row 13), sub-change 13d. The archived 13a `implement-session-timeline` redacts each output chunk alone, so a secret that a harness writes across two chunks is stored in two harmless-looking halves, and 13a and 13b therefore expose no output read (13a answer Q5, 13b answer Q1). [Control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 7, "Output across chunks", requires a generation's output to be redacted as one text with a durable held tail, and the archived 13b design (decision 3, answers Q1, Q6, and Q8) moved that work and the `readAgentSessionOutput` route here.

## What Changes

- Output: the session timeline service holds back the tail of a turn's output that could still be the start or a part of a secret of a known shape, keeps it durably and never shows it, and records only text released and redacted: when a later chunk shows the tail is none, when the turn or its generation ends, also through recovery, or when the tail passes its bound of `MAX_HARNESS_TEXT_LENGTH` code units.
- Entries: released text longer than `MAX_HARNESS_TEXT_LENGTH` becomes several entries split on whole characters, instead of the 13a cut.
- Read: `SessionTimelineService.readOutput` pages the retained window in one transaction, and the control plane serves `readAgentSessionOutput` (wire contracts section 9) with the project role checks and the 404 rule of 13b.
- Storage: migration `1792933200000_session-output-tail.sql` adds the held tail table.
- Contract: wire contracts section 7 states the bound, the release at a turn's end, and the rule for a run past the bound.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-turn-model`: output redacted across chunks with a held tail, its bound, its release, entry splitting, and the output read; the 13a requirement "No output read before cross-chunk redaction" is removed.
- `control-plane-api`: `readAgentSessionOutput` served.
- `control-plane-wire-contracts`: the held tail's bound and release on the wire, and output pages.
- `postgres-state`: the held tail table.

## Impact

Private workspace packages `@taskelith/execution`, `@taskelith/secrets`, `@taskelith/postgres`, and `@taskelith/control-plane`; commit type `chore`. The wire contract document changes in section 7 only; `control-plane.openapi.json` already describes `readAgentSessionOutput` and is unchanged. No new third-party dependency, no event stream (item 14), no worker message (13c), and no redaction of credentials revealed to a run (13c, from 12c's delivery record).
