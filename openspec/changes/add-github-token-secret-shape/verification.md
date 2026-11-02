# Verification: add-github-token-secret-shape

## Scope and source

G3 plan item 20 (`docs/g3-plan.md`, row 20), second change of its split, developed by a briefed subagent for the worker Zaki from `dev` `c355525b` (#421): the GitHub App installation token's shape in the shared `SECRET_SHAPE_RULES` of `@taskelith/observability`, which log redaction and the scrub of `@taskelith/secrets` use, as [source control contract](/docs/contracts/source-control.md) section 3 obliges; tests in both users; that contract sentence; and deltas of `execution-observability` and `scm-port`. Format sources and their quoted text: [design](design.md), "Format evidence", fetched 2026-11-03.

## Revision

- Base: `dev` `c355525b`; the brief's checklist was saved with `--at c355525b1f11e1af151efe0afb9045205056df48 --size S`.
- `ff5af31a` `test: expect GitHub installation tokens to be redacted in logs and secrets` (the tests alone, for the fail-before run).
- `3b84d6a1` `chore: redact GitHub installation tokens in logs and secrets` (the rule, the contract, and the change's proposal, design, deltas, tasks, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `d290fb27` `docs: record the review route of the add github token secret shape change` (`route.json` unedited).
- The commit after it records this verification; it is the head for review pass 1.

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64; Node.js v24.22.1, the `.nvmrc` pin, for `make verify` and the focused runs.

## Author self-check

- Scope: only the brief's items. `git diff c355525b --stat` lists `docs/contracts/source-control.md`, `packages/modules/observability/src/domain/redaction-rules.ts`, `packages/modules/observability/test/logger.test.ts`, `packages/adapters/secrets/test/secrets.test.ts`, and this change. No plugin, Octokit, `PLUGIN_API_VERSION`, `scrubEnvironment` call site, wire, OpenAPI, or migration change.
- Shape (checklist `redaction`): `ghs_[A-Za-z0-9._-]{36,}`, GitHub's recommended pattern for its stateful and stateless installation token formats, with the length and character set justified in design decision 1. Other GitHub token prefixes are not added, because no fetched source documents their length or character set (design decision 2). [GitHub qualification](/docs/qualification/github.md) records no token length (design decision 3).
- Boundaries: as `redactIssuedSecrets` and `redactNkeySeeds`, no word boundary; text glued in front stays and the token is replaced, tested in both users.
- Order: the rule precedes `redactJwts` in `TOKEN_SHAPE_RULES`, so a stateless token is replaced whole; before the rule the JWT rule alone left `ghs_12345_[redacted]` (fail-before below).
- Contract (checklist `contract-drift`): source control contract section 3 now states the shape rule as in place and keeps item 21's `scrubEnvironment` obligation open; the `scm-port` requirement "Run credential secret" says the same. No other document names the item 20 shape obligation as open; `docs/g3-plan.md` row 20 describes the item's scope and stays.
- Secrets in tests: the tokens are built at run time (`` `ghs_${'A1b2'.repeat(9)}` `` and `` `ghs_12345_${JWT}` `` with the tests' existing synthetic JWT), as `test/review-findings.test.ts` builds its `ghp_` value; no real token was printed or committed.
- Requirement texts: `execution-observability` "Logs without secrets" 441 characters, `scm-port` "Run credential secret" 374; each MODIFIED delta copies the living requirement with all its scenarios and adds one.
- Commit types: the published `taskelith` package compiles only `src/` (`tsconfig.json` `rootDir` `src`, `files` `dist/`), and `src/cli.ts` imports no workspace package, so neither private package ships in it; the commits use `test`, `chore`, and `docs`.
- Comments: two new comments of two lines each, under 80 characters; `npm run verify:comments` runs in `make verify`. No AI attribution in commits.

## Fail-before

The tests were committed alone in `ff5af31a`, before the rule. On that commit, after `node --experimental-strip-types scripts/build-workspaces.ts`:

- `node --experimental-strip-types --test packages/modules/observability/test/logger.test.ts packages/adapters/secrets/test/secrets.test.ts`: `tests 36`, `pass 34`, `fail 2`. The failures are "GitHub installation tokens are redacted in fields and correlation, even glued" (actual `'r-ghs_A1b2A1b2A1b2A1b2A1b2A1b2A1b2A1b2A1b2'`, expected `'r-[redacted]'`) and "text loses GitHub installation tokens, stateful or stateless, even glued" (actual `'token ghs_A1b2A1b2A1b2A1b2A1b2A1b2A1b2A1b2A1b2 failed'`, expected `'token [redacted] failed'`). The two near-miss tests and the linear-time tests pass before and after, as they assert text that stays.
- The stateless assertions come after the failing first assertion of each test, so they were checked on the same build with a one-off script calling `redactSecrets` and `redactText` on `` `token ghs_12345_${JWT} failed` ``: both returned `token ghs_12345_[redacted] failed`, not the expected `token [redacted] failed`.

On `3b84d6a1`, the same command after the same build: `tests 36`, `pass 36`, `fail 0`.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `env -u NODE_ENV make verify` | VERIFY_REV | VERIFY_RESULT |
| `npm run openspec -- validate add-github-token-secret-shape --strict` | `3b84d6a1` | `Change 'add-github-token-secret-shape' is valid` |
| Focused runs | `3b84d6a1` | `logger.test.ts` and `secrets.test.ts`: 36 of 36 |

### Route

Route (`route.json`, rule version 5): elevated (security, contracts); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees. Reviews run at effort medium per owner decision, although `route.json` recommends high for passes 1 and 2. Pass 3's recommended reviewer differs from the brief's governance sequence (Codex CLI `gpt-6.1-sol`); the coordinator assigns the reviewers.

<!-- make record: begin -->
<!-- make record: end -->

## Independent review

Not yet run; the coordinator runs the passes. Every pass runs at effort medium per owner decision.

## Limitations

- No live GitHub token was redacted: the tests use synthetic tokens in the documented formats. Both formats come from GitHub's documentation and changelog, not from an observed token.
- The rule replaces a trailing `.`, `-`, or `_` glued to a token with it, such as a sentence's final period (design decision 1).
- Tokens of other SCM services, and GitHub's `ghp_`, `gho_`, `ghu_`, `ghr_`, and `github_pat_` tokens, have no shape rule.

## Remaining gates

- Independent review passes 1 to 3 as governance requires.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request)
