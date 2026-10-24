# Verification: draft-sdlc-framework-port

## Scope and source

G1 item 6 of the [G1 work plan](../../../docs/g1-plan.md), delegated by the integrating session under the owner's 2026-10-24 authorization to start and merge reviewed G1 items. Base revision: `9f42dc5` on `dev`. Scope: new files `sdlc-framework.ts`, `sdlc-framework-conformance.ts`, and `plain-data.ts` in `packages/modules/sdlc/src/ports/`, the root exports in `src/index.ts`, the test file `packages/modules/sdlc/test/sdlc-framework-port.test.ts`, and this change. Prepared in a git worktree. The integrating session agreed with placing the port in `@taskelith/sdlc` and recording the boundary gap as an open question without changing the boundary rules.

## Author self-check before review

- Against the ADR 0004 principles: the port and suite are in the module's `ports` layer, import only `@taskelith/kernel` and the module's domain, and perform no I/O; no code or test names a specific SDLC framework, harness, provider, or SCM (a case-insensitive search of `packages/modules/sdlc/src` and `test` found none); results are kernel `Result` values; the suite's report and findings are frozen; coverage is 100%. Principles 5 (Docker), 6 (OpenAPI), and 7 (Makefile) add no obligation for a port without an HTTP or message interface; `make verify` runs its build and tests.
- Evidence check: the change adds only repository-relative links; no external link.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree, after `npm ci --ignore-scripts`:

- `make verify` passed: 134 tests passed, 0 failed; coverage 100% lines, branches, and functions, including every file of `packages/modules/sdlc/dist/`; "Workspace and hexagonal boundary checks passed."; "Every product module is in the coverage report."; "Verified 487 package paths; 14 with license coverage gaps (all reviewed; 3 declaration-only)"; strict OpenSpec validation 26 passed; package verification passed.

- After the pass-1 fixes: `make verify` passed: 139 tests passed, 0 failed; coverage 100% lines, branches, and functions; boundary and coverage scope checks passed; dependency inventory verified (487 package paths); strict OpenSpec validation 26 passed; package verification passed.

## Independent review

Assigned reviewer (rotation): Codex CLI with `gpt-6.1-sol`, `model_reasoning_effort = "medium"`, sandbox `read-only`. The output header confirmed the model, `reasoning effort: medium`, and `sandbox: read-only`. Each pass reviewed the uncommitted diff on the base above, and the prompt named the nine ADR 0004 principles and asked for every instance of each problem. The worktree's SHA-256 snapshot of tracked and untracked files was identical before and after each pass.

- **Pass 1** (session `01a16f61-9028-7cb2-ba0b-6515e085b4c2`, snapshot `3ad8f49dd1f35e051993fce1bfaf560c795b03852cd6299db54fdb02747ee9ca`). No findings for principles 4 to 8, the location decision, or scope. Findings: 0 Critical, 0 High, 5 Medium, 1 Low. All accepted and resolved:
  1. Medium: `resolveWorkflow` could not resolve the workflow of a given work item, although OpenSpec selects the schema per change. The request takes an optional work item; a test resolves different definitions and digests for two work items of one working copy; spec and design say so.
  2. Medium: the capability parser trusted the declaration's runtime structure (`null`, missing fields, strings, and other iterables threw or were accepted). It takes `unknown` and checks the structure first; an unreadable declaration is a capabilities finding; tests count that no operation is called.
  3. Medium: a malformed `Result` could pass or abort the suite, and diagnostics could throw on cyclic or `BigInt` values. The suite checks the Result envelope and failure shape, including a kernel failure code, describes values safely, and turns any error while checking into a finding for that case.
  4. Medium: successful values were cast without runtime type checks, giving false passes. Each operation's value is checked against a declared runtime shape (strings, booleans, dense arrays, plain objects, exactly the defined fields) before domain parsing, with negative tests for every listed field and container.
  5. Medium: structural equality skipped array holes and treated non-plain objects as equal. It now requires dense arrays without extra properties and plain objects, with regression tests through the suite.
  6. Low: three scenarios were not proven by tests. Added a test with two existing work items, a throwing case followed by a passing case, and call counters for invalid capabilities.
