## Why

On 2026-10-27 both Claude Code reviewer attempts of pass 2 of `stabilize-workspace-handoff-race-conformance` failed with the documented invocation: `claude-opus-5-5` and `claude-fable-5-1`, each with `--permission-mode plan` and `--output-format json`, exited 1 with "Error: No messages returned from query", empty output, and no session ID ([archived record](/openspec/changes/archive/2026-10-27-stabilize-workspace-handoff-race-conformance/verification.md)). The reviewers were paused and the review fell back to another model of reviewer A's harness. The cause was unknown, so both Claude Code reviewers could fail again.

## What Changes

- The two Claude Code rows of "Reviewer invocations" in `docs/agent-task-protocol.md` use `--output-format stream-json --verbose`, close stdin with `< /dev/null` in both rows, and redirect stdout to a log. The confirmation is the log's last `"type":"result"` line, which carries `session_id` and `modelUsage`.
- The rows say why `json` is not used, that plan mode stays because under another permission mode a user-allowed Bash can write, and that plan mode does not sandbox Bash, so the snapshot remains the proof.
- Outside this change's OpenSpec records, only those two rows change. No other current operational instruction documents the Claude Code reviewer invocation; archived records that quote the old invocation stay unchanged as history.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The change corrects an operating instruction under the existing independent review process in `docs/governance.md`, so it sets `skip_specs: true`.

## Impact

Claude Code reviewer runs of every task. No code, contract, or requirement changes.
