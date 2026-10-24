# Verification: plan-g2-work-items

## Scope and source

Task assigned by the coordinator on 2026-10-24: decompose G2 into work items, modelled on the G1 plan, documentation only. Base revision: `021854a` on `dev`. Scope: `docs/g2-plan.md` (new), three sentences in `docs/foundation.md`, and this change. Prepared in the git worktree `../taskelith-worktrees/plan-g2-work-items` on branch `plan-g2-work-items`. Sources: `docs/architecture.md` sections 5–9 and 12–15, ADR 0004, ADR 0007, `docs/g1-plan.md`, the archived `plan-g1-work-items` change, the `sdlc-*`, `shared-kernel`, and `delivery-planning` specifications, `docs/operational-targets.md`, `docs/trust-model.md`, `docs/storage.md`, `docs/worker-platforms.md`, `docs/dependencies.md`, and the root `package.json`.

The change adds no requirement: the `delivery-planning` requirement "Gate work plan" applies from G1 onward, so `.openspec.yaml` sets `skip_specs: true`, as the agent task protocol allows for documentation under an existing requirement.

## Author self-check before review

- Every element of the G2 row and exit evidence in architecture section 13, the four pre-G2 contracts of section 15, the deferrals of G1 decision D4 (a) and G1 item 7, and the G2 deferrals of ADR 0007 map to at least one item.
- The work items, ordering, and recommendations are the author's proposals; each open decision is labelled as a proposal and names the items it blocks. No decision is made, no item is started, and no product code, dependency, or installation is added.
- Version facts were collected by web search on 2026-10-24 and labelled as observations that item 1 confirms.
- Evidence check: the added text contains no external link, only relative links to repository files, so no link needs a pin. Each relative target exists, and the two anchors (`architecture.md#delivery-sequence` and `architecture.md#15-decisions-still-requiring-evidence-or-owner-scope-confirmation`) match headings of `docs/architecture.md`. The same holds after each round of fixes.

## Checks

In the worktree, Node v24.22.1: `make verify` passed before the first review pass (strict OpenSpec validation 33 passed, 0 failed; package verification passed). `npm run openspec -- validate plan-g2-work-items --strict` passed. After the pass-1 fixes, a script recomputed the waves from the "Depends on" column and compared every decision's "Blocks" entry with the "Blocked by" column, and both matched; `make verify` passed (228 tests passed, 0 failed; strict OpenSpec validation 33 passed; package verification passed), and strict validation of the change passed. After the pass-2 fixes: the same `make verify` result, strict validation of the change passed, and the decision and wave cross-check matched again.

## Independent review

Assigned reviewer (rotation): Antigravity Argon (`gemini-4-argon-medium`), effort medium, because the plan depends on external version facts. Invocation: `agy -p "<prompt>" --model gemini-4-argon-medium --effort medium --mode plan --output-format json --log-file <log>`, from the worktree, with the prompt and log outside it.

- **Failed attempt, not a review pass — conversation `89644c4a-9dcb-4cdb-8965-befcc08efdb3`.** The model was confirmed in the log, but the run ended with status `ERROR`, "Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 157h38m58s.", before producing any finding. The worktree snapshot was unchanged. The coordinator then reassigned the reviewer to Claude Fable 5.1 from pass 1.

