# Verification: add-opencode-reviewer

## Scope and source

The owner asked on 2026-10-25, in Bulgarian and paraphrased here:

- to try OpenCode as a reviewer;
- after the trial, to approve OpenCode as a reviewer, add it to the configuration, fix the trial's findings, and tell every agent how to use it.

The coordinator developed this change itself, following the worker steps. Base revision: `9bb8013` on `dev`. Prepared in the git worktree `../taskelith-worktrees/add-opencode-reviewer`.

## OpenCode trial and configuration

- **Trial.** Session `ses_e8d1e0759ffesyIOcZ39dT45kO`, about 3 minutes.
  - Invocation: `opencode run --standalone --agent plan --format json`, using the owner's configured model `opencode/deepseek-v4.1-flash` with reasoning effort `high`.
  - Target: a detached worktree at `b7f331c`, the merge of `add-reviewer-unavailability-rule`.
  - The SHA-256 snapshots before and after were equal, and its 37 tool calls were reads.
  - Findings: Critical 0, High 1, Medium 6, Low 7.
  - A first attempt without `--standalone` attached to the background service and stalled without output.
- **Configuration.**
  - The `reviewer` agent was added to `~/.config/opencode/opencode.jsonc`. The previous file was backed up as `opencode.jsonc.bak-reviewer-20261025135248`.
  - Probes in a detached worktree showed the following:
    - denied: an `echo` redirection and a chained `touch`;
    - allowed: `git log` and `grep | head`;
    - a first allowlist let `cat … >`, `sed -n … >`, and `git diff >` write files. The probe files were removed.
  - Deny rules for redirection, command substitution, `tee`, `xargs`, `sed -i`, `--output`, and `-exec` were added.
  - A second probe denied `cat … >`, `>>`, `git diff --output=`, `| tee`, and `sed -i`, and allowed `git log` and `grep | head`. No file was created.
  - The probe sessions were `ses_e8d17ac14ffeg0GBZopG88YbhX`, `ses_e8d177766ffer5qUld6Ope3GFg`, and `ses_e8d16e6bfffefvOuaiXpLerqsz`, at 13:53, 13:53, and 13:54 local time. They ran the documented invocation without `--title`: `opencode run --standalone --agent reviewer -m 'opencode/deepseek-v4.1-flash#high' --format json`. Each completed, and its JSON events carried the `sessionID`. So `-m` with the `#high` variant was accepted.
  - After review pass 1, `sed -n` and `git grep` were removed from the allowlist, and `--pre`, `--ext-diff`, and `--textconv` were denied.
  - **Root cause of the stalls.** `opencode run` waited for the end of stdin, which the coordinator's shell kept open. The OpenCode database held no message for the stalled runs. With `< /dev/null`, five pings in a row (`stdin-test-1` to `-5`) succeeded in 4 to 6 seconds. Two runs that did submit their prompt stalled in the provider, for 38 and 162 seconds in one step.
  - **Model.** The owner then chose `opencode/kimi-k3`.
  - **Qualification with kimi-k3.** Session `ses_e8cc1ded3ffeuEHKfJbqCjB4Ea`, 15:26:53 to 15:32:22 local time.
    - The documented invocation with `< /dev/null` reviewed the same target as the trial.
    - The SHA-256 snapshots before and after were equal.
    - 32 tool calls ran, and 10 commands outside the allowlist were denied.
    - It reported Critical 0, High 0, Medium 0, Low 4.
  - **Final probe.** Session `ses_e8cbc2464ffeIZ3c0BkKWYsFGO`, on the final configuration.
    - Denied: `cat … >`, `| tee`, process substitution, and `rg --pre`.
    - Allowed: `git log --pretty=oneline` and `grep -c`.
    - No file was created.
  - Earlier stalls, recorded for history: a qualification run of the full documented invocation started at about 14:20 local time. It produced no output in 10 minutes, and the snapshot stayed equal. Two pings at about 14:31, with and without `-m`, also produced no output in 2 minutes. Under "Unavailable reviewer", OpenCode is unavailable for 30 minutes from those attempts. The cause, the service or the network, is not established.

## Trial findings and their resolution

- **H1.** The replacement ignored the review requirements. Fixed: it must meet the task's review requirements, such as network access, and a scenario covers that.
- **M1.** The window and the pause had no start or record. Fixed: the 30 minutes run from the failed attempt, the attempt is recorded with its time, and "Reviewer pauses" lists longer pauses, including Antigravity's.
- **M2.** Who proposes the replacement differed between the documents. Fixed: coordinator step 1 assigns the replacement that the worker proposes. The case where the coordinator develops the task itself is covered.
- **M3.** The rotation order was undefined. Fixed: it follows the governance list order, skipping unavailable and paused reviewers, and the "Rotation order" requirement states it.
- **M4.** The requirement omitted the briefing and the review of the whole change. Fixed in the modified requirement.
- **M5.** "An error" was ambiguous. Fixed: unavailability is an attempt that does not run to a report, and a pass that reports findings is not.
- **M6.** The derived mechanics were attributed to the owner. Fixed: the owner's sentence stands alone, and the mechanics are marked as the coordinator's.
- **L1.** Fixed: the `review-process` Purpose names the replacement.
- **L2.** Fixed: the `AGENTS.md` summary names the replacement.
- **L5.** Fixed: the rule speaks of a failed attempt, and failed attempts do not count toward the pass cap.
- **L6.** Fixed: an "Exclusion ends" scenario and a no-retry rule.
- **L3, L4, and L7.** These concern the archived record of `add-reviewer-unavailability-rule` and are acknowledged here, without changing the archive:
  - it has no Limitations section;
  - it does not record that a repeated phrase was fixed after pass 3, without review;
  - pass 3 does not state that the model was confirmed in the output header, although the header named `gpt-6.1-sol`.

