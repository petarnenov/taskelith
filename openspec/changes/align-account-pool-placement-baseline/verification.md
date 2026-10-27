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
- **Scope of edits.** `git diff b87abe75 -- docs` before the return, and `git diff origin/dev -- docs` after the merge of `99333004`, change only the sections named in "Scope and source"; capacity reservation section 10 is unchanged.
- **Requirement lengths.** After the reconciliation with `dev`, the requirement texts of the delta are 417, 195, 342, and 336 characters, below the about 500 that strict validation after archive tolerates.
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
| `npm run openspec -- validate align-account-pool-placement-baseline --strict` after the reconciliation | `Change 'align-account-pool-placement-baseline' is valid` |
| `make verify` on `70701af2`, the merge of `origin/dev` at `99333004` | Exit 0 on the second run, at a load average of about 8; `Totals: 70 passed, 0 failed (70 items)`; `Every findings file is valid: 44 file(s); every pass summary file is valid: 24 file(s).`; last line `Packed file allowlist and installed CLI verification passed.` The first run, at a load average of about 12, failed only `a provider that races two concurrent hand-offs fails the suite` (`packages/modules/workspace/test/workspace-conformance.test.ts:76`), a timing-bound test of a module that this change does not touch. Run on the Apple M3 host |

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

## Return and reconciliation

- **Return.** The coordinator returned the branch at its pushed head `7f84c3a2`, the archive commit, because merging `origin/dev` at `99333004` (#366, `align-account-pool-signals`) conflicted in `docs/contracts/account-pool.md` and `openspec/specs/account-pool-port/spec.md`.
- **Restore.** `9f7dd7f2` reverts `7f84c3a2` and restores the active change and the living specs of the base. Merge base of `7f84c3a2` and `origin/dev`: `b87abe75`.
- **Merge.** `70701af2` merges `origin/dev` at `99333004`. After the restore, only `docs/contracts/account-pool.md` conflicted, in three places; each keeps #366's text and adds this change's edit:
  - Section 2, rules 1 to 3: #366 added the harness's usage window length to the `installation-owner` commands of rule 1 and changed rule 2 to code-unit order. Kept; rule 3 gets this change's serializable list, whose signals now follow #366's section 5: a usage or limit signal or a credential authentication failure, no reset signal. The usage window length setting is not listed, because it changes no slot ([design](design.md) D5).
  - Section 4.2: #366 rewrote the usage step to the derived window end. Kept; the last sentence gets this change's write by the insert of the reservation (section 4.7).
  - Section 9: #366 changed the selection and cooldown tests and added a signal test. Kept; this change's placement test is added before them.
- **Without conflict.** #366's other edits of the account pool contract (status, section 1, the `mechanismId` and `usage` rows of section 3.1, section 4.4 step 3, section 5, section 7.1, section 10) and its capacity reservation section 10 edit merged unchanged. Section 4.4 step 3 now says that a slot wait backs off and follows the fair order, which agrees with section 4.7. The capacity reservation section 4 writers list is changed to the same signals as rule 3.
- **Reconciled requirements.** `git diff b87abe75 origin/dev -- openspec/specs` changes `account-pool-port` "Deterministic least-loaded order", which this delta modifies: the delta is rewritten from `dev`'s text, keeping its derived window end and the scenario "Ended usage window", and changes only the final clause to the insert of the reservation. "Serializable slot changes" follows #366's signals. The added requirement names do not exist in `dev`, and none contradicts #366's "Session reports applied to the reserving slot", "Usage window derived by the pool", or "Health from session failures". `harness-account-pools`, which #366 also changed, is not in this delta.
- **Citations.** `git diff b87abe75 99333004 -- packages apps` is empty, so every code citation of `design.md` and this record still holds; `design.md` now names both revisions.
- **Reviewer A pass of the return.** Pending: the coordinator relays reviewer A's review of the resolved diff and the reconciliation.

## Limitations

- Contract and specification only; no runtime behavior changes, so no runtime check applies. The rules of section 4.7 are verified only when item 12 implements them with the tests that section 9 lists.
- The table name of the slot records is item 12's; capacity reservation section 13 names them by the contract section instead.

## Remaining gates

- Integration into dev by the coordinator (single pull request).
