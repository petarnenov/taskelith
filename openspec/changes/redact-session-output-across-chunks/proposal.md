## Why

G3 item 13 ([G3 plan](/docs/g3-plan.md) row 13), sub-change 13d. The archived 13a `implement-session-timeline` redacts each output chunk alone, so a secret that a harness writes across two chunks is stored in two harmless-looking halves, and 13a and 13b therefore expose no output read (13a answer Q5, 13b answer Q1). [Control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 7, "Output across chunks", requires output to be redacted as one text with a durable held tail, and the archived 13b design (decision 3, answers Q1, Q6, and Q8) moved that work and the `readAgentSessionOutput` route here.

## What Changes

- Output: the session timeline service holds back the tail of a turn's output that could still be the start or a part of a secret of a known shape, keeps it durably and never shows it, and records only text released and redacted: when a later chunk shows the tail is none, or when the turn or its generation ends, also through recovery.
- Bound: a held part past `MAX_HARNESS_TEXT_LENGTH` code units is recorded as one marker, and a durable flag drops its continuation up to the next whitespace, or for a PEM key or `.creds` block up to its end marker, so nothing of a cut secret is released (coordinator answer Q1).
- At rest: the held tail is stored only as AES-256-GCM ciphertext under the 12a cipher, with the session, the turn, and the tail's version as authenticated data, under a new key `control-plane/session-output-tail.key` that `init` creates when missing (answer Q2).
- Entries: released text longer than `MAX_HARNESS_TEXT_LENGTH` becomes several entries split on whole characters, instead of the 13a cut (answer Q4).
- Read: `SessionTimelineService.readOutput` pages the retained window in one transaction, and the control plane serves `readAgentSessionOutput` (wire contracts section 9) with the project role checks and the 404 rule of 13b.
- Storage: migration `1792933200000_session-output-tail.sql` adds the sealed tail table.
- Contracts: wire contracts section 7 holds a turn's output as one text (answer Q3) and states the release, the bound, and the sealing; the installation contract lists the new key file.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-turn-model`: output redacted across chunks with a held tail, its bound, its release, its sealing, entry splitting, and the output read; the 13a requirement "No output read before cross-chunk redaction" is removed.
- `control-plane-api`: `readAgentSessionOutput` served, and the tail key created at initialization.
- `control-plane-wire-contracts`: the held tail on the wire, and output pages.
- `postgres-state`: the sealed tail table.

## Impact

Private workspace packages `@taskelith/execution`, `@taskelith/observability`, `@taskelith/secrets`, `@taskelith/postgres`, `@taskelith/control-plane-store`, and `@taskelith/control-plane`; commit type `chore`. Size M-L, accepted by the coordinator without a split. The wire contract document changes in section 7 only, and the installation contract in its namespace table; `control-plane.openapi.json` already describes `readAgentSessionOutput` and is unchanged. No new third-party dependency, no event stream (item 14), no worker message (13c), and no redaction of credentials revealed to a run (13c, from 12c's delivery record).
