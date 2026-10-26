# Verification: define-agent-harness-port

## Scope and source

- G3 work plan item 3 (`docs/g3-plan.md`), assigned by the coordinator on 2026-10-26, under the owner's decision of 2026-10-26 that starts the G3 wave 1 contracts (items 3, 5, 6, 7, and 8) in parallel with G2.
- Sources: architecture sections 6 and 7; ADR 0003 decisions 8 and 11 and its consequences; ADR 0005; the Claude Code qualification ("Native capabilities", "Pending approval across a crash", "Host side effects", "Consequences for the agent port"); the supervisor identity contract section 8; the capacity reservation contract section 10; G3 decision D13 (c); the G2 item 15 hand-off in the execution wire contracts. Naming and port style follow the merged `define-product-ports` change and the frozen SDLC framework port.
- Module placement: the Execution module, which architecture section 6 names as the owner of sessions and approvals and lists `AgentHarness` among its ports (design decision 1). No new dependency.
- Delivered: `docs/contracts/agent-harness-port.md`, the `agent-harness-port` spec delta, the `AgentHarness` port types and constants, the parsers of plugin data (`parseAgentHarnessCapabilities`, `parseHarnessEvent`, `parseOperationResult`), the conformance suite `runAgentHarnessConformance`, the scripted test harness `ScriptedAgentHarness`, and their tests.
- Not delivered, by scope: a real harness plugin, the harness host, the account pool, SCM and git workspace work, wire schemas, and freezing the port in the plugin SDK.

## Way of working

- The coordinator's addendum of 2026-10-26 (owner rule "Subagent execution", being recorded in `require-subagent-task-execution`) arrived during review pass 2. Everything up to and including commit `434df46` (the contract, the port types, the suite, the tests, the pass 1 fixes in `da9378a`, and the merge of `origin/dev`) was written in the worker session itself, before the rule applied. From the pass 2 fixes on, the worktree changes were made by an implementation subagent that the worker briefed with the task, scope, rules, and findings; the worker checked its result before review and handoff. Messages to the coordinator, the independent review, and this record stayed in the worker session.

## Environment

- macOS 26.6.2 (Darwin 25.6.0), arm64; Node.js v24.22.1 from `.nvmrc` through `nvm use`; Docker Desktop running for `make verify`.
- Worktree `../taskelith-worktrees/define-agent-harness-port`, branch `define-agent-harness-port`, created from `origin/dev` at `cd2805e`; `origin/dev` at `1ccbd79` merged in `434df46`. The merge brought only Claude Code and Codex qualification evidence for linux/arm64 and the archived `record-native-arm64-harness-qualification` change, none of which changes this change's requirements or inputs.

## Author self-check before review

- No type, value, or test of the Execution module names a harness, vendor, model, or native field; native identifiers are opaque strings.
- The port, its parsers, the suite, and the scripted harness import only the kernel and the module's own files; no adapter is imported by a port.
- Every comment is within the comment length rule (`npm run verify:comments`).
- Evidence check: every document, ADR, contract, and qualification section that the contract cites was read at the base revision, and each relative link in `docs/contracts/agent-harness-port.md` resolves to an existing file.

## Checks

| Revision | Command | Result |
| --- | --- | --- |
| `7cccca8` | `make verify` | Passed: 1431 tests, 0 failed; coverage over all files 99.21% lines, 91.30% branches, 98.76% functions; agent harness files at least 96.62% lines and 82.42% branches; 64 OpenSpec items valid; archive dry run valid; package verification passed |
| `7cccca8` | `npm run openspec -- validate define-agent-harness-port --strict` | Valid |
| `434df46` (pass 1 fixes and the `origin/dev` merge) | `make verify` | Passed: 1434 tests, 0 failed; coverage over all files 99.27% lines, 91.61% branches, 98.74% functions; agent harness files at least 99.50% lines, 92.34% branches, and 98.25% functions; archive dry run and package verification passed |
| Pass 2 fixes (run by the implementation subagent on the uncommitted tree that became the next commit; the worker checked the log and the diff) | `make verify`; `npm run openspec -- validate define-agent-harness-port --strict` | Passed: 1436 tests, 0 failed; coverage over all files 99.26% lines, 91.65% branches, 98.74% functions; agent harness files at least 99.34% lines, 92.91% branches, and 98.53% functions; comment check, archive dry run, and package verification passed; change valid |