## Author self-check before review

- The owner's rule is quoted as the owner's, and the derived mechanics are marked as the coordinator's.
- The one-reviewer rule, the ban on cross-review, and the three-pass cap are unchanged.
- The governance policy, the protocol, the skill, `AGENTS.md`, and the spec agree.
- Each requirement is under 500 characters: 430, 216, and 359.
- The change adds no external link. All content is English.

## Checks

Node v24.22.1, in the worktree:

- `npm run openspec -- validate add-opencode-reviewer --strict` passed.
- `make verify` passed at `5c74e1b` before pass 1: 728 tests passed, 0 failed, and the comment check passed.
- After the pass 1 fixes, `make verify` passed on the staged tree committed as `a6c354c`, the head reviewed by pass 2.
- After the pass 2 fixes and a merge of `dev` at `9e6febd`, `make verify` passed at the head reviewed by pass 3.

## Independent review

Reviewer: Claude Code with `claude-fable-5-1`, effort `medium`, invoked as `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`.

The rotation would give this change to OpenCode: Codex was the most recently assigned, and Antigravity is skipped. The coordinator took the rotation's exception for a task that needs a particular reviewer, because this change defines OpenCode's own authorization and invocation, and a reviewer that is not its subject reviews it.

### Pass 1

Session `9cec1f01-c535-4a5f-81da-315bd8982503`, started at about 14:05 local time, before OpenCode's first failed attempt; model `claude-fable-5-1` confirmed in the JSON `modelUsage`, at `5c74e1b`. The SHA-256 snapshots before and after were equal.

Findings: Critical 0, High 0, Medium 4, Low 7.

1. Medium: the Rotation bullet carried mechanics derived by the coordinator under the owner's attribution. Fixed: that sentence is marked as the coordinator's.
2. Medium: rotation skipped only unavailable or paused reviewers, and a forced assignment was undefined. Fixed: a reviewer that cannot meet the requirements is also skipped, any assignment counts as the most recent, and a scenario covers the skip.
3. Medium: no `make verify` result was recorded. Fixed under Checks.
4. Medium: the documented invocation had no evidence. Fixed: the probe sessions show that `-m` with `#high` and the `sessionID` work. The full run's failure is recorded under the configuration.
5. Low: "Reviewer pauses" swallowed the snapshot and prompt paragraphs. Fixed: the subsection moved to the end of the section.
6. Low: the read-only claims were overstated. Fixed: the wording says "allowlist", and the snapshot is named as the proof. `sed` and `git grep` were removed, and more deny rules were added.
7. Low: network access was stated as observed. Fixed: "Web fetch and search are allowed in that agent".
8. Low: the OpenCode skip had no recognized ground. Fixed: it is recorded as the rotation's exception, with its reason.
9. Low: who lists a pause was undefined. Fixed: the coordinator adds a row when the reset time is more than 30 minutes away, and removes it after the first successful run.
10. Low: the protocol and the skill omitted the case where the coordinator develops the task itself. Fixed.
11. Low: the probes had no sessions, and the backup had no name. Fixed under the configuration.

### Pass 2

Session `5adafc4d-36a9-47ba-98c2-cd16e27cdc28`, model `claude-fable-5-1` confirmed in the JSON `modelUsage`, at `a6c354c`. The SHA-256 snapshots before and after were equal. All pass 1 findings were confirmed resolved.

Findings: Critical 0, High 0, Medium 3, Low 11.

1. Medium: a pause could never end, because a paused reviewer is never run. Fixed: a pause ends at its listed time, and a successful run only ends it early. The scenario was updated to match.
2. Medium: "Rotation order" omitted the exception for a change that needs a particular reviewer. Fixed.
3. Medium: the documented invocation had never reached a report with the `reviewer` agent. Fixed: the root cause was found, `< /dev/null`, and the qualification run with `kimi-k3` reached a report.
4. Low: an outdated requirement length. Fixed.
5. Low: an unnamed head. Fixed.
6. Low: two blank lines in a row. Fixed.
7. Low: the design omitted the requirements skip. Fixed.
8. Low: the protocol and skill wording was narrower than governance. Fixed.
9. Low: rotation did not wrap around. Fixed.
10. Low: the agent configuration was attributed to the owner. Fixed: it is marked as the coordinator's.
11. Low: `--pre` also blocked `--pretty`. Fixed with `--pre ` and `--pre=`, and process substitution is denied.
12. Low: the agent cannot read external evidence. Fixed with a note in the protocol.
13. Low: the qualification target and the post-edit probe were missing. Fixed.
14. Low: the time of pass 1 was missing. Fixed.

## Limitations

Documentation only. The checks ran on macOS arm64. The OpenCode configuration is the user's local file, outside the repository. No change has yet had an official pass by OpenCode; the qualification run reviewed an already merged change.

## Remaining gates

Independent review, then integration into `dev` and the archive by the coordinator. Promotion to `main` is a separate owner decision.