- **Pass 2** (session `01a16f68-108d-7f51-86e7-89dc947a314e`, snapshot `1870a2f87d7627e40b0b27c75d54e4b6badbd545abd986d3ba89e04192da7c73`). Pass-1 finding 6 confirmed resolved; findings 1 to 5 resolved except for the residues below. No findings for principles 4 to 8, framework compatibility, location, or scope. Findings: 0 Critical, 0 High, 3 Medium, 1 Low. All accepted and resolved:
  1. Medium: counting keys did not prove a dense array: a hole plus an extra property passed. Untrusted data is now copied element by element, reporting the first hole and every property that is not an element; `isDenseArray` also requires the keys to be exactly the indices in order.
  2. Medium: non-enumerable and symbol properties escaped the record, array, dictionary, and equality checks. The copy step reads `Reflect.ownKeys` and rejects symbol, non-enumerable, and accessor properties in every record, array, failure, and details value; tests cover each.
  3. Medium: the public capability parser could throw from a getter or a proxy trap, and could re-read changed values. It copies the declaration once without running getters and returns `invalid` with the field `capabilities` for an accessor or an unreadable value; tests check that no getter runs.
  4. Low: workflow resolution for the first work item was not requested explicitly. A case resolves it with that work item.
- After the pass-2 fixes: `make verify` passed: 141 tests passed, 0 failed; coverage 100% lines, branches, and functions; boundary and coverage scope checks passed; dependency inventory verified (487 package paths); strict OpenSpec validation 26 passed; package verification passed.
- **Pass 3** (session `01a16f6c-dbd8-7e23-afe7-5359e1ca283a`, snapshot `44950a9965772fe0b56b423a5589c604a7ecc945331bfb233565c7291df786c3`). Pass-2 findings 1, 3, and 4 confirmed resolved and finding 2 partly. No findings for principles 4 to 8, framework neutrality or compatibility, evidence distinctness, location, or scope. Findings: 0 Critical, 0 High, 3 Medium, 0 Low. Because Medium findings remained after the third pass, the owner was asked for the next step and chose to fix them and run a fourth pass (2026-10-24). All accepted and resolved:
  1. Medium: a non-enumerable array element was accepted and copied as an ordinary element. The copy step rejects it, with tests through the capability parser and the suite, including a nested array.
  2. Medium: expected values were compared directly, so hidden or symbol properties in a fixture could make different values equal. Expected values are copied by the same rules first, and a fixture that is not plain data is a `fixture` finding; tests cover hidden and symbol properties on objects and arrays. The shape checks and equality now take only copies.
  3. Medium: the prepared instructions' stage identifier was only compared with the request. It is parsed as a `StageId`, with tests for empty, whitespace, non-ASCII, and too long identifiers.
- After the pass-3 fixes: `make verify` passed: 142 tests passed, 0 failed; coverage 100% lines, branches, and functions; boundary and coverage scope checks passed; dependency inventory verified (487 package paths); strict OpenSpec validation 26 passed; package verification passed.
- **Pass 4** (owner-authorized; session `01a16f73-f0a1-7411-9d0d-55433b8b49a6`, snapshot `b9a11ee430586669e758f1b9ee5e0ac069ca0ba01c931282bbc7080ea3c698f2`). All three pass-3 findings confirmed resolved, and every caller of the shape checks and equality confirmed to pass copies. No findings for principles 3 to 8, framework compatibility or neutrality, or scope. Findings: 0 Critical, 0 High, 1 Medium, 0 Low. Accepted and resolved:
  1. Medium: the suite passed the original request to the plugin and copied the expected value only after the call, so a plugin could change the request's stage or a shared expected array and pass. The owner chose to fix it without another pass (2026-10-24), so this fix is unreviewed. All cases are now copied before the first plugin call, the plugin gets a fresh copy of each request, and later checks use the snapshot; tests cover a changed request, a changed shared expected value, a request shared with the next case, and a request that is not plain data.
- After the pass-4 fix: `make verify` passed: 145 tests passed, 0 failed; coverage 100% lines, branches, and functions; boundary and coverage scope checks passed; dependency inventory verified (487 package paths); strict OpenSpec validation 26 passed; package verification passed.

## Remaining gates

- The pass-4 fix is unreviewed by the owner's decision.
- Integration into `dev` by the integrating session, then archiving the change.
