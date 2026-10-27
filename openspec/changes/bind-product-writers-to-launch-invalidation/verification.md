# Verification: bind-product-writers-to-launch-invalidation

## Scope and source

G3 item 0 follow-up for item 8 (`define-product-ports`), size M, assigned by the coordinator (Niki) on 2026-10-27. Source: review pass 1 H1 of item 8 in `revalidate-g3-foundations`, lowered to Medium by review pass 2 M1 ([its verification](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md), "Follow-up changes" and the item 8 resolution table). Scope: bind the product writers of spec approval, the conflict flow and the return to Specify, and policy revision changes to launch authorization section 5; define the waits after a revocation and the transaction of a standing rule use; add race tests to the contract's section 7; and the `product-ports` spec delta. Out of scope: code (no G2 writer exists, [design](design.md) D1), policy revision comparison semantics (review pass 2 M5, `align-product-ports-with-g2-lifecycle`, design D4), and re-admission (G3 plan item 44, design D3).

## Revision

Branch `bind-product-writers-to-launch-invalidation`, created from `origin/dev` at `9b0e6fd9` (#364); its first commit `947502be` then merged `origin/dev` at `b87abe75` (#365), which brought the archive of `recheck-provider-terms-pages` and its edits of `docs/qualification/claude-code.md` and `docs/qualification/codex.md`; none of these is an input of this change. The individual checks below ran on the working tree of `947502be`; `make verify` ran on the merge commit `4a502431`.

## Environment

macOS (Darwin 25.6.0), Node.js v24.22.1 and npm 12.2.1 from `.nvmrc`. Docker Desktop for the services of `make verify`, in a slot the coordinator granted.

## Author self-check

- Each writer is bound in the section that defines it: spec approval in section 4.1, the conflict flow and the return to Specify in section 6.3, policy revision changes in section 5; the waits are in section 4.1, "After a revocation", which section 6.3 refers to.
- The spec delta's requirements match the contract text; the modified requirement keeps the living spec's text unchanged and adds one scenario. Requirement bodies are 303, 487, 242, and 443 characters after the review pass 2 fixes, under the limit that strict validation after archive enforces.
- Every `file:line` cited in [design](design.md) was re-read on `9b0e6fd9`: `launch-invalidation.ts:32` and `:38`, `worker-revocation.ts:11`, `gate.ts:18` to `:24`, `:84`, `:114`, `:129` to `:146`, and `:133`, `current-revisions.ts:7` to `:13`, `launch-authority.ts:103`, `capacity-operations.ts:78` and `:306`, `launch-authority.integration.test.ts:254`, the two conformance suites at `:79` and `:93`, `task.ts:116`, `:120`, and `:121`, `launch-authorization.md:50`, `:63`, `:169`, and `:173`, and `0015-g2-closure.md:112` and `:113`.
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

After the review pass 1 fixes (`ce677cbf`), on the working tree of the record commit, without Docker; the worker (Pepi) runs `make verify`, recorded under pass 1:

| Check | Result |
| --- | --- |
| `npm run openspec -- validate bind-product-writers-to-launch-invalidation --strict` | `Change 'bind-product-writers-to-launch-invalidation' is valid` |
| `npm run verify:findings` | `Every findings file is valid: 43 file(s); every pass summary file is valid: 23 file(s).` |
| `npm run verify:links` | `Every checked link conforms.` |
| `npm run verify:comments` | `Every comment is within the comment length rule.` |
| `npm run verify:archive` | `Every active OpenSpec change archives into strictly valid specs.` |
| `make contract-compatibility` | `Contract documents have no undeclared breaking change.` |

After the review pass 2 fixes (`d9589bdb`), on the working tree of the record commit, without Docker, the same six checks gave the same results; `verify:findings` again reported 43 findings files and 23 pass summary files, all valid, and `make contract-compatibility` checked against `b87abe75`.

After the M3 plan amendment (`12aa98e6`), on the working tree of its record commit, without Docker, the same six checks passed again with the same output; `git diff origin/dev -- docs/g3-plan.md` shows only item 44's row.

## Review

### Pass 1 (reviewer A)

- Reviewer: Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, role A, run by the worker session (Pepi).
- Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, read-only sandbox.
- Model confirmation: the output header named `gpt-6.1-sol` with reasoning effort `medium` and sandbox `read-only`, as Pepi read it.
- Session: `01a17eee-d6f8-7763-9617-f04c0007e6f1`. Reviewed HEAD `eb0520aa`.
- Snapshot: `79284628e5921e9ce4936c6fdfb75c4e399f7f8b9d281d4fec172647f551855f` before and after, unchanged.
- Findings: critical 0, high 0, medium 4, low 2. All fixed in `ce677cbf`; `19cbad02` reworded the M3 fix so that it reads independent of commit order.
- After the fixes, `make verify` on `19cbad02`: exit 0; tests 2289, pass 2286, fail 0, skipped 3.

| Finding | Resolution |
| --- | --- |
| M1 (Medium, spec-wording): the spec gate race test expected `gate-not-passed` for every decision before the authorization, although an approval before it may leave a valid grant (`docs/contracts/product-ports.md:199`) | Section 7 separates the approval race, whose launch may be granted and is not revoked, from the race of a passed gate made stale; the spec delta adds the scenario "Spec gate approved concurrently with an authorization" |
| M2 (Medium, contract-drift): the spec scenario and section 4.1 reopened a passed gate directly, which `GATE_TRANSITIONS` forbids (`specs/product-ports/spec.md:24`) | Section 4.1, section 6.3, the requirement "Product writers invalidate launches", and its scenarios now name the legal path, passed to stale, then stale to pending, and require the revocation in the transaction that makes the gate stale |
| M3 (Medium, concurrency-race): the standing rule use race was stated in commit order, not serialization order (`docs/contracts/product-ports.md:201`) | Section 7 and the two use scenarios of the spec delta now say "serialized before", regardless of which transaction commits first |
| M4 (Medium, spec-wording): the race tests omitted the new artifact revision and policy revision writers, bulk invalidation, and the grant revocation of a policy change, and mixed the running attempt case with the empty read cases (`docs/contracts/product-ports.md:198`) | Section 7 lists one race per bound writer with its predicate and reason, the policy revision writer with several attempts, an empty read, and a retry with the same command identity; the running attempt case, a start under an expired grant included, is its own test; the use race notes that the policy change also revokes grants |
| L1 (Low, stale-citation): design D1 attributed both helpers' calls to `worker-revocation.ts:11` and the conformance calls to `reopenGate` (`design.md:9`) | D1 now says `invalidateLaunches` has no caller outside tests and only `invalidateWorkerLaunches` is called there, and only `recordGateEvidence` is called by the conformance suites; the conclusion stands |
| L2 (Low, evidence-mismatch): the record said the merge of `b87abe75` brought only an archive, although it also changed two qualification documents (`verification.md:9`) | The Revision section names `docs/qualification/claude-code.md` and `docs/qualification/codex.md`, which are no inputs of this change |

### Pass 2 (reviewer B)

- Reviewer: Claude Code, model `claude-opus-5-5`, effort `high`, role B, run by the worker session (Pepi).
- Invocation: `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.
- Model confirmation: `claude-opus-5-5` in the JSON `modelUsage`, as Pepi read it.
- Session: `84349d0e-ff53-4732-a920-7e63750965bd`. Reviewed HEAD `ebdcb23f`.
- Snapshot: `315688f150f02a0005f6830589aa9688281b2c7ebe7030b87cd01f1d46d3a1b2` before and after, unchanged.
- Pass 1 fixes M1 to M4, L1, and L2: confirmed resolved.
- Findings: critical 0, high 0, medium 4, low 7. All but M3 and L7 fixed in `d9589bdb`; L7 in `d1644fa4`; M3 in `12aa98e6`.
- After the fixes, `make verify` on `e4cb4b0b`: exit 0; tests 2289, pass 2286, fail 0, skipped 3.

| Finding | Resolution |
| --- | --- |
| M1 (Medium, contract-drift): a return to Specify was said to make passed spec gates stale, although `markGateStale` needs a revision that outdates the gate (`docs/contracts/product-ports.md:185`) | Section 6.3, the spec delta, and design D2: the transaction that records the new revision makes the outdated gates stale and revokes; a return without a new revision cancels the active attempt by assignment, revoking its grants with `attempt-not-launchable` |
| M2 (Medium, contract-drift): the new revision writer did not update the run's current revision, which only a G3 writer of `CurrentRevisions` can do (`docs/contracts/product-ports.md:185`) | Section 6.3 and the requirement update it through `CurrentRevisions` in the same transaction, which its first writer extends; the artifact race test asserts it |
| M3 (Medium, scope): plan item 44 covers only an attempt rejected under a stale admission, not a revoked one (`docs/g3-plan.md:141`) | Option (a), decided by the owner's away delegate (run `20261027T201212Z-claude-24852`, 2026-10-27) and relayed by the coordinator: `docs/g3-plan.md` item 44 keeps its text and adds that the same writer of admissions re-admits a task whose grant a product writer revoked; design D3 points re-admission after a revocation to item 44. A plan amendment pending the owner's confirmation |
| M4 (Medium, contract-drift): section 5 said a rule change revokes no grant, while D2 left the policy revision open (`docs/contracts/product-ports.md:160`) | Section 5: no grant is revoked unless the run's policy revision changes; D2 aligned |
| L1 (Low, spec-wording): the policy revision race test had no owner (`docs/contracts/product-ports.md:201`) | Assigned to the item that adds a command that changes the run's policy revision, in section 7, D5, and the proposal |
| L2 (Low, spec-wording): the writer requirement omitted reopening and was ambiguous (`specs/product-ports/spec.md:17`) | Rewritten as every transaction that changes a spec gate's state, a new artifact revision, and a policy revision change |
| L3 (Low, spec-wording): "dispatched under" ignored that ownership advances on each placement (`docs/contracts/product-ports.md:159`) | Section 5 and the requirement compare with the request's assignment and the admission it names |
| L4 (Low, spec-wording): no scenarios for a policy revision or ownership change before a use (`specs/product-ports/spec.md:38`) | Two scenarios added, in serialization order |
| L5 (Low, stale-citation): D3 cited section 5 for the kept ownership (`design.md:23`) | D3 cites section 4 (`launch-authorization.md:50`) and `task.ts:120` and `:121` |
| L6 (Low, docs): the proposal described section 4.1 as before (`proposal.md:7`) | The proposal matches sections 4.1, 5, 6.3, and 7 |
| L7 (Low, evidence-mismatch): pass 1 M3's commit, the `make verify` owner, and the remaining gates were inconsistent (`verification.md:37`) | Pass 1 M3 names `19cbad02`; the record says the worker runs `make verify`; the remaining gates name pass 3 |

### Pass 3 (reviewer A)

- Reviewer: Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, role A, run by the worker session (Pepi).
- Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, read-only sandbox.
- Model confirmation: the output header named `gpt-6.1-sol` with reasoning effort `medium` and sandbox `read-only`, as Pepi read it.
- Session: `01a17f06-1eea-7a51-b485-7323f1f869a5`. Reviewed the range `ebdcb23f..94324564`, HEAD `94324564`.
- Snapshot: `0cf2e4ffb0e983a38c00a97932672b31186d2ea3701ce614127ac3f8765838ad` before and after, unchanged.
- Findings: critical 0, high 0, medium 0, low 0. All 11 pass 2 findings (M1 to M4, L1 to L7) confirmed resolved, and no problem introduced by their fixes. The review is complete.

## Limitations

- Documentation and specification only; the race tests are obligations on items 18, 22, 23, and 24 and on the item that adds a policy revision command, not run here.
- The comparison of policy revisions remains with `align-product-ports-with-g2-lifecycle`; the standing rule use transaction refers to "the run's current policy revision" without defining it.

## Remaining gates

- Owner confirmation of the item 44 plan amendment.
- Archive of the change.
- Integration into dev by the coordinator (single pull request)
