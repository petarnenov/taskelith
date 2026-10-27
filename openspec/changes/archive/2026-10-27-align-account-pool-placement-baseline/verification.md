## Scope and source

Task `align-account-pool-placement-baseline` (size M), assigned by coordinator Niki to the worker session Maki on 2026-10-27. Source: G3 item 0 revalidation (`revalidate-g3-foundations`, archived as [`2026-10-27-revalidate-g3-foundations`](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md)), item 5 (`define-account-pool-contract`), review pass 2 by Claude Opus 5.5 (effort `high`) on the capability `account-pool-port`, findings M3, L3, and L4 ([proposal](proposal.md)).

Scope: the slot-selection sections of [`docs/contracts/account-pool.md`](/docs/contracts/account-pool.md) (section 2, rule 3; section 3.2; sections 4.1, 4.2, and 4.6; new section 4.7; one item 12 test in section 9) and of [`docs/contracts/capacity-reservation.md`](/docs/contracts/capacity-reservation.md) (the writers list of section 4, section 13 "Provider credentials", and the writers list of section 13), and a spec delta of `account-pool-port`.

Out of scope: slot selection code and its tests (G3 item 12, [design](design.md) D1), capacity reservation section 10 and the `capacity-reservation` specification (the parallel change `align-account-pool-signals`), and the decisions of #364.

## Revision and environment