## Independent review

Reviewer: OpenCode CLI, assigned by the coordinator (Codex went to another task, and Antigravity CLI is paused until about 2026-10-31). Every pass ran from the worktree with the invocation `opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k3.1-pro#high' --format json --title define-agent-harness-port "$(cat <prompt-file>)" < /dev/null > <log>`, with the prompt file and log outside the worktree. The prompt named `AGENTS.md`, ADR 0004, the governance review process, the sources above, and the plan row, forbade `git -C`, absolute paths, and compound commands, and asked for every instance with severity, file and line, and a fix, and counts per severity. The reviewer agent's allowlist refused test and `verify:comments` runs, so its passes were static.

### Pass 1

- Session `ses_e88ccc30bffeeP6per6lEAoH8B`. Model confirmation: the stored assistant messages record provider `opencode-go`, model `kimi-k3.1-pro`, variant `high`, agent `reviewer`.
- Reviewed revision: `7cccca8` against `cd2805e`.
- Snapshot before and after: `9e7b880e49716aebf7384c1e5c318b1b8ba590816d0e4021c504f07c86b97e13`, unchanged.
- Findings: Critical 0, High 8, Medium 8, Low 4. All were resolved in `da9378a`.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | High | No parser for operation results | `parseOperationResult` checks the exact kernel `Result` envelope and each operation's value; the suite uses it |
| 2 | High | The host could not locate the binary whose digest it checks | `PinnedBinaryData.path` inside the plugin package; start and resume carry the verified `binaryPath`, the only file the plugin runs |
| 3 | High | Timeouts did not bound operations or a whole wait, and timed-out reads could overlap | Every operation, probe, and whole event wait is under the deadline; a timed-out read abandons the iterator |
| 4 | High | Chat and resume passed without context | `remember` and `recall` prompts with the `recalled` text, checked in chat and after resume |
| 5 | High | Allow and deny were not observed | The `actionRuns` probe: a deny must not run the action, an allow runs it exactly once |
| 6 | High | Input and delegation answers could be ignored | The turn's output must contain the answer |
| 7 | High | Resume did not detect a replay | An event naming a turn of an earlier generation is a finding; a replaying test harness proves it |
| 8 | High | No exit observation or outcome mapping checks | The `endHarness` probe and an exit scenario; optional turn and account limit prompts |
| 9 | Medium | No rule for a host restart with a live process | Contract section 5 "Host restart" |
| 10 | Medium | Close could skip the `interrupted` outcome | Checked at close and before `session-ended` |
| 11 | Medium | A reused native request ID could not be detected | The permission scenario asks twice in one generation |
| 12 | Medium | Incomplete response validation | Unknown kinds are `invalid`; payloads validated; malformed responses sent by the suite |
| 13 | Medium | Interrupt and close races in the scripted harness | A stop wins over an unpublished outcome; concurrent closes share one end |
| 14 | Medium | A throwing iterator acquisition aborted the suite | Guarded, reported as `threw` |
| 15 | Medium | Impossible calendar dates accepted | Round-trip check of `resetsAt` |
| 16 | Medium | Spec and contract disagreed on `turn-ended` at a crash | Aligned: exactly one `turn-ended` before `session-ended` unless the plugin is lost with the process |
| 17 | Low | The parsers claimed to stop proxies running code | Claim removed; the parsers check shapes only |
| 18 | Low | Invalid branch refs accepted | `git check-ref-format` rules for the branch name |
| 19 | Low | `timeoutMs` not validated | A `fixture` finding for a value outside 1 to 600,000 |
| 20 | Low | Interrupted scripted requests retained | Pending requests cleared when a generation ends |

