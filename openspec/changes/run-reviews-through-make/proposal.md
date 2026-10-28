## Why

Two steps that start every review depend on a model typing them right: routing the change before pass 1, and starting the reviewer without the shadow router's credential. A reviewer invocation is typed from the protocol's table each time, with `env -u JEV_MAF_LAB` in front; a missed prefix or flag, or a new secret in the caller's environment, reaches the reviewer, and a skipped route goes unnoticed until the record is checked. The owner approved on 2026-10-28 one command that makes both steps deterministic.

## What Changes

- **`make review`.** A new target, `make review CHANGE=<change> PASS=<1-9> ROLE=<A|B> REVIEWER=<reviewer key> PROMPT=<prompt file> LOG=<log file>`, backed by `scripts/review-run.ts`. The prompt and the log must lie outside the worktree.
- **Route gate.** Before pass 1, when `route.json` is missing or was made for another tree, the command routes the change as `make findings ARGS="route"` does, but only when the clean tree carries a passing `make verify` stamp; it then stops so that the worker commits `route.json` and verifies and records again. Without the stamp it refuses. Later passes never route.
- **Clean environment.** The reviewer runs with an empty environment plus `PATH`, `HOME`, `USER`, `LANG`, `TERM`, `TMPDIR`, and the variables its CLI needs, declared per reviewer. This replaces the `env -u JEV_MAF_LAB` prefix.
- **Fixed invocation.** `scripts/reviewer-invocations.ts` holds each authorized reviewer's command, keyed by the canonical reviewer key, with the mandatory flags of the protocol's former table and the effort of governance "Authorized reviewers" (policy version 7); the effort that `route.json` recommends is printed, not applied.
- **Record.** After a run that reports a session ID and the expected model, the command appends the pass line to `passes.jsonl` with counts 0; findings stay a manual step.
- **Docs.** `docs/agent-task-protocol.md` "Reviewer invocations" and worker step 5, and the skills `taskelith-task-protocol` and `taskelith-worker`, say to run `make review`; the invocation table moves to the script.

Out of scope: moving the Jev key; a `make record-check` or `make integrate` gate that rejects passes not run through `make review`; parsing review findings.

## Capabilities

### New Capabilities

### Modified Capabilities

- `review-process`: adds "Review command", "Review route gate", and "Reviewer environment".

## Impact

Private repository tooling and documents only: the `Makefile`, the new `scripts/review-run.ts` and `scripts/reviewer-invocations.ts`, their tests, the agent task protocol, and two skills. No published package, API, or product contract changes. The reviewers of this change still run the old way, with `env -u JEV_MAF_LAB`, because the change builds the tool.
