## Why

On 2026-10-25 a Claude Fable 5.1 review pass failed three times in a row with "No messages returned from query" and opened no session, so the task's second pass stalled. The one-reviewer-per-task rule left no way forward without an owner exception. The owner then set a rule: when a reviewer is unavailable for any reason, it is not used for the next 30 minutes, and the next reviewer in the rotation is proposed instead.

## What Changes

- Add the rule "Unavailable reviewer" to the governance review process.
- Name the rule in the agent task protocol, both in the coordinator's assignment step and in the reviewer invocations.
- Point to the rule from the `taskelith-task-protocol` project skill.
- Add a `review-process` requirement for it.

## Capabilities

### New Capabilities

### Modified Capabilities

- `review-process`: a new requirement "Unavailable reviewer" allows the next reviewer in the rotation to take over a change whose assigned reviewer is unavailable. The pass count carries over.

## Impact

Documentation, the project skill, and the specification only. No product behavior changes.