### Pass 2

- Session `ses_e88b8809affedvUKN20CRK0o95`. Model confirmation: provider `opencode-go`, model `kimi-k3.1-pro`, variant `high`, agent `reviewer`, in the stored assistant messages. The event log also holds one transient provider error ("stream ended without finish_reason"); the session recovered and ran to its full report.
- Reviewed revision: `434df46` against `1ccbd79`. The prompt named the pass 1 session and asked the reviewer to confirm each pass 1 resolution first.
- Snapshot before and after: `b200941c5bc1d506366f342a84eff670364e58971c9178dade0cc1632be7d5ad`, unchanged.
- Pass 1 confirmation: 17 resolved; 3 partly resolved (3, 6, and 12), whose remaining parts are pass 2 findings 1, 6, and 5.
- Findings: Critical 0, High 3, Medium 5, Low 6. All were resolved by the implementation subagent and checked by the worker, in the commit after `434df46`.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | High | An endless stream of immediately resolved events defeats the whole-wait deadline | Each event read first checks the deadline by the clock, so an endless stream of resolved events times out; regression test with such a stream |
| 2 | High | A pseudo-terminal starts its own process group, which conflicts with the macOS process-group obligation | Contract sections 4.3, 8, and 11 and the spec delta: a terminal runs in its own session under a pseudo-terminal; Linux cgroup containment covers it; on macOS the host offers no terminal until item 39 extends the supervisor identity contract to the terminal's process group. Raised with the coordinator at handoff |
| 3 | High | A resume during an unfinished close mixes the generations in the scripted harness | The scripted harness keeps each generation's state apart; a resume waits for an unfinished close and checks again; test of a resume during a close |
| 4 | Medium | Scenarios leave sessions open after an early return | Each scenario ends with a best-effort cleanup that closes a session left open, or ends its harness, without findings; tested |
| 5 | Medium | Response validation incomplete, and not checked for input and delegation | Responses with undefined fields or out-of-bound values are rejected; the suite sends malformed, extra-field, and wrong-kind responses for every request kind; contract section 7.3 lists the fields and bounds |
| 6 | Medium | Delegation conformance does not check the ID, the outcome, or all four outcomes | One delegation per outcome, each with its own ID; each turn's output must contain its ID, outcome, and summary |
| 7 | Medium | `parseOperationResult` accepts a success without `value` | A success needs an own `value`; tests updated |
| 8 | Medium | Generation fencing not checked for `events`, `interrupt`, `closeSession`, and `terminalProgram` | After a resume, `submitTurn`, `events`, `interrupt`, `closeSession`, and, when declared, `terminalProgram` at the earlier generation must fail with `precondition-failed`; a test harness that ignores the generation on close is reported |
| 9 | Low | `refs/heads/@` rejected | `refs/heads/@` accepted; test added |
| 10 | Low | Generation numbering ambiguous | A start is at generation 1 exactly (`invalid` otherwise) and a resume at the next generation exactly (`precondition-failed` otherwise), in the contract, the spec delta, and the scripted harness; tested |
| 11 | Low | `actionRuns` accepts negative and unsafe integers | `actionRuns` must be a non-negative safe integer; tested |
| 12 | Low | Resume keeps the first working directory | A resume updates the working directory; tested through the terminal program |
| 13 | Low | The proposal omits the result parser | The proposal names `parseOperationResult` |
| 14 | Low | The close rule contradicts itself | Contract section 5 states the exceptions: a repeated close, and a resume at the next generation |

## Limitations

- The conformance suite runs only against the scripted test harness here. The pinned binary digest, disabled self-update, the write set, credential exposure, and process-group containment need a real harness; the contract assigns them to items 18, 19, and 35.
- The reviewer's passes were static: its allowlist refused running the tests.

## Remaining gates

- Coordinator integration into `dev`, archive, and cleanup.
- G4: the second harness passes the same suite before the port is frozen in the plugin SDK.
