# Verification: bind-product-writers-to-launch-invalidation

## Scope and source

G3 item 0 follow-up for item 8 (`define-product-ports`), size M, assigned by the coordinator (Niki) on 2026-10-27. Source: review pass 1 H1 of item 8 in `revalidate-g3-foundations`, lowered to Medium by review pass 2 M1 ([its verification](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md), "Follow-up changes" and the item 8 resolution table). Scope: bind the product writers of spec approval, the conflict flow and the return to Specify, and policy revision changes to launch authorization section 5; define the waits after a revocation and the transaction of a standing rule use; add race tests to the contract's section 7; and the `product-ports` spec delta. Out of scope: code (no G2 writer exists, [design](design.md) D1), policy revision comparison semantics (review pass 2 M5, `align-product-ports-with-g2-lifecycle`, design D4), and re-admission (G3 plan item 44, design D3).

## Revision

Branch `bind-product-writers-to-launch-invalidation`, created from `origin/dev` at `9b0e6fd9` (#364); its first commit `947502be` then merged `origin/dev` at `b87abe75` (#365), which brought the archive of `recheck-provider-terms-pages` and its edits of `docs/qualification/claude-code.md` and `docs/qualification/codex.md`; none of these is an input of this change. The individual checks below ran on the working tree of `947502be`; `make verify` ran on the merge commit `4a502431`.

## Environment

macOS (Darwin 25.6.0), Node.js v24.22.1 and npm 12.2.1 from `.nvmrc`. Docker Desktop for the services of `make verify`, in a slot the coordinator granted.

## Author self-check

- Each writer is bound in the section that defines it: spec approval in section 4.1, the conflict flow and the return to Specify in section 6.3, policy revision changes in section 5; the waits are in section 4.1, "After a revocation", which section 6.3 refers to.
- The spec delta's requirements match the contract text; the modified requirement keeps the living spec's text unchanged and adds one scenario. Requirement bodies are 303, 429, 242, and 411 characters after the review pass 1 fixes, under the limit that strict validation after archive enforces.
- Every `file:line` cited in [design](design.md) was re-read on `9b0e6fd9`: `launch-invalidation.ts:32` and `:38`, `worker-revocation.ts:11`, `gate.ts:18` to `:24`, `:84`, `:114`, and `:133`, `launch-authority.integration.test.ts:254`, the two conformance suites at `:79` and `:93`, `task.ts:116`, `:120`, and `:121`, `launch-authorization.md:63`, `:77`, and `:173`, and `0015-g2-closure.md:112` and `:113`.
- The contract edits add paragraphs and bullets only and change no existing line ([design](design.md) D7).

## Checks and results

| Check | Result |
| --- | --- |
| `npm run openspec -- validate bind-product-writers-to-launch-invalidation --strict` | `Change 'bind-product-writers-to-launch-invalidation' is valid` |
| `npm run verify:comments` | `Every comment is within the comment length rule.` |
| `npm run verify:findings` | `Every findings file is valid: 42 file(s); every pass summary file is valid: 22 file(s).` |
| `make contract-compatibility` | `Contract documents have no undeclared breaking change.` |
| `npm run verify:dependencies` | `Verified 731 package paths; 41 with license coverage gaps (all reviewed; 4 declaration-only)` |
| `npm run openspec -- validate --all --strict --no-interactive` | `Totals: 70 passed, 0 failed (70 items)` |
| `npm run verify:links` | `Every checked link conforms.` |
| `npm run verify:archive` | `Every active OpenSpec change archives into strictly valid specs.` |
| `npm run verify:package` | After `npm run build`: `Packed file allowlist and installed CLI verification passed.` (without a build it fails on the missing `dist/cli.js`, which `make test` builds) |
| `make verify` on `4a502431` | Exit 0; tests 2289, pass 2286, fail 0, skipped 3; `Packed file allowlist and installed CLI verification passed.` |

After the review pass 1 fixes (`ce677cbf`), on the working tree of the record commit, without Docker; `make verify` is the coordinator's to run again:

| Check | Result |
| --- | --- |
| `npm run openspec -- validate bind-product-writers-to-launch-invalidation --strict` | `Change 'bind-product-writers-to-launch-invalidation' is valid` |
| `npm run verify:findings` | `Every findings file is valid: 43 file(s); every pass summary file is valid: 23 file(s).` |
| `npm run verify:links` | `Every checked link conforms.` |
| `npm run verify:comments` | `Every comment is within the comment length rule.` |
| `npm run verify:archive` | `Every active OpenSpec change archives into strictly valid specs.` |
| `make contract-compatibility` | `Contract documents have no undeclared breaking change.` |

## Review

### Pass 1 (reviewer A)

- Reviewer: Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, role A, run by the coordinator's session (Pepi).
- Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, read-only sandbox.
- Model confirmation: the output header named `gpt-6.1-sol` with reasoning effort `medium`, as the coordinator reported.
- Session: `01a17eee-d6f8-7763-9617-f04c0007e6f1`. Reviewed HEAD `eb0520aa`.
- Snapshot: `79284628e5921e9ce4936c6fdfb75c4e399f7f8b9d281d4fec172647f551855f` before and after, unchanged.
- Findings: critical 0, high 0, medium 4, low 2. All fixed in `ce677cbf`.

| Finding | Resolution |
| --- | --- |
| M1 (Medium, spec-wording): the spec gate race test expected `gate-not-passed` for every decision before the authorization, although an approval before it may leave a valid grant (`docs/contracts/product-ports.md:199`) | Section 7 separates the approval race, whose launch may be granted and is not revoked, from the race of a passed gate made stale; the spec delta adds the scenario "Spec gate approved concurrently with an authorization" |
| M2 (Medium, contract-drift): the spec scenario and section 4.1 reopened a passed gate directly, which `GATE_TRANSITIONS` forbids (`specs/product-ports/spec.md:24`) | Section 4.1, section 6.3, the requirement "Product writers invalidate launches", and its scenarios now name the legal path, passed to stale, then stale to pending, and require the revocation in the transaction that makes the gate stale |
| M3 (Medium, concurrency-race): the standing rule use race was stated in commit order, not serialization order (`docs/contracts/product-ports.md:201`) | Section 7 and the two use scenarios of the spec delta now say "serialized before", regardless of which transaction commits first |
| M4 (Medium, spec-wording): the race tests omitted the new artifact revision and policy revision writers, bulk invalidation, and the grant revocation of a policy change, and mixed the running attempt case with the empty read cases (`docs/contracts/product-ports.md:198`) | Section 7 lists one race per bound writer with its predicate and reason, the policy revision writer with several attempts, an empty read, and a retry with the same command identity; the running attempt case, a start under an expired grant included, is its own test; the use race notes that the policy change also revokes grants |
| L1 (Low, stale-citation): design D1 attributed both helpers' calls to `worker-revocation.ts:11` and the conformance calls to `reopenGate` (`design.md:9`) | D1 now says `invalidateLaunches` has no caller outside tests and only `invalidateWorkerLaunches` is called there, and only `recordGateEvidence` is called by the conformance suites; the conclusion stands |
| L2 (Low, evidence-mismatch): the record said the merge of `b87abe75` brought only an archive, although it also changed two qualification documents (`verification.md:9`) | The Revision section names `docs/qualification/claude-code.md` and `docs/qualification/codex.md`, which are no inputs of this change |

### Later passes


- Pass 2 (reviewer B): Claude Code `claude-opus-5-5`, effort `high`. Pending.
- Pass 3 (reviewer A): Codex `gpt-6.1-sol`. Pending.

## Limitations

- Documentation and specification only; the race tests are obligations on items 18, 22, 23, and 24, not run here.
- The comparison of policy revisions remains with `align-product-ports-with-g2-lifecycle`; the standing rule use transaction refers to "the run's current policy revision" without defining it.

## Remaining gates

- Independent review passes 1 to 3.
- Archive of the change.
- Integration into dev by the coordinator (single pull request)