Reviewer after reassignment: Claude Fable 5.1 (`claude-fable-5-1`, confirmed in the result's `modelUsage`), effort medium, permission mode `plan`, with `Edit`, `Write`, and `NotebookEdit` disallowed, run from the worktree as `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose`, with prompt and output files outside the worktree, and asked to verify the version facts with its network access. Two earlier launches with `--output-format json` ended with "No messages returned from query" and no output; a one-line test run with the same options succeeded, and the pass ran with `stream-json` output, whose final `result` record carries the same fields. SHA-256 snapshots of the worktree before and after each pass were equal.

- **Pass 1 — session `02ba0822-141d-4a00-99c7-7f92f3901919`, head `d0f0f81`.** The reviewer used WebSearch (6 calls) and WebFetch (12 calls) and cited official sources for each version fact. Findings: 0 Critical, 2 High, 8 Medium, 11 Low. All accepted and resolved (unreviewed until pass 2):
  1. High: D2's NATS facts were wrong; 2.15 is the latest line, 2.14 maintained, and 2.12 reached end of life. The author confirmed the release table at docs.nats.io; D2 now offers 2.15 and 2.14 and notes the 2.12 end of life.
  2. High: no item built the control-plane application or the atomic submit-task use case. New item 16 `implement-control-plane-api`; later items are renumbered and the waves and chain recomputed.
  3. Medium: D14's "Blocks: all" matched no row. The status states that D14 governs the start of every item, and its "Blocks" entry says so.
  4. Medium: item 9 pinned images before D1 and D2. Item 9 uses the digests item 1 records for the decided versions and is blocked by D1 and D2.
  5. Medium: item 10 promised crash points in paths that did not exist yet. Item 10 provides the primitives; items 11, 14, 15, and 17 add their crash points and depend on item 10.
  6. Medium: item 17 (now 18) held worker-side limits without a worker and missed memory and event-loop pressure. The worker-side limits, including daemon memory and event-loop lag, moved to the worker runtime (now item 20).
  7. Medium: no item put the harnesses into the worker image. Item 26 adds the pinned Claude Code and Codex packages as a digest-pinned image variant.
  8. Medium: native acceptance depended only on the installation. Item 25 now depends on item 24 and runs its scenarios on each matrix entry.
  9. Medium: the starting point omitted the plugin packages and the existing `packages/adapters/*` workspace glob. Both are listed; only `apps/*` is missing.
  10. Medium: `verification.md` was missing and `tasks.md` named another reviewer. This record is added and task 2.2 names the reassignment.
  11. Low: the wave table omitted dependencies. Waves are now derived from the full "Depends on" column and listed without partial reasons.
  12. Low: the critical path was not unique. Reworded as one of the longest chains.
  13. Low: D4 stated the `node:sqlite` stability label as a condition. It records the observed label of Node 24.22.1; only the durability tests remain a condition.
  14. Low: D11 treated the runner labels as unknown. It names `ubuntu-24.04-arm`, `macos-26`, and `macos-26-intel` as observations.
  15. Low: item 14 missed storage obligations. It adds refusal of the checkout as `dataRoot` and symlink and ownership handling.
  16. Low: item 13 did not place the operator credential reset. It now includes the audited reset.
  17. Low: item 19 (now 20) did not require outbound-only connections. Added.
  18. Low: D5 blocked item 9 without need. D5 now blocks only the installation item.
  19. Low: item 2 assumed JetStream. Item 2 and D3 (c) state that a RabbitMQ spike replaces it.
  20. Low: a grammar slip in the G2 summary. Fixed.
  21. Low: an overlong sentence in `docs/foundation.md`. Split.

- **Pass 2 — session `361a7c6c-f80f-4c95-a2c5-46997029c9f2`, head `8f6b9bc`.** The reviewer confirmed all 21 pass-1 resolutions, re-checked the changed version and runner-label facts with WebFetch (5 calls), and recomputed the waves, the decision-to-row match, and the longest chains by script. New findings: 0 Critical, 0 High, 4 Medium, 8 Low. All accepted and resolved (unreviewed until pass 3):
  1. Medium: D4 (a) was conditional on durability tests that item 5 does not run and item 14 runs only after D4. The condition left the option; the fallback to (b) is triggered by item 1's evaluation or item 14's durability tests.
  2. Medium: D14 governed every item without appearing in any row, contrary to the `delivery-planning` scenario, and both of its options let items start. D14 now blocks no item, and the status says that until it is decided each item starts only with a separate owner approval.
  3. Medium: the evidence check was not recorded. Recorded under the self-check, and task 2.1 names it.
  4. Medium: `make verify` after the pass-1 fixes was not recorded. Recorded under Checks.
  5. Low: D2 gave an end-of-life date that the NATS table does not state. It now says the 2.12 line is end of life and dates its final release.
  6. Low: item 1 would register PostgreSQL and NATS JetStream again. It adds versions, digests, and evidence to their existing `candidate` rows and registers only new tools.
  7. Low: item 10 assumed a proxy. It uses the partition mechanism D8 selects.
  8. Low: the consequences of D3 (c) were incomplete. D3 (c) and `design.md` state that it replaces items 2 and 12 and makes D2 moot.
  9. Low: the scope named two sentences in `docs/foundation.md`. Now three.
  10. Low: the starting point omitted the `EvidenceStore` adapter and implied existing adapter packages. It names item 19 and says that item 11 creates the first package under `packages/adapters/`.
  11. Low: item 22 omitted event-loop lag and database latency. Added.
  12. Low: item 25 omitted the G2 part of the service lifecycle row. Added.

- **Pass 3 (the last allowed pass) — session `25192aa0-ded5-44cf-a56e-8397f66cf009`, head `c77318c`.** The reviewer confirmed all 12 pass-2 resolutions, re-checked the version and runner-label facts with WebSearch (5 calls) and WebFetch (16 calls), and recomputed the waves, the decision-to-row match, and the longest chains by script; all matched. New findings: 0 Critical, 0 High, 1 Medium, 7 Low.
  1. Medium, open: architecture section 15 requires all four pre-G2 contracts before G2 execution code, but item 7 does not depend on item 5 (the journal contract), so items 7, 11, and 18 have no path to item 5, and `design.md` says that every execution-code item depends on the four contracts. Proposed fix: add item 5 to item 7's "Depends on"; the waves and the longest chain do not change. Under the governance rule for findings left after the third pass, this finding is not fixed and goes to the owner with options (fix without review, accept as a known risk, or defer).
  2. Low, unreviewed fix: item 16 used D10 without naming it. Item 16 is blocked by D10, and D10 blocks items 13 and 16.
  3. Low, unreviewed fix: item 3 omitted the policy revision and the attempt and execution identities of the trust contract. Added.
  4. Low, unreviewed fix: item 20 merged different limit reactions. It now pauses launch authorizations or blocks attempt admissions as the operational targets state, with the disk-floor truncation rule.
  5. Low, unreviewed fix: item 8 omitted the evidence operations item 19 needs. Item 8 adds publishing and downloading evidence.
  6. Low, unreviewed fix: item 1 still named a partition proxy. It names the partition mechanism (proxy or network disconnect).
  7. Low, unreviewed fix: D11 (a) did not account for rows an ephemeral hosted runner cannot establish. Such rows are recorded as open with the entries.
  8. Low, unreviewed fix: a duplicated sentence in Checks. Merged.

After the pass-3 Low fixes: `make verify` and strict validation of the change passed, and the decision and wave cross-check matched (results below in Checks are unchanged).

## Limitations

The version and runner-label facts are observations of 2026-10-24 from web sources; no image was pulled and no digest recorded. Item 1 confirms them.

## Remaining gates

The owner's choice for the open pass-3 Medium finding, the coordinator's integration, and the owner decisions D1–D14. G2 starts only after `close-g1` and the owner's start.