- Base: `origin/dev` at `b87abe75` (#365). Branch `align-account-pool-placement-baseline`, worktree `taskelith-worktrees/align-account-pool-placement-baseline`.
- Host: Apple M3, macOS 26.6.2 (25G83) on arm64; Node.js v24.22.1 from `.nvmrc`, npm 12.2.1.
- Developed by a subagent of the worker session, as [subagent execution](/docs/agent-task-protocol.md#subagent-execution) requires; the session checks the result before review.

## Author self-check

- **Code or contract only.** No selection code exists at the base ([design](design.md) D1, with file and line evidence), so the change is contract and specification only; no TypeScript port contract changes, and the tests for a limit other than `4` and for the check order are listed among the item 12 tests of account pool section 9.
- **Contract against code.** Every file and line that `design.md` cites was checked at the base: `capacity-operations.ts:49`, `:191-193`, `:206-236`, `:220`; `placement-decision.ts:62-67`, `:103-105`; `placement-service.ts:110-114`, `:132-136`, `:140-143`, `:234`, `:261-273`, `:270`, `:277-290`, `:300-309`, `:334`, `:341-343`; `capacity-reasons.ts:3-12`, `:16-23`, `:26`, `:33-35`; `placement-outcome-record.ts:22-25`; `slot-selection.ts:9`, `:21-31`, `:35-41`; `capacity-store.ts:14-26`; `account-pool.ts:9-18`; `capacity-repositories.ts:371`. The contracts cite names and sections, not line numbers.
- **Consistency.** Account pool sections 3.2, 4.2, 4.6, and 4.7, capacity reservation sections 4 and 13, and the spec delta state the same rules: selection at the credential step, the slot's own limit, a slot wait that tries no other worker, backs off, and does not end the pass, a slot rejection that ends the attempt with a `rejected` record, the insert as the only slot write, and the same list of serializable slot changes.
- **Scope of edits.** `git diff b87abe75 -- docs` changes only the sections named in "Scope and source"; capacity reservation section 10 is unchanged.
- **Requirement lengths.** The requirement texts of the delta are 417, 195, 304, and 302 characters, below the about 500 that strict validation after archive tolerates.
- **Links.** This record and `design.md` link inside the change or root-relative; the spec delta adds no link.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate align-account-pool-placement-baseline --strict` | `Change 'align-account-pool-placement-baseline' is valid` |
| `npm run verify:links` | `Every checked link conforms.` |
| `npm run verify:comments` | `Every comment is within the comment length rule.` |
| `make findings ARGS="validate"` | `Every findings file is valid: 43 file(s); every pass summary file is valid: 23 file(s).` |
| `make verify` on `2d94cf63`, before pass 1 | Exit 0; `npm run openspec -- validate --all --strict` inside it: `Totals: 70 passed, 0 failed (70 items)`; last line `Packed file allowlist and installed CLI verification passed.` Run on the Apple M3 host |
| `make verify` on `9477eb83`, after the pass 1 fix and its records | Exit 0; `Totals: 70 passed, 0 failed (70 items)`; `Every findings file is valid: 43 file(s); every pass summary file is valid: 23 file(s).`; last line `Packed file allowlist and installed CLI verification passed.` Run on the Apple M3 host |
| `git fetch origin` before archiving | `origin/dev` still at `b87abe75`; no merge needed |
| `npm run openspec -- archive align-account-pool-placement-baseline --yes` | `Totals: + 3, ~ 1, - 0, → 0`; `Change 'align-account-pool-placement-baseline' archived as '2026-10-27-align-account-pool-placement-baseline'.` |
| `npm run openspec -- validate --all --strict` on the tree of the archive commit | `Totals: 69 passed, 0 failed (69 items)` |
| `npm run openspec -- validate --archived --no-interactive`, this change's line | `✓ change/2026-10-27-align-account-pool-placement-baseline` |
| `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs` | Only `openspec/specs/account-pool-port/spec.md`: the three added requirements and the modified "Deterministic least-loaded order" (30 insertions, 1 deletion) |
| Moved change files | `findings.jsonl` (1 line) and `passes.jsonl` (1 line) present; `make findings ARGS="validate"`: `Every findings file is valid: 43 file(s); every pass summary file is valid: 23 file(s).` |
| `make verify` on the tree of the archive commit | Exit 0 on the fourth run; `Totals: 69 passed, 0 failed (69 items)`; last line `Packed file allowlist and installed CLI verification passed.` The three runs before it failed only `a provider that races two concurrent hand-offs fails the suite` (`packages/modules/workspace/test/workspace-conformance.test.ts:76`) while the host's load average was about 10 to 12; the change touches no code, and the workspace test files passed alone twice (68 of 68) and that test alone three times. Run on the Apple M3 host |

## Independent review

Reviewers assigned by the coordinator: reviewer A, Codex CLI `gpt-6.1-sol` (reasoning effort `medium`), and reviewer B, Claude Code `claude-opus-5-5` (effort `high`).

### Pass 1 (reviewer A)

- Reviewer A: Codex CLI `gpt-6.1-sol`, reasoning effort `medium`, run by the worker session; reviewed head `4c8a6a42`.
- Invocation, as in the [agent task protocol](/docs/agent-task-protocol.md#reviewer-invocations): `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- Model confirmation: the output header showed model `gpt-6.1-sol`, reasoning effort `medium`, the read-only sandbox, and the session. Session `01a17ef1-8b1c-7c71-98f8-ac9674b14291`. Snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) before and after: equal. Both as relayed by the worker session.
- The reviewer confirmed every other G2 claim and file and line citation against the code, and that the MODIFIED requirement keeps the existing text apart from its intended edit.
- Findings: 0 Critical, 0 High, 0 Medium, 1 Low, matching its `passes.jsonl` line:
  - **L1 (Low, docs):** account pool section 4.7 and `design.md` D2 said that a `reject` policy rejects only an attempt that would otherwise fit, although the charge check follows the credential step, so an attempt with an exhausted delegation budget gets the slot rejection. Fixed in `35878f2b`, an unreviewed fix: both places now limit the claim to an attempt that passed the installation, attempt, request, worker, and quota checks and say that the charge check follows. The spec delta makes no such claim; its scenario "Rejecting policy behind a full quota" concerns the quota check only and is unchanged.

The review ended with pass 1: under governance "Low findings are fixed", a pass with only Low findings is fixed without another review, so reviewer B, Claude Code `claude-opus-5-5` (effort `high`), was not used.

## Limitations

- Contract and specification only; no runtime behavior changes, so no runtime check applies. The rules of section 4.7 are verified only when item 12 implements them with the tests that section 9 lists.
- The table name of the slot records is item 12's; capacity reservation section 13 names them by the contract section instead.

## Remaining gates

- Integration into dev by the coordinator (single pull request).
