## Why

On 2026-10-25 the owner asked to try OpenCode as a reviewer. A trial run reviewed the merged `add-reviewer-unavailability-rule` change read-only. It found 1 High, 6 Medium, and 7 Low findings that three Codex passes had not reported. The owner then approved OpenCode as a reviewer, asked to add it to the configuration, to fix the trial's findings, and to tell every agent how to use it.

## What Changes

- Add OpenCode CLI to the authorized reviewers in `docs/governance.md`: model `opencode/kimi-k3`, which the owner chose after the trial, and agent `reviewer`. Add its invocation to the reviewer invocations in `docs/agent-task-protocol.md`.
- Fix the trial's findings on the "Unavailable reviewer" rule:
  - the replacement must meet the task's review requirements, such as network access;
  - the 30 minutes run from the failed attempt;
  - unavailability means an attempt that does not run to a report;
  - the coordinator and worker steps agree on who proposes the replacement;
  - the rotation order is defined;
  - the replacement is briefed and reviews the whole task;
  - failed attempts do not count as passes;
  - the owner's sentence is attributed separately from the derived mechanics;
  - longer pauses are listed in the protocol.
- Update the `AGENTS.md` summary, the skill, and the `review-process` Purpose.

The OpenCode `reviewer` agent is user configuration outside the repository; the protocol states what it must deny.

## Capabilities

### New Capabilities

### Modified Capabilities

- `review-process`:
  - "Unavailable reviewer" is modified;
  - "Unavailable reviewer record" and "Rotation order" are added;
  - the Purpose names the replacement.

## Impact

Documentation, the project skill, and the specification only. No product behavior changes.
