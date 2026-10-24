# Verification: plan-g1-work-items

## Scope and source

The owner's direction on 2026-10-24: "започваме G1" (start G1). Base revision: `81a3e48` on `dev`, rebased onto `99d05ba` after the mapping change merged. Scope: `docs/g1-plan.md` (new), one sentence in `docs/foundation.md`, and this change. Prepared in a git worktree. The decomposition was drafted with a planning subagent from `docs/architecture.md`, ADRs 0003, 0004, and 0007, the boundary script, `package.json`, and the mapping change `map-sdlc-framework-artifacts` (merged in pull request #35); the author checked its references.

## Author self-check before review

- The work items, ordering, and recommendations are the author's proposals; the open decisions are labelled as such and block the items that depend on them.
- No product code, dependency, or decision is added.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed (23 tests passed, 0 failed; coverage thresholds met; strict OpenSpec validation 17 passed; package verification passed). After the pass-1 fixes and the rebase: `make verify` passed with 23 tests and 18 strict validations, and the link and evidence checks passed; the same results after the pass-2 fixes. Local link and anchor check passed; the evidence check found no unpinned external link.

## Independent review

Assigned reviewer (rotation): Claude Fable 5.1 (`claude-fable-5-1`, confirmed in the result's model usage), effort medium, permission mode `plan`, with edit tools disallowed. SHA-256 snapshots of the worktree before and after each pass were equal.

- **Pass 1 — session `ec651897-ce6c-4749-9f0b-638d8070b848`.** Findings: 0 Critical, 3 High, 10 Medium, 11 Low. All accepted and resolved:
  1. High: only D1 appeared as a dependency. Every item now has a "Blocked by" column naming its decisions.
  2. High: the plugin manifest item pulled G4's versioned manifests into G1 without saying so. It is now `define-plugin-registration`, limited to the registration the first adapter needs, with the G4 scope stated.
  3. High: running SpecKit cannot produce artifact content, because its main steps are agent prompts. The item is split into capturing the scaffolded tree and verifying claims (item 9) and authoring template-derived fixtures (item 10).
  4. Medium: the workspace item omitted coverage and package verification for new packages. Added to item 1.
  5. Medium: D3 asked for a library choice before the evaluation. D3 is now the document-first versus code-first choice, with libraries selected from item 3's evidence.
  6. Medium: code-first options were presented as equal. They are labelled as requiring an ADR 0004 exception.
  7. Medium: D5 conflated a container and a host scratch project. Split into (a1) and (a2); (a1) recommended.
  8. Medium: SpecKit, Python, and uv were not registered before use. Item 9 records them as `candidate`.
  9. Medium: freezing the port did not say how SpecKit fixtures are exercised. Item 12 names a test-only normaliser and leaves the full adapter to G4.
  10. Medium: admission records lacked the architecture's fields. Item 7 lists them and defers ownership generation to G2.
  11. Medium: the authorization model was not stated. The status quotes the owner's start and merge authorizations and the rule for decision-blocked items.
  12. Medium: the fixture item hid two readinesses. Resolved by the split in finding 3.
  13. Medium: the parallelism text ignored the plugin registration item's dependency on the tooling item (now items 8 and 3). Rewritten from the dependency column.
  14. Low: the boundary claim was partly wrong. Reworded.
  15. Low: inspection was called the first G1 step. Now "one of the steps".
  16. Low: the kernel's result shape was an unflagged addition. Flagged with its reason.
  17. Low: other ports were not scoped. Item 6 assigns them to G2 and later.
  18. Low: item 1 bundled four concerns. Split into the workspace (item 1) and the kernel (item 2).
  19. Low: the breaking-change check had no home. Item 13 places it, with a deferral through item 14 if no prior version exists (superseded by pass-2 resolution 14).
  20. Low: fixture capture did not use `make`. Item 9 runs through a `make` target.
  21. Low: OpenSpec JSON output was assumed. Item 3 confirms it; D6 depends on it.
  22. Low: "the register" was unlinked. Linked.
  23. Low: the section 15 pre-G2 contracts had no home. Item 14 records them as deferrals.
  24. Low: a scenario mixed a document property with a process rule. The start rule moved into the requirement text.

- **Pass 2 — session `2b0abee5-c50f-438f-8d33-302d2e3a5ff3`.** All pass-1 resolutions confirmed. Findings: 0 Critical, 0 High, 7 Medium, 9 Low. All accepted and resolved:
  1. Medium: D4 blocked items 4, 5, and 7, although both options include them. Removed from their rows; D4 (b) would add items.
  2. Medium: the design called SpecKit capture decision-free while the plan blocks it on D5. The design now names only item 3.
  3. Medium: the new capability's delta lacked `## Purpose`. Added.
  4. Medium: a SpecKit normaliser in the conformance suite would name a framework in module code. Fixtures and the normaliser now live in plugin packages, including a fixture-only `sdlc-speckit` stub, and the suite stays framework-neutral.
  5. Medium: the registration subset omitted the plugin API range. Added.
  6. Medium: D2 (b) combined uncommitted generated code with a drift check. Generated code is now produced by the build in `make verify`, without a drift check.
  7. Medium: AsyncAPI 3 may not support JSON Schema 2020-12. D3 (a) now says "in the dialect each supports", and item 3 evaluates the dialects and schema sharing.
  8. Low: the parallelism text omitted items 11 and 14. Rewritten from the dependency column.
  9. Low: a pass-1 resolution used old item numbers. Renumbered.
  10. Low: SpecKit is already `candidate`. Item 9 now records exact pins with evidence.
  11. Low: item 1 changes the wording basis of ADR 0004 principle 9. Item 1 now updates it.
  12. Low: the workflow run binding listed no fields. Listed.
  13. Low: the envelopes listed no fields. Item 13 cites architecture section 9.
  14. Low: the breaking-change check does not need a release. Item 13 compares with the merge base, without a deferral.
  15. Low: item 8's dependency on item 3 lacked a reason. The manifest is validated with item 3's validator.
  16. Low: OpenSpec JSON output was treated as unknown. The starting point records `--json` on `status`, `show`, and `instructions`, and item 3 narrows to what the adapter needs.

- **Pass 3 (final) — session `4c3860ca-95f9-40ac-8459-d9fd5b1fc1d1`.** All pass-2 resolutions confirmed. Findings: 0 Critical, 0 High, 2 Medium, 8 Low. All were fixed after the final pass and are unreviewed; because Medium findings remained after pass 3, the review process requires the owner's decision before merge:
  1. Medium: the OpenSpec `--json` list was incomplete and misattributed. Now lists `list`, `show`, `validate`, `status`, and `instructions`, and names what the schema instructions use.
  2. Medium: the conformance suite's dependency direction was unstated and could break the boundary check. The suite is exported by the SDLC module or plugin SDK and run by each plugin package's own tests with its fixtures.
  3. Low: no G1 item creates a composition root. Registration is a library-level function in the kernel or plugin SDK, exercised by tests, with no runnable application.
  4. Low: item 3 presumed D3 (a). It now covers tooling for both D3 options.
  5. Low: D2 options were asymmetric. Generated code handling now applies to both.
  6. Low: item 1 would reword a decided ADR principle. It now adds a dated amendment.
  7. Low: a pass-1 resolution contradicted a pass-2 resolution. Annotated as superseded.
  8. Low: the merge-base comparison lacked a base and a first-version rule. It compares with the merge base with `origin/dev`, and a document absent at the base passes.
  9. Low: the requirement would apply retroactively to G0. Scoped to G1 onward.
  10. Low: item 14 did not name the closure artifact. An ADR, as ADR 0007 did for G0.

Owner decisions on 2026-10-24, in the project conversation: merge the plan with the fixes made after the final pass ("мърджвай"), and D1 option (b), npm workspaces with private packages under `packages/`, each created with its first real use. The plan records D1 as decided.

## Remaining gates

Owner decisions D2–D7.
