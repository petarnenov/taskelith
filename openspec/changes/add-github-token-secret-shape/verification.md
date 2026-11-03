# Verification: add-github-token-secret-shape

## Scope and source

G3 plan item 20 (`docs/g3-plan.md`, row 20), second change of its split, developed by a briefed subagent for the worker Zaki from `dev` `c355525b` (#421): the GitHub App installation token's shape in the shared `SECRET_SHAPE_RULES` of `@taskelith/observability`, which log redaction and the scrub of `@taskelith/secrets` use, as [source control contract](/docs/contracts/source-control.md) section 3 obliges; tests in both users; that contract sentence; and deltas of `execution-observability` and `scm-port`. Format sources and their quoted text: [design](design.md), "Format evidence", fetched 2026-11-03.

## Revision

- Base: `dev` `c355525b`; the brief's checklist was saved with `--at c355525b1f11e1af151efe0afb9045205056df48 --size S`.
- `ff5af31a` `test: expect GitHub installation tokens to be redacted in logs and secrets` (the tests alone, for the fail-before run).
- `3b84d6a1` `chore: redact GitHub installation tokens in logs and secrets` (the rule, the contract, and the change's proposal, design, deltas, tasks, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `d290fb27` `docs: record the review route of the add github token secret shape change` (`route.json` unedited).
- `bd692f5b` `docs: record the verification of the add github token secret shape change`, the tree that `make verify` checked; the commit after it adds the `make record` output and is the head for review pass 1.
- `05e1cc03` `docs: record review pass 1 of the add github token secret shape change`.
- `d5f35cfc` `test: split the GitHub installation token tests and expect a token shape inside a word to stay` (the tests alone, for the fail-before runs of the pass 1 fixes).
- `f377a38f` `chore: take a word boundary before GitHub installation tokens and record the pass 1 fixes`, the tree that the second `make verify` checked; the commit after it adds the `make record` output and is the head for review pass 2.
- `a6a1435e` `test: expect a GitHub installation token inside a word or after an escape to be redacted` (the tests alone, for the fail-before run of the pass 2 fixes).

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64; Node.js v24.22.1, the `.nvmrc` pin, for `make verify` and the focused runs.

## Author self-check

- Scope: only the brief's items. `git diff c355525b --stat` lists `docs/contracts/source-control.md`, `packages/modules/observability/src/domain/redaction-rules.ts`, `packages/modules/observability/test/logger.test.ts`, `packages/adapters/secrets/test/secrets.test.ts`, and this change. No plugin, Octokit, `PLUGIN_API_VERSION`, `scrubEnvironment` call site, wire, OpenAPI, or migration change.
- Shape (checklist `redaction`): `ghs_[A-Za-z0-9._-]{36,}`, GitHub's recommended pattern for its stateful and stateless installation token formats, with the length and character set justified in design decision 1. Other GitHub token prefixes are not added, because no fetched source documents their length or character set (design decision 2). [GitHub qualification](/docs/qualification/github.md) records no token length (design decision 3).
- Boundaries: no boundary before `ghs_` (design decision 1): a token is replaced wherever it starts, after a space or punctuation, inside a longer word, or after a serialized escape such as a literal `\n`, tested in both users. Pass 1's word boundary was reversed by coordinator decision 2026-11-03 (pass 2 below).
- Order: the rule precedes `redactJwts` in `TOKEN_SHAPE_RULES`, so a stateless token is replaced whole; before the rule the JWT rule alone left `ghs_12345_[redacted]` (fail-before below).
- Contract (checklist `contract-drift`): source control contract section 3 now states the shape rule as in place and keeps item 21's `scrubEnvironment` obligation open; the `scm-port` requirement "Run credential secret" says the same. No other document names the item 20 shape obligation as open; `docs/g3-plan.md` row 20 describes the item's scope and stays. [Installation and enrollment contract](/docs/contracts/installation-and-enrollment.md) section 8 and the `installation-enrollment` requirement "Secret scrubbing", which list the shapes `@taskelith/secrets` redacts, now name the token.
- Secrets in tests: the tokens are built at run time (`` `ghs_${'A1b2'.repeat(9)}` `` and `` `ghs_12345_${JWT}` `` with the tests' existing synthetic JWT), as `test/review-findings.test.ts` builds its `ghp_` value; no real token was printed or committed.
- Requirement texts: `execution-observability` "Logs without secrets" 441 characters, `scm-port` "Run credential secret" 374, `installation-enrollment` "Secret scrubbing" 225. Each MODIFIED delta copies the living requirement with all its scenarios; the `execution-observability` delta also edits the scenarios "A secret of a known shape in text" and "Pathological log text" and adds "Near miss of a GitHub installation token", the `scm-port` delta adds "GitHub installation token in text", and the `installation-enrollment` delta changes only the requirement text.
- Commit types: the published `taskelith` package compiles only `src/` (`tsconfig.json` `rootDir` `src`, `files` `dist/`), and `src/cli.ts` imports no workspace package, so neither private package ships in it; the commits use `test`, `chore`, and `docs`.
- Comments: one new two-line comment (the GitHub rule), two one-line comments (the tests' synthetic tokens), and one modified two-line comment (`TOKEN_SHAPE_RULES`), all under 80 characters; `npm run verify:comments` runs in `make verify`. No AI attribution in commits.

## Fail-before

The tests were committed alone in `ff5af31a`, before the rule. On that commit, after `node --experimental-strip-types scripts/build-workspaces.ts`:

- `node --experimental-strip-types --test packages/modules/observability/test/logger.test.ts packages/adapters/secrets/test/secrets.test.ts`: `tests 36`, `pass 34`, `fail 2`. The failures are "GitHub installation tokens are redacted in fields and correlation, even glued" (actual `'r-ghs_A1b2A1b2A1b2A1b2A1b2A1b2A1b2A1b2A1b2'`, expected `'r-[redacted]'`) and "text loses GitHub installation tokens, stateful or stateless, even glued" (actual `'token ghs_A1b2A1b2A1b2A1b2A1b2A1b2A1b2A1b2A1b2 failed'`, expected `'token [redacted] failed'`). The two near-miss tests and the linear-time tests pass before and after, as they assert text that stays.
- The stateless assertions come after the failing first assertion of each test, so they were checked on the same build with a one-off script calling `redactSecrets` and `redactText` on `` `token ghs_12345_${JWT} failed` ``: both returned `token ghs_12345_[redacted] failed`, not the expected `token [redacted] failed`.

On `3b84d6a1`, the same command after the same build: `tests 36`, `pass 36`, `fail 0`.

### Fail-before of the pass 1 fixes

Pass 1 finding 2 found that each positive test stopped at its first failing assertion, so the run above never showed the glued, log field, `redactFailure`, and `scrubEnvironment` behaviors failing. `d5f35cfc` splits the tests into one test per behavior and adds the negative of finding 1, a token shape inside a longer word, in both users. Each run below is `node --experimental-strip-types --test packages/modules/observability/test/logger.test.ts packages/adapters/secrets/test/secrets.test.ts` after `node --experimental-strip-types scripts/build-workspaces.ts`.

- Tests of `d5f35cfc` with the rule file of the base `c355525b` (`git show c355525b:packages/modules/observability/src/domain/redaction-rules.ts` over the file, restored afterwards): `tests 44`, `pass 36`, `fail 8`, each positive test failing on its own:
  - "text loses a stateful GitHub installation token": actual `'token ghs_A1b2…A1b2 failed'`, expected `'token [redacted] failed'`.
  - "text loses a GitHub installation token glued after punctuation": actual `'r-ghs_A1b2…A1b2'`, expected `'r-[redacted]'`.
  - "text loses a stateless GitHub installation token whole": actual `'token ghs_12345_[redacted] failed'`, expected `'token [redacted] failed'`.
  - "a failure loses GitHub installation tokens in its message and details": actual `[ 'bad ghs_12345_[redacted]', { presented: 'ghs_A1b2…A1b2' } ]`, expected `[ 'bad [redacted]', { presented: '[redacted]' } ]`.
  - "an environment loses a variable that holds a GitHub installation token": actual `{ GIT_HINT: 'use ghs_A1b2…A1b2', KEEP: 'k' }`, expected `{ KEEP: 'k' }`.
  - "a GitHub installation token glued after punctuation is redacted in correlation": actual `'r-ghs_A1b2…A1b2'`, expected `'r-[redacted]'`.
  - "a stateful GitHub installation token is redacted in a field": actual `'push (ghs_A1b2…A1b2) failed'`, expected `'push ([redacted]) failed'`.
  - "a stateless GitHub installation token is redacted whole in a field": actual `'push ghs_12345_[redacted] failed'`, expected `'push [redacted] failed'`.
- Tests of `d5f35cfc` with the rule of pass 1's head `b7935aeb`, no boundary: `tests 44`, `pass 42`, `fail 2`, both "a GitHub installation token shape inside a longer word stays" (actual `'keep prefix[redacted] here'`, expected `'keep prefixghs_A1b2…A1b2suffix here'`).
- Tests of `d5f35cfc` with the fixed rule: `tests 44`, `pass 44`, `fail 0`.

### Fail-before of the pass 2 fixes

Pass 2 finding 1 found that the word boundary leaves a token after a serialized escape unredacted; by coordinator decision 2026-11-03 the boundary is dropped and a token inside a longer word is redacted too. `a6a1435e` replaces the inside-a-word negative of both users with one positive test per case, after the words `prefix`, `my_`, and `v2` and after the escapes `\n`, `\t`, `\r`, and `\"` (literal backslash sequences). Same build and command as above, with `--test-reporter=tap`:

- Tests of `a6a1435e` with the rule of `f377a38f`, `/\bghs_[A-Za-z0-9._-]{36,}/g`: `tests 56`, `pass 44`, `fail 12`, each of these six tests failing in both users: "a GitHub installation token after the word prefix is redacted" (actual `'keep prefixghs_A1b2…A1b2 here'`, expected `'keep prefix[redacted] here'`), "… after the word my_ …" (actual `'keep my_ghs_A1b2…A1b2 here'`), "… after the word v2 …" (actual `'keep v2ghs_A1b2…A1b2 here'`), "… after the escape \\n …" (actual `'line\\nghs_A1b2…A1b2'`, expected `'line\\n[redacted]'`), "… after the escape \\t …" and "… after the escape \\r …" alike. The `\"` case passes before and after, because `"` is no word character; it guards the escape form that already worked.
- Tests of `a6a1435e` with the fixed rule, `/ghs_[A-Za-z0-9._-]{36,}/g`: `tests 56`, `pass 56`, `fail 0`.

The synthetic token `ghs_` and nine times `A1b2` is shortened to `ghs_A1b2…A1b2` above.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `env -u NODE_ENV make verify` | `bd692f5b`, tree `f2a68fb7` | Passed, profile full, stamp written: tests 4136, suites 49, pass 4089, fail 0, cancelled 0, skipped 47; all files 99.36 % lines, 92.68 % branches, 98.84 % functions; `redaction-rules.js` and `scrub.js` 100 % each |
| `env -u NODE_ENV make verify` | `f377a38f`, tree `3cffe9d0` | First run failed one test outside this change, `test/installation-script.test.ts` "a bound with a leading zero is read in base 10" (`ended after 9.049s, before 10`), a timing bound; the rerun on the same tree passed, profile full, stamp written: tests 4144, suites 49, pass 4097, fail 0, cancelled 0, skipped 47; all files 99.36 % lines, 92.67 % branches, 98.84 % functions; `redaction-rules.js` and `scrub.js` 100 % each |
| `env -u NODE_ENV make verify` | `d9781452`, tree `fa08ab86` | First run failed one timing-bound test, `packages/adapters/secrets/test/secrets.test.ts` "value redaction takes linear time on long runs" (`"a b" repeated took 206 ms`, limit 200 ms) at host load average 5 to 6; that run's exact-value path does not reach the GitHub rule, and ten timed runs of it on this host took 61 to 112 ms with the rule of the base `c355525b` and 64 to 110 ms with the fixed rule. The rerun on the same tree passed, profile full, stamp written: tests 4156, suites 49, pass 4109, fail 0, cancelled 0, skipped 47; all files 99.36 % lines, 92.68 % branches, 98.84 % functions; `redaction-rules.js` and `scrub.js` 100 % each |
| `npm run openspec -- validate add-github-token-secret-shape --strict` | `3b84d6a1` | `Change 'add-github-token-secret-shape' is valid` |
| Focused runs | `3b84d6a1` | `logger.test.ts` and `secrets.test.ts`: 36 of 36 |

### Route

Route (`route.json`, rule version 5): elevated (security, contracts); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees. Reviews run at effort medium per owner decision, although `route.json` recommends high for passes 1 and 2. Pass 3's recommended reviewer is the one governance "Reviewer assignment" names for pass 3, Antigravity CLI `gemini-4-argon-medium`; the coordinator assigns the reviewers.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `fa08ab86ca499099793b5a813df2105a2a0095cc`; tests 4156, pass 4109, fail 0, skipped 47; all files 99.36% lines, 92.68% branches, 98.84% functions.
- `npm run openspec -- validate add-github-token-secret-shape --strict`: passed, `Change 'add-github-token-secret-shape' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 98 file(s); every pass summary file is valid: 78 file(s); every route file is valid: 31 file(s).`.
- Spec diff against the merge base `c355525b1f11` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a19eb6-b681-7e70-998b-c4458edb89e9` | 0 | 0 | 2 | 2 |
| 2 | B | `claude claude-fable-5-1#medium` | `ec7c975e-4e00-4f2d-a09a-dbe4b0df161c` | 0 | 0 | 1 | 4 |
<!-- make record: end -->

## Independent review

Every pass runs at effort medium per owner decision.

### Pass 1

- Reviewer: Codex CLI `gpt-6-astra`, role A, through `make review`, at head `b7935aeb` against `c355525b`; session `01a19eb6-b681-7e70-998b-c4458edb89e9`; model `gpt-6-astra`, effort `medium`, and sandbox `read-only`, each reported in the header.
- Result: Critical 0, High 0, Medium 2, Low 2, recorded in `passes.jsonl` and `findings.jsonl`.
- Finding 1 (Medium, `redaction`): the brief's near-miss negative for a token shape embedded in a longer word was a match. Fixed at first with a word boundary before `ghs_`; reversed after pass 2 by coordinator decision 2026-11-03 (pass 2 finding 1), so its outcome is `declined`.
- Finding 2 (Medium, `missing-fail-before-test`): the fail-before run did not show every positive behavior failing. Fixed: one test per behavior and the fail-before runs above.
- Finding 3 (Low, `stale-citation`): the route section called the pass 3 reviewer of `route.json` a departure from governance. Fixed in the route section.
- Finding 4 (Low, `evidence-mismatch`): E1 and E4 linked raw `main` and the other pages had no unversioned label. Fixed: E1 and E4 link their pinned commit, checked to serve both files (HTTP 200), and E1's rendered page, E2, E3, and E5 are labelled unversioned.

### Pass 2

- Reviewer: Claude Code `claude-fable-5-1`, role B, at effort `medium`, at head `15064783` against `c355525b`; session `ec7c975e-4e00-4f2d-a09a-dbe4b0df161c`.
- Result: Critical 0, High 0, Medium 1, Low 4, recorded in `passes.jsonl` and `findings.jsonl`. It confirmed the fixes of pass 1 findings 2 to 4 (outcome `fixed`).
- Finding 1 (Medium, `redaction`): the word boundary left a token after a serialized escape such as a literal `\n` unredacted. Fixed by coordinator decision 2026-11-03, which replaced the reviewer's escape lookbehind: when a boundary and redaction conflict, redact, because a missed secret is worse than an over-redacted word. The rule takes no left boundary, which reverses the pass 1 fix; positive tests for a token inside a word and after each escape in both users (fail-before above); design decision 1 and its risks, the proposal, the `execution-observability` and `scm-port` deltas, and contract section 3 say so. The negatives for a wrong prefix and a too-short token stay.
- Finding 2 (Low, `contract-drift`): two lists of the shapes `@taskelith/secrets` redacts lacked the token. Fixed: installation and enrollment contract section 8 and a MODIFIED `installation-enrollment` delta of "Secret scrubbing" name it.
- Finding 3 (Low, `docs`): this record misdescribed the edited scenarios and the comments. Fixed in the author self-check.
- Finding 4 (Low, `naming`): the secrets tests interpolated a string literal and duplicated the JWT literal. Fixed: a module-level `JWT` constant serves both tests.
- Finding 5 (Low, `docs`): the group comment "Shapes without word boundaries" no longer fit the GitHub rule. Fixed by dropping the boundary; the rule's comment no longer says "not inside a word".
- These fixes are unreviewed until pass 3, the coordinator's architect check covers any it does not review.

## Limitations

- An identifier that holds `ghs_` and 36 more token characters is redacted even inside a longer word, although it may be no token (design, "Risks").
- No live GitHub token was redacted: the tests use synthetic tokens in the documented formats. Both formats come from GitHub's documentation and changelog, not from an observed token.
- The rule replaces a trailing `.`, `-`, or `_` glued to a token with it, such as a sentence's final period (design decision 1).
- Tokens of other SCM services, and GitHub's `ghp_`, `gho_`, `ghu_`, `ghr_`, and `github_pat_` tokens, have no shape rule.

## Remaining gates

- Independent review passes 1 to 3 as governance requires.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request)
