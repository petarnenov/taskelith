## Scope and source

Follow-up of G3 item 0, `revalidate-g3-foundations`, for its item 5 (the account pool contract of G3 item 5, `define-account-pool-contract`), size M, contract-first, assigned by the coordinator on 2026-10-27. The deferred findings are lines 16 to 19, 36, 42, and 47 to 50 of the archived [`findings.jsonl`](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/findings.jsonl) and rows of its [verification](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md#item-5). Their cited lines predate later edits; the table gives the line that holds the cited text at `b87abe75` and the line of the fix in this change's working tree.

| Finding | Cited line | Line at `b87abe75` | Fix |
| --- | --- | --- | --- |
| Pass 1 M1 (Medium): the pool requires a usage window end that the harness usage signal does not carry | `docs/contracts/account-pool.md:115` | 116 (Load) and 41 (`usage`) | Design D2: `account-pool.md` lines 41, 80, 115, 118, 202, 204; `account-pool-port` "Usage window derived by the pool" and "Deterministic least-loaded order" |
| Pass 1 M2 (Medium): the pool requires a separate reset signal that the harness port does not define | `account-pool.md:114` | 115 (Reset) | Design D1: line 115 removed, lines 112, 114, 203, 224; `account-pool-port` "Cooldown bounds" |
| Pass 1 L1 (Low): the promise to continue as soon as another slot is eligible ignores the G2 placement backoff and rotation | `account-pool.md:97` | 98 (step 3) | Design D5: line 98 |
| Pass 1 L2 (Low): the session invariant is assigned to G2 item 7; G3 item 4 owns it | `docs/contracts/capacity-reservation.md:172` | 172 | Design D6: `capacity-reservation.md` line 172; no delta for the `capacity-reservation` spec |
| Pass 2 M4 (Medium): the pool assumes the control plane can query a harness plugin outside a session for its mechanism and credential health | `account-pool.md:34` | 34 and 117 | Design D3: lines 14, 34, 112, 116, 156, 204; `account-pool-port` "Session reports applied to the reserving slot" and "Health from session failures" |
| Pass 2 L5 (Low): an account signal is said to name its slot, but it names none | `account-pool.md:111` | 112 | Design D4: lines 112, 204, 225; `account-pool-port` "Session reports applied to the reserving slot" |
| Pass 2 L10 (Low): code point order where the module and the capacity contract use code-unit order | `account-pool.md:21` | 21 | Design D7: line 21; `account-pool-port` "Slot store compare-and-set" |
| Pass 2 L11 (Low): the status line still says the contract is under independent review | `account-pool.md:3` | 3 | Design D7: line 3 |
| Pass 2 L12 (Low): the overview still names a reset signal | `account-pool.md:14` | 14 | Design D1: line 14 |
| Pass 2 L13 (Low): the usage window also governs the tie-breaker test of the contract and the spec | `openspec/specs/harness-account-pools/spec.md:24` | 28 (the requirement); the contract's test at 203 | Design D2: `account-pool.md` line 202; `harness-account-pools` "Least-loaded selection with cooldown" |

Exclusions: the findings deferred to `align-account-pool-placement-baseline` (pass 2 M3, L3, L4) and to `align-slot-credential-delivery` (pass 2 M5 to M7, L6 to L9), and the decisions of `align-slot-credential-delivery` (#364) on the D6 token-only delivery, rotation, and revocation versus removal. `docs/contracts/git-workspace.md` line 62 also says "code point order"; it belongs to the `git-workspace` capability and is not changed here.

## Revision and environment

Branch `align-account-pool-signals` from `origin/dev` at `b87abe75` (#365), in its own worktree with `make setup` done. Ubuntu 26.04.1 LTS on Linux x86_64, Node.js v24.22.1, OpenSpec through `npm run openspec`.

## Author self-check and evidence check

- Every fact of design "Context" was read in the code or documents at `b87abe75`: the port's `ACCOUNT_SIGNALS` and `account-signal` event shapes, the `AgentHarness` operations, the turn failure `authentication` and the operation failure `forbidden` of the agent harness port contract section 9, `SlotUsage` and `COOLDOWN_SOURCES`, `byCodeUnits`, the capacity contract section 13 wording on code-unit order, `FLEET_REASONS`, the `execution-model` requirement "Task ownership", and the G3 plan rows of items 3, 4, 5, 12, 18, and 19.
- `grep -rn -i "reset signal"` over `docs`, `openspec/specs`, and `packages` finds, after the change, four lines: the living spec `account-pool-port` line 60, which this change's delta replaces; `docs/g3-plan.md` line 100, the row of item 3, which describes merged work; and `docs/qualification/codex.md` line 229 and `docs/qualification/claude-code.md` line 216, qualification records whose history this change does not rewrite. The plan and qualification lines name the reset time that the port carries as `reset-time`, not a signal that ends a cooldown. `grep -rn "credential check through"` finds nothing.
- No code changed: `git diff b87abe75 --stat -- packages apps scripts` is empty, so no comment, conformance, or fail-before test is affected.
- Each requirement body of the deltas, measured with Python `len` on its line: `account-pool-port` "Deterministic least-loaded order" 318, "Cooldown bounds" 278, "Slot store compare-and-set" 408, "Session reports applied to the reserving slot" 382, "Usage window derived by the pool" 337, "Health from session failures" 283; `harness-account-pools` "Least-loaded selection with cooldown" 490. Each modified requirement keeps every scenario of its living requirement.
- This change's records link only inside the change directory or root-relative, and the deltas only root-relative; `npm run verify:links`, part of `make verify`, checks them.

## Commands

- `git show b87abe75:docs/contracts/account-pool.md | grep -n "<cited text>"` for each finding, and the same for `capacity-reservation.md` and the `harness-account-pools` spec: the lines of the table.
- `make findings ARGS="checklist --capability account-pool-port,capacity-reservation,harness-account-pools --files docs/contracts/account-pool.md,docs/contracts/capacity-reservation.md,openspec/specs/**"`: the output is in [design](design.md#review-checklist) and equals the text of the coordinator's brief.

## Checks

Run on 2026-10-27 at head `dbabd5fb`, the branch's four commits on `b87abe75`, with a clean working tree; the next commit adds only this record and the tick of task 3.1.

| Check | Result |
| --- | --- |
| `npm run openspec -- validate align-account-pool-signals --strict` | Passed: "Change 'align-account-pool-signals' is valid" |
| `npm run openspec -- validate --all --strict` | Passed: "Totals: 70 passed, 0 failed (70 items)" |
| `make findings ARGS="validate"` | Passed: "Every findings file is valid: 43 file(s); every pass summary file is valid: 23 file(s)." |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | Passed (exit 0), last line "Packed file allowlist and installed CLI verification passed."; `verify:comments` "Every comment is within the comment length rule."; coverage over all files 99.28 % lines, 92.33 % branches, 98.94 % functions; OpenSpec "Totals: 70 passed, 0 failed (70 items)"; `verify:links` "Every checked link conforms."; `verify:archive` "Every active OpenSpec change archives into strictly valid specs." |

After the review pass 1 fixes (`3745eaaf`) and with this record's pass 1 entries staged (tree `f9c3ef2f8719be91fef4ec782e173c2e84e7f94c`, which differs from the record commit only in this paragraph):

- **`npm run openspec -- validate align-account-pool-signals --strict`**: `Change 'align-account-pool-signals' is valid`.
- **`npm run openspec -- validate --all --strict`**: `Totals: 70 passed, 0 failed (70 items)`.
- **`make findings ARGS="validate"`**: `Every findings file is valid: 43 file(s); every pass summary file is valid: 23 file(s).`
- **`TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`**: exit 0, last line `Packed file allowlist and installed CLI verification passed.`; comments within the rule; coverage over all files 99.28 % lines, 92.33 % branches, 98.94 % functions; OpenSpec `Totals: 70 passed, 0 failed (70 items)`; links `Every checked link conforms.`; archive dry-run `Every active OpenSpec change archives into strictly valid specs.`

`make verify` needs `TMPDIR` on this host because `/tmp` holds an empty `.git` directory.

## Independent review

The coordinator assigned the reviewers and ran the pass ([independent review process](/docs/governance.md#independent-review-process)).

### Pass 1, reviewer A

- Reviewer: Codex, `gpt-6.1-sol`, reasoning effort medium, reviewed head `d6b2ae1c`, run by the coordinator with the Codex CLI row of [reviewer invocations](/docs/agent-task-protocol.md#reviewer-invocations) (`codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`); model, effort, and session as the coordinator reported them.
- Session: `01a17ef0-dbbf-7950-9182-235abcad61f4`.
- Snapshot: `77fa31be9f58e5f8183ca99a4e78279ffdb0ba9f2b0977ecc4f1d598b117a1f5` before and after the pass, unchanged.
- Counts: Critical 0, High 0, Medium 0, Low 3.
- A Low-only pass ends the review under governance "Low findings are fixed", so reviewer B is not used and passes 2 and 3 do not run. The three fixes, in `3745eaaf`, have the outcome `fixed-unreviewed`.

| # | Severity | Finding | Resolution | Commit |
| --- | --- | --- | --- | --- |
| 1 | Low (contract-drift) | `specs/account-pool-port/spec.md:26` and `design.md:24` equated code-unit order with the `"C"` collation unconditionally; they agree only for ASCII identifiers | The delta and design D7 say that the two orders agree for ASCII identifiers; the normative order stays code-unit order. The requirement body is now 408 characters | `3745eaaf` |
| 2 | Low (docs) | `design.md:30` claimed that the window length bounds the error of a late usage report, though relay delay has no bound and a stale report gets a new end | The risk describes the derived window as an approximate validity after application; the length bounds only later use, not the report's age or its deviation from the provider's window | `3745eaaf` |
| 3 | Low (evidence-mismatch) | `verification.md:27` said the `reset signal` grep finds one line; it also finds `docs/g3-plan.md:100`, `docs/qualification/codex.md:229`, and `docs/qualification/claude-code.md:216` | The record lists the four matches and why the plan row and the qualification records stay | `3745eaaf` |

## Limitations

- The usage window length has no range or default in the contract; item 12 sets its validation (design D2).
- A transiently rejected credential keeps its slot `unhealthy` until a rotation (design D3, "Risks").

## Remaining gates

Review pass 1 was Low-only, so passes 2 and 3 are not run.

- Archive
- Integration into dev by the coordinator (single pull request)

## Archive checks

After `npm run openspec -- archive align-account-pool-signals --yes`:

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `npm run openspec -- validate --archived`: `change/2026-10-27-align-account-pool-signals` valid; 204 passed and 13 failed, all 13 older archived changes from 2026-10-24 to 2026-10-26 that this change does not touch.
- `git diff b87abe75 -- openspec/specs` (merge base): only the applied deltas, `account-pool-port` (3 added, 3 modified) and `harness-account-pools` (1 modified).
- `make findings ARGS="validate"`: 43 findings files and 23 pass summary files valid.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: passed.
