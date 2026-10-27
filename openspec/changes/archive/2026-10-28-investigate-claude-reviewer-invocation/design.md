## Context

The Claude Code reviewer rows of "Reviewer invocations" in `/docs/agent-task-protocol.md` ran `claude -p "<prompt>" --model <model> --effort <effort> --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, the `claude-opus-5-5` row with `< /dev/null`. On 2026-10-27 both attempts of a 2.9 KB review prompt failed: Opus 5.5 high at 22:43 to 22:48 EET and Fable 5.1 medium at 22:48 to 22:52 EET. Each exited 1 with "Error: No messages returned from query" on stderr, 0 bytes on stdout, and no session ID ([archived record](/openspec/changes/archive/2026-10-27-stabilize-workspace-handoff-race-conformance/verification.md)). A plain `claude -p "Reply with the single word OK."` worked.

## Diagnosis

- **The runs themselves completed.** The local session transcripts of both failed attempts end with a final assistant answer with `stop_reason` `end_turn`, 17.7 KB and 12.4 KB of review text. The model finished; only the CLI's output was lost.
- **Where the error comes from.** In the CLI 2.1.312 executable, the headless runner keeps the last message it drains that is not on a fixed exclusion list. With `--output-format json` it prints that message only at the end, and only if it is the `result`; otherwise it writes "No messages returned from query" and exits 1. With `--output-format stream-json` each message, the `result` included, is written as it arrives, and that check does not exist.
- **What can follow the result.** `rate_limit_event` and the system subtype `thinking_tokens` are not on the exclusion list. A global rate-limit listener emits a `rate_limit_event` whenever the account's rate-limit state changes after any API response. The user-level plugin `next-steps` makes a model call (`$.model.fork`) when a turn ends, after the `result`; debug logs show it running between the end of the turn and shutdown. Runs emitted two or three `rate_limit_event` messages each, for example when the five-hour utilization moved from 0.28 to 0.29.
- **Most likely trigger.** A `rate_limit_event` from a response after the `result` became the last message, so `json` mode reported no result. Expensive, long final answers (Opus high, Fable) make a state change in that window more likely. The flags are not the cause: the failing combination later passed (runs 4 and 7 below).
- **Unproven.** No run caught a `rate_limit_event`, or any other message that is not excluded, right after the `result`; in every stream-json run only excluded `ui_status` and `ui_invalidate` messages followed it. The mechanism is shown by the code; the trigger is inferred.

### Runs that isolate it

Each run was checked with the tree snapshot of the protocol; every snapshot was unchanged. The failed attempts and runs 1, 3, and 4 used the reviewed branch's worktree, the others the main clone. Run numbers follow the investigation log; runs not listed repeat a factor already shown.

| Run | Model, effort | Mode | Output | Prompt | Result |
|---|---|---|---|---|---|
| failed A | `claude-opus-5-5`, high | plan | json | review, 2.9 KB | exit 1, empty stdout, transcript complete |
| failed B | `claude-fable-5-1`, medium | plan | json | review, 2.9 KB | exit 1, empty stdout, transcript complete |
| 1 | `claude-fable-5-1`, low | plan | json | short, 3 tool calls | exit 0 |
| 3 | alias `haiku`, low | plan | stream-json | review | exit 0; only excluded messages after the result |
| 4 | alias `haiku`, low | plan | json | review | exit 0, 300 s |
| 7 | `claude-fable-5-1`, medium | plan | json | review | exit 0, 1019 s: the failing combination |
| 20 | `claude-opus-5-5`, high | plan | stream-json | review | exit 0, 254 s, `modelUsage` only `claude-opus-5-5` |
| 12b | `claude-haiku-5-5`, low | default | json | prompt after `--disallowedTools` | exit 1: the variadic flag took the prompt |
| 13b, 14 | `claude-haiku-5-5`, low | plan | json | write a file with Write | Write absent from the tool list, with comma and space syntax |
| 15 | `claude-haiku-5-5`, low | plan | json | write a file with Bash | refused by the model |
| 16 | `claude-haiku-5-5`, low | dontAsk | json | write a file with Bash | written, outside the repository |
| 18, 19, 21 | `claude-haiku-5-5`, low | plan | json, stream-json | prompt on stdin; stdin inherited; closed | exit 0 |

The alias `haiku` resolved to `claude-sonnet-5-5` in plan mode (runs 3 and 4, and a short run), while `claude-haiku-5-5` stayed Haiku, so the rows keep full model IDs. The experiments cost about $7.25 at list prices over 23 investigation runs, plus four CLI invocations, caused by a quoting error of the test harness, that the CLI rejected during argument parsing before any model query.

### Excluded factors

- Permission mode: plan and dontAsk both completed; plan is kept for its Bash restraint (runs 15 and 16).
- Run length and tool calls: short and multi-step runs, up to 1019 s, completed in `json` mode.
- stdin: closed, inherited, and carrying the prompt all worked.
- `--disallowedTools` syntax: space- and comma-separated lists both remove the tools; the flag is variadic, so the prompt must come before it.
- ExitPlanMode or plan approval: no run called ExitPlanMode.
- CLI version: 2.1.312 is installed and is the latest published version, so no update applies. An automatic update from 2.1.311 finished during failed attempt A, but attempt B ran entirely on 2.1.312.

## Decisions

- **stream-json, result line as evidence.** Recommended invocation, shown for `claude-opus-5-5`:

  ```sh
  claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan \
    --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose \
    < /dev/null > <log>
  ```

  The last line of the log with `"type":"result"` carries `session_id`, `modelUsage`, and the review text; run 20 proved it on a review-sized Opus run.
- **Plan mode stays, and the snapshot stays the proof.** `--disallowedTools` removes Edit, Write, and NotebookEdit. Bash remains: under another permission mode a Bash that the user's settings allow can write (run 16). Plan mode restrains Bash only through the model and a classifier; in run 7 the reviewer wrote scratch files under `/tmp` and started load processes, which it stopped. It can therefore write outside the worktree.
- **Scope.** Only the two Claude Code rows change. Disabling the `next-steps` plugin for reviewer runs would remove the call after the result, but it is a host setting, so it is not documented.

## Reproduction note

With CLI 2.1.312, `claude -p … --output-format json` can exit 1 with "No messages returned from query" and empty stdout after a completed run: `json` mode prints only when the last emitted message is the `result`, and a late `rate_limit_event`, for example after a plugin's model call when the turn ends, can displace it. Use `--output-format stream-json --verbose` and take the last `"type":"result"` line.

## Review checklist

Output of `make findings ARGS="checklist --files docs/agent-task-protocol.md"`:

```text
Review checklist (files docs/agent-task-protocol.md), most frequent finding categories first:
1. docs (2): Documentation is missing, wrong, or out of date with the change. Example: "The protocol and the statistics requirement did not mention misses that name a pass without a record"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (55): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
2. docs (43): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
3. spec-wording (25): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
4. stale-citation (23): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
5. process (10): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
6. contract-drift (9): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
7. scope (5): The change does more or less than its assigned scope. Example: "Design D6 defines size M as a contract, its spec, and its port types, while the SCM follow-up also changes the port's readers and conformance case"
```
