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
| `make verify` | Pending |

## Independent review

Not yet reviewed. The coordinator assigns the reviewers; the passes are recorded here, in `passes.jsonl`, and in `findings.jsonl`.

## Limitations

- Contract and specification only; no runtime behavior changes, so no runtime check applies. The rules of section 4.7 are verified only when item 12 implements them with the tests that section 9 lists.
- The table name of the slot records is item 12's; capacity reservation section 13 names them by the contract section instead.

## Remaining gates

- Independent review by the reviewers that the coordinator assigns.
- Archive in the last commit of the branch, with the checks of the archived tree.
- Integration into dev by the coordinator (single pull request).
