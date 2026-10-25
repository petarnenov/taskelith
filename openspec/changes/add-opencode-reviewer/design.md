## Context

The trial ran `opencode run --standalone --agent plan` with the owner's configured model. The `plan` agent denies editing, but it allows every shell command, so read-only rested on the prompt and the snapshot alone.

## Decisions

- **A dedicated `reviewer` agent in the user's OpenCode configuration.** It denies every action by default. It allows reading, search, globbing, and web fetch and search. It allows shell commands only from a read-only allowlist: `git diff`, `log`, `show`, `status`, `ls-files`, `rev-parse`, `blame`, `merge-base`, and `cat`, `grep`, `rg`, `ls`, `wc`, `head`, `tail`, `diff`, `shasum`, and `pwd`. `sed` and `git grep` are left out, because `sed` can write with its `w` command and `git grep -O` opens a pager. Later rules deny commands that can write or run programs through an allowed prefix: output redirection, command substitution, `tee`, `xargs`, `sed -i`, `--output`, `-exec`, `--pre`, `--ext-diff`, and `--textconv`. A probe confirmed the denials: redirection, `--output=`, `tee`, `sed -i`, and a chained `touch` were all denied, and allowed reads ran. The snapshot check remains the proof of a read-only pass, because a pattern allowlist is not a sandbox.
- **`--standalone`.** Without it, `opencode run` attaches to the background service. In the trial that service ran in the main clone, and the run stalled without output.
- **The model is set in the invocation.** `-m 'opencode/deepseek-v4.1-flash#high'` sets the model and variant. The JSON events do not name the model, so `verification.md` records the invocation.
- **Rotation order follows the list order:** Codex, Antigravity, OpenCode, Claude Code. Paused or unavailable reviewers are skipped.
- **Derived mechanics are attributed to the coordinator.** The owner's rule is quoted as the owner's. The mechanics that apply it to the existing rules are marked as the coordinator's.
- **Findings on the archived change's record are not fixed here.** Three of the trial's Low findings concern the archived `verification.md` of `add-reviewer-unavailability-rule`: L3, a missing Limitations section; L4, an unrecorded edit after pass 3; and L7, a model confirmation in pass 3. This change records them in its own `verification.md` and leaves the archive unchanged.
