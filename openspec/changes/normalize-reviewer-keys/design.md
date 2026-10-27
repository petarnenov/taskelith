## Context

The review records name a reviewer by `harness`, `model`, and an optional `variant`; `reviewerKey` in `scripts/review-findings.ts` prints them as `<harness> <model>[#<variant>]`, and `index` and `reviewers` group by that key. A scan of every archived `findings.jsonl` and `passes.jsonl` (no active change had records) found these reviewers:

| Spelling | Findings | Pass summaries | Canonical |
| --- | --- | --- | --- |
| `claude claude-fable-5-1#medium` | 84 | 11 | yes |
| `claude claude-opus-5-5#high` | 136 | 9 | yes |
| `claude-code claude-opus-5-5#high` | 10 | 1 | no: harness |
| `codex gpt-6-astra#medium` | 29 | 9 | yes |
| `codex gpt-6.1-sol#medium` | 79 | 20 | yes |
| `opencode kimi-k2.7-code#default` | 1 | 1 | no: provider prefix |
| `opencode opencode-go/deepseek-v4-pro#high` | 18 | 4 | yes |
| `opencode opencode-go/kimi-k2.7-code#default` | 11 | 0 | yes |
| `opencode opencode-go/kimi-k2.7-code` | 0 | 1 | no: variant |
| `opencode opencode-go/kimi-k3.1-pro#high` | 23 | 6 | yes |
| `opencode opencode-go/qwen3.8-max#medium` | 9 | 0 | yes |

The three legacy spellings come from two archived changes: `2026-10-27-record-placement-outcome` (`claude-code`, `kimi-k2.7-code` without its provider) and `2026-10-27-revalidate-g3-foundations` (`opencode-go/kimi-k2.7-code` without a variant). No record uses Antigravity.

## Goals and non-goals

- Goal: one canonical key, enforced for active changes, and one row per reviewer in `reviewers` and `index`.
- Goal: record the owner's reviewer assignment of 2026-10-27 once, in governance, and make every other text agree with it.
- Non-goal: rewriting archived records, changing the schema's validation, or changing `checklist`'s output.

## Decisions

### D1. The rule and the aliases live in one module

`scripts/reviewer-keys.ts` holds `CANONICAL_HARNESSES`, `LEGACY_REVIEWER_ALIASES`, `canonicalReviewer`, `withCanonicalReviewer`, and `reviewerKeyProblems`. It is pure, like `review-findings.ts` and `review-passes.ts`; file access stays in `scripts/findings.ts`. The alias table is keyed by the legacy spelling as `reviewerKey` prints it, so an alias names exactly one recorded spelling and a reader can grep the records for it.

### D2. The rule is checked in the script, not in the schema

The schema validates archived records too, and one archived pass summary has no `variant`. Making `variant` required or restricting `harness` in the schema would fail them. The rule therefore runs in `checkChange` of `scripts/findings.ts` for active changes only, over the lines that passed the schema and the other line rules, like the capability rule of active findings. The schema's descriptions name the canonical key and say that the script checks it in active changes.

### D3. What "as the harness CLI takes it" checks

The script can check the provider prefix, not a model list: an `opencode` model must contain `/` (OpenCode takes `<provider>/<model>`), and a model of any other harness must not. A list of known models would need an update for every new reviewer and is not requested.

### D4. Messages

Each broken rule is one problem on the line, so a line can have several:

- `reviewer "<key>" is not canonical: harness "<harness>" is none of claude, codex, opencode, agy`
- `reviewer "<key>" is not canonical: an OpenCode model names its provider as its CLI takes it, for example opencode-go/<model>`
- `reviewer "<key>" is not canonical: only an OpenCode model has a provider prefix; name the model as the <harness> CLI takes it`
- `reviewer "<key>" is not canonical: variant is missing; record the effort, "default" when the harness default ran`

`formatProblem` prefixes `<file>:<line>: `. The key's parts are schema-bounded identifiers and model ids, and `checkedValue` has already rejected secret-like values, so echoing them leaks nothing.

### D5. The reports read archived records through the aliases

`commandOutput` maps every archived change's findings and pass summaries through `withCanonicalReviewer` before `reviewers`, `index`, and `checklist`. The consistency check of a change still compares the recorded spellings, which agree within each archived change. `checklist` prints only categories and titles, so its output does not change.

### D6. Reviewer assignment and rotation

The owner's table goes under "Two alternating reviewers per task" in `docs/governance.md`, as "Reviewer assignment", with the statistics it rests on as `make findings ARGS="reviewers"` printed them on 2026-10-27, misses per pass computed as misses divided by passes of the reviewer. Reconciliation:

- New tasks take reviewers from the table, not the turn; "Rotation" now orders only replacements, starting after the replaced reviewer, and skips a reviewer that the table bars from the role.
- The table names Claude Code (claude-fable-5-1) for tasks that need network access "because Codex has no network access", which concerns role A; B stays Claude Code (claude-opus-5-5), which has network access. That pair shares a harness, so "Authorized alternating reviewers" and governance allow one harness when the assignment pairs it.
- OpenCode reviewers are never A, also not as replacements, and B only of documentation-only tasks.
- Coordinator decisions (Niki, 2026-10-27) on these readings: for a task that needs network access, Claude Code (claude-fable-5-1) is reviewer A, passes 1 and 3, and Claude Code (claude-opus-5-5), effort `high`, stays reviewer B, the same harness being allowed by this assignment and named in `verification.md`; the turn orders only the replacements under "Unavailable reviewer", starting after the replaced reviewer and skipping reviewers that the table bars from that role; the statistics are given as measured, over all archived passes of each reviewer, not pass 1 only, naming only OpenCode CLI (deepseek-v4-pro) and OpenCode CLI (kimi-k3.1-pro) for the 1.7 and 1.9 misses per pass; and the spec scope below is accepted.
- The spec delta adds "Reviewer assignment", modifies "Rotation order" (its scenarios "Reviewers of a new change" and "Reviewer after a replacement" described the turn for new tasks and are replaced), and modifies "Authorized alternating reviewers".

## Review checklist

From `make findings ARGS="checklist --files scripts/**"`:

1. contract-drift (11), for example "The missedBy order diagnostic omitted the finding's artifact, although the protocol says messages name it": the spec delta, the protocol's "Validation" and "Legacy reviewer keys" bullets, the schema descriptions, and D4 state the same rule and messages as the code and its tests.
2. error-handling (6): a non-canonical key fails `validate` with exit 1 and a problem per broken rule; a key unknown to the alias table is counted under its own spelling, not dropped.
3. redaction (4): messages echo only schema-checked values after the secret-like check (D4).
4. naming (2), for example "Pass summaries were parsed from a type named for findings...": one term, "reviewer key", throughout; `ReviewerLine.record` holds a finding or a pass summary, and the alias table is named for what it maps.
5. evidence-mismatch (1): `verification.md` records commands and output as run.

Record quality: evidence-mismatch (50), docs (41), spec-wording (23), stale-citation (21), process (9), contract-drift (7), scope (5). The proposal and `verification.md` state which command outputs change (`validate`, `index`, `reviewers`) and which do not (`checklist`), every count is copied from a run, and the scope stays the brief's.

## Risks and limits

- A future legacy spelling in an archived change could only come from a change archived without validation, which `make verify` prevents; if one appears, it gets its own alias and test.
- The rule cannot tell a wrong model id from a right one beyond the provider prefix (D3).
