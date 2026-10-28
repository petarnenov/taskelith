## Why

A third review pass runs when pass 2 still finds Medium or worse problems that pass 1 missed. Over the 50 archived single-artifact changes with review records, 16 (32%) needed a third pass, and the share grows with the change: 5% of changes under 100 changed lines, 39% from 100 to 399, and 67% from 400 lines on (`design.md` "Archived statistics"). Reviewers and their effort are assigned today without regard to the change. The owner proposed on 2026-10-28 to choose the reviewer and effort of each change by its complexity before review, so that a third pass becomes rare; the coordinator relayed the agreed plan as this change, size M.

## What Changes

- A new command, `make findings ARGS="route --change <change>"`, derives structured features of an active change from data the repository already holds (the diff against the merge base, the capabilities of its spec delta, the kinds of files it touches, the findings history of those capabilities, its `checklist.json` size, and whether its design records external facts), applies a deterministic rule, and writes the change's `route.json`.
- The rule router is the permanent floor. It picks a tier, `standard` or `elevated`, and from it a recommended reviewer and effort of pass 1 (reviewer A) and pass 2 (reviewer B), always within the owner's reviewer assignment of 2026-10-27, and never below today's configured effort. The recommendation binds nothing: the brief names the reviewers, and the elevated efforts need a later governance change that the owner approves (`design.md` "Decisions").
- A shadow router asks TypeSafe AI's Jev model (System One, typed classification) the same question with the structured features only, never source, diff text, file paths, or finding titles. Its choice and probabilities are recorded beside the rule's in `route.json` and decide nothing. Any failure (missing credential, 2 s timeout, HTTP error, invalid response) leaves the rule to decide alone and records a reason code.
- A hexagonal port, `ReviewRouter`, with the rule adapter, the Jev HTTP adapter (Node.js `fetch` with `AbortSignal.timeout`, no new dependency), and a fake for tests; a recorded-response test exercises the HTTP adapter against a local server.
- The credential is the environment variable `JEV_MAF_LAB`, read by name only; its value never reaches output, logs, errors, or records.
- `make findings ARGS="effect"` gains a routing section: per archived change with `route.json`, the rule's and the shadow router's choices beside the passes the change needed and its findings, with their agreement.
- A one-time offline evaluation runs the shadow router over the archived review records, without future information, once the owner has confirmed the account, the Master Customer Agreement, credits, and data consent and has set the credential, and records its result in this change.
- `docs/review-findings/route.schema.json` defines `route.json`; `make findings ARGS="validate"` checks every `route.json`.
- Phase 3, after `adopt-process-performance-recommendations` lands on `dev`: `scripts/findings.ts` dispatches `route` and validates `route.json`, and `docs/governance.md` and `docs/agent-task-protocol.md` add the routing step (`design.md` "Planned edits").

## Capabilities

### New Capabilities

### Modified Capabilities

- `review-process`: adds "Review route command", "Rule routing floor", "Shadow routing", "Shadow router failure", "Route record", "Router credential", "Route effect", and "Archive routing evaluation".
- `agent-task-protocol`: adds "Review route in the task flow".

## Impact

Repository tooling and process documentation only (`scripts/`, `test/`, `docs/`, `Makefile`); no runtime, contract, or published package change. One new outbound HTTPS call, to `https://api.typesafe.ai/v1/systemone`, made only by the `route` command and the offline evaluation, and only when `JEV_MAF_LAB` is set.

The owner must act before the shadow router can answer: TypeSafe issues API keys through its console, its Master Customer Agreement governs API use and is accepted by using the service, and use consumes prepaid credits (`design.md` "External facts" and "Owner actions").

Exclusions: the shadow router never decides, also not above the floor (the owner decides that later); no change to the reviewer assignment table or to the authorized reviewer list; no lower effort than today's; no use of Jev output to tune the rule; no backfill of `route.json` into archived changes.
