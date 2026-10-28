## Context

The brief (coordinator Niki, owner-approved 2026-10-28, size S-M) asks for one command that runs the route before pass 1 and starts each reviewer in a secret-free environment with its fixed flags, and records the pass line. The reviewer invocations lived in the table of [the agent task protocol](/docs/agent-task-protocol.md#reviewer-invocations), and the route in worker step 4.

## Decisions

- **Two modules.** `scripts/reviewer-invocations.ts` is the pure table: per reviewer its canonical key, command, arguments, stdin (the prompt file for Codex, closed for the others, the effect of `< /dev/null`), its own environment variables, and how its session and model are read from its output. `scripts/review-run.ts` holds the gate, the launch, and the record, and is the composition root.
- **Reviewer key.** `REVIEWER` is the canonical key of [`scripts/reviewer-keys.ts`](/scripts/reviewer-keys.ts) with the authorized effort as its variant, for example `codex gpt-6.1-sol#medium`; any other key is refused with the list of keys. The effort is governance "Authorized reviewers" under policy version 7, because "Routed effort" does not yet authorize the routed efforts; the command prints the reviewer that `route.json` recommends for the pass beside it.
- **Fresh route.** A `route.json` is fresh when its `devCommit` is the current merge base of `HEAD` and `origin/dev` and `git diff --quiet <headCommit> HEAD` shows no change outside the change's own directory. The route record lies in that directory, so committing it keeps the route fresh; any code or document change outside it makes the route stale, as worker step 4 requires.
- **Gate outcome.** With a missing or stale route and a clean tree that has a passing `make verify` stamp of its profile (the `verify-stamp.ts` check the `pre-push` hook uses), the command deletes a stale `route.json`, runs the route command in process with the inherited environment, which holds the credential, and stops with exit status 3. It does not run the reviewer then, because worker step 4 needs `route.json` committed before the `make verify` that `make record` records and that `make record-check` checks before pass 1. Without the stamp it refuses with exit status 1 and routes nothing.
- **Environment.** The child gets an explicit environment object with only the allowed names that are set; nothing is inherited, the effect of `env -i`. The per-reviewer additions are configuration locations only: `CODEX_HOME`; `CLAUDE_CONFIG_DIR`; `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`, and `OPENCODE_CONFIG`; none for Antigravity.
- **Output and confirmation.** The log takes stdout and stderr. Codex: `model:` and `session id:` of the header. Claude Code: the last `"type":"result"` line, its `session_id` and the `modelUsage` keys. OpenCode: the first `sessionID` of the JSON events; the model is not in the events, so the command says that the stored messages confirm it. Antigravity: `conversation_id` of the JSON output, and the model in its own log, `<LOG>.cli.log`. A non-zero exit, a missing or schema-invalid session ID, or another model reported exits 4 and writes no line, because a failed attempt is no pass.
- **Pass line.** The command writes no `passes.jsonl` line, because parsing findings is out of scope and a line with counts 0 would be a false record until edited. It prints a template with the change, pass, role, reviewer, and session filled and the strings `<critical>`, `<high>`, `<medium>`, and `<low>` as counts, which fail the pass schema if pasted unfilled; the worker appends the filled line after the report. A pass that already has a line is refused before the reviewer runs, because it has already run.
- **Make arguments.** As for `make integrate` and `make record`, every argument is unexported and reaches the script through `$(value ...)`, so a `#`, spaces, or `$(...)` arrive as typed.

## Coordinator decisions

Niki decided the open questions on 2026-10-28:

1. **Routing stops.** After routing, `make review` exits 3 without launching the reviewer (kept).
2. **Prompt and log.** `PROMPT=` and `LOG=` are required and must lie outside the worktree (kept).
3. **No pass line.** `make review` writes no `passes.jsonl` line, because a line with counts 0 is a false record until edited; the worker writes it after the report, as before. The command prints a line template whose count placeholders do not validate; the refusal of a pass that already has a line and the session and model confirmation (exit 4) stay (changed).
4. **Variant.** `REVIEWER` carries the variant, the authorized effort (kept).
5. **Recommendation.** The reviewer that `route.json` recommends is only printed; the effort follows governance policy version 7 (kept).

The allowlists are checked against real CLIs only by this change's own pass 1 (Codex) and pass 2 (Claude Code), run through `make review`; Antigravity and OpenCode stay unverified.

## Risks

- The per-reviewer allowlists were not run against the real CLIs in this change, because tests stub them. A CLI that needs another variable fails its first `make review` run; that attempt is no pass, and the variable is added to its row.
- `make review` cannot stop a reviewer from reading the shell profile; the protocol keeps that rule.
