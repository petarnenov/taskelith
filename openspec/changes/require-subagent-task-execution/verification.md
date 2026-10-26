# Verification: require-subagent-task-execution

## Scope and source

On 2026-10-26 the owner asked, in Bulgarian and paraphrased here, to make it a mandatory rule that an agent that receives a task carries it out in a subagent, and clarified that OpenCode should review this rule change; `design.md` records how the reading was settled. The coordinator wrote the first revision (`eece60a` and `4270811`) directly in its own session, before the rule existed in the repository, so that revision did not follow the rule. From review pass 1 on, a subagent the coordinator briefed made the fixes, and the coordinator checked the result. Base revision: `c89cf6c` on `dev`.

## Environment

macOS on x86_64, Node.js 24.22.1.

## Author self-check before review

- The rule appears in the protocol, the skill, and `AGENTS.md`, and they agree.
- The reviewer rules are unchanged; OpenCode reviews this change because the owner asked for it.
- The spec requirement is 271 characters. All content is English, and no worker or host is named.

## Evidence check

The change adds no external link or external fact; its only source is the owner's instruction above.

## Checks

- `npm run openspec -- validate require-subagent-task-execution --strict`: passed on `4270811`, before review pass 1.
- `make verify`: passed (exit 0) on `4270811`, before review pass 1.
- `npm run openspec -- validate require-subagent-task-execution --strict`: passed ("Change 'require-subagent-task-execution' is valid") on `b6de140`, after the pass 2 fixes.
- `make verify`: passed (exit 0) on `b6de140`, after the pass 2 fixes.

## Independent review

Reviewer: OpenCode CLI, as the owner asked, with the model `opencode-go/kimi-k3.1-pro` and the `high` variant. Invocation:

```sh
opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k3.1-pro#high' --format json --title require-subagent-task-execution "$(cat <prompt-file>)" < /dev/null > <log>
```

### Pass 1

Session `ses_e8a32966bffelTmk3SdZmGpU6j`, revision `4270811`. Model confirmation from the stored assistant messages of the session: provider `opencode-go`, model `kimi-k3.1-pro`, variant `high`. The SHA-256 snapshot of the worktree before and after the review was equal: `c8e3a9eb53a1b162d2ac7741b159b201ac5d7ef666d2897f08de755ed1a9129a`. Findings: High 1, Medium 1, Low 1.

- High: this file said the rule takes effect when the change merges, which contradicts the protocol, the design, and the spec, where the rule applies to tasks assigned from 2026-10-26 on. Resolution: the claim is removed; the scope section and the limitations state honestly how the first revision was written.
- Medium: the checks were `PENDING` and task 2.1 was open. Resolution: the checks are recorded above and task 2.1 is done.
- Low: in `AGENTS.md` the rule sat inside the bullet about parallel sessions, which could read as limiting it to parallel work. Resolution: the rule is its own unconditional bullet in the same list, with the same link.

The High and Medium fixes are checked by pass 2.

### Pass 2

Session `ses_e88b0cc85ffezFUb7T32tNpJI2`, revision `33a13d2` (the merge of `origin/dev` into the branch). Model confirmation from the stored assistant messages of the session: provider `opencode-go`, model `kimi-k3.1-pro`, variant `high`. The SHA-256 snapshot of the worktree before and after the review was equal: `e48cf41874135e1daf21e2410131fa81efa2d6851ec8285dd2552c78988f787b`. The reviewer confirmed that all three pass 1 findings are resolved. Findings: Medium 3, Low 1.

- Medium: in the protocol's "Subagent execution" section, the first bullet delegates OpenSpec artifacts to the subagent while the second keeps the review and its records in the session, and `verification.md` is an OpenSpec artifact. Resolution: the session runs the review and checks the record; the subagent may record the results the session provides. The protocol, `design.md`, and the spec delta say so.
- Medium: the checks were recorded only for `4270811`, and the line about the final revision gave no revision or result. Resolution: that line is a placeholder for the final results, recorded after the pass 2 fixes.
- Medium: pass 1 lacked the model confirmation. Resolution: it is recorded in the pass 1 section.
- Low: the remaining gates listed only integration and archive. Resolution: they list every open gate.

These fixes are checked by pass 3.

## Limitations

The coordinator wrote the first revision (`eece60a` and `4270811`) directly in its own session, before the rule existed in the repository, so that revision did not follow the rule. From review pass 1 on, including the pass 2 fixes, an implementation subagent the coordinator briefed made the fixes, and the coordinator checked the result.

## Remaining gates

- Review pass 3, the last pass under the three-pass cap.
- Integration and archive by the coordinator.
