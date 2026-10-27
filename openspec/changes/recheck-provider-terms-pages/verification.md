## Scope and source

Follow-up of G3 item 0, `revalidate-g3-foundations`, for its item 2 (the provider terms record of G3 item 2, `review-g3-provider-terms`), size S, documentation only, assigned by the coordinator (Niki) on 2026-10-27. The deferred findings are lines of the archived [`findings.jsonl`](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/findings.jsonl) with artifact `item-2`, and rows of its [verification](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md#item-2):

| Finding | Severity | Cited line at `4cbea974` | Line checked at `4cbea974` |
| --- | --- | --- | --- |
| Pass 1 H1: the Usage Policy clause on services that route requests through consumer subscriptions was omitted | High | `docs/qualification/claude-code.md:54` | The heading "Account sharing and pooled subscriptions (ADR 0005)"; line 58 said "no clause found names pooling or load balancing" |
| Pass 1 H2: the Agent SDK overview says the SDK is governed by the Commercial Terms | Medium (labelled H2) | `docs/qualification/claude-code.md:70` | The quotes of "Which terms govern" |
| Pass 1 L1: the legal page sentence on customers provisioning their own API keys | Low | `docs/qualification/claude-code.md:61` | The heading "Credential storage and intermediation by a third-party product" |
| Pass 2 M2: the broadened Usage Policy clause against bypassing restrictions, including the account sign-up or log-in process | Medium | `docs/qualification/claude-code.md:56`; the brief adds 59, 86, 88 | 56: the account sharing quotes; 59: its "Ambiguous" bullet, with rotation on cooldown; 86 and 88: the two paragraphs of "Consequences for D15" |
| Pass 2 M3: the hosting carve-out conditions are not quoted | Medium | `docs/qualification/claude-code.md:63`; the brief adds 56, 63 to 66, 88 | 56: the "Can customers offer Claude Code in their products?" quotes; 63: the credential quotes with the carve-out; 64: blank; 65 and 66: its bullets; 88: case (i) of the consequences |
| Pass 2 L1: sign-in must complete through Anthropic's own flow | Low | `docs/qualification/claude-code.md:63` | The credential quotes |
| Pass 2 L2: the Codex status line lists the provider terms as open | Low | `docs/qualification/codex.md:3` | "Linux capability scenarios, macOS arm64, provider terms, repeated runs, and independent adoption evidence remain open" |
| Pass 1 H3: the Codex App Server page no longer carries the quoted statement | High, declined in item 0 | `docs/qualification/codex.md:92` | Declined again below; not changed |

The brief names the declined finding "pass 2 H3"; the archived record files it as pass 1 H3, declined through pass 2 H1, and this record uses that name. Exclusions: any conclusion or recommendation on D15 or ADR 0005 decision 2, which are pending for the owner, any edit to `docs/g3-plan.md` or ADR 0005, the OpenAI and GitHub quotes beyond the App Server check, and the Consumer Terms and support pages, which were not re-read.

## Revision and environment

Branch `recheck-provider-terms-pages` from `origin/dev` at `4cbea974`, in its own worktree with `make setup` done. Ubuntu 26.04.1 LTS on Linux x86_64, Node.js v24.22.1, OpenSpec through `npm run openspec`. Pages fetched with `curl` (`-sSL --compressed`, a desktop browser user agent) on 2026-10-27 between 19:03 and 19:10 UTC; every time below is UTC. The raw copies were kept in the session's scratch directory, outside the repository, and are not part of the evidence set.

## Author self-check and evidence check

- Each added quote was checked as a substring of the fetched page text after removing tags, decoding entities, mapping U+2019 to an ASCII apostrophe, and collapsing whitespace (design D1), on the live page and on every Wayback snapshot that the record cites for it; all were present. The Sep 15, 2025 archive page of the Usage Policy was checked for the absence of "consumer subscriptions", "route requests", "sign-up", and "log-in": none occurs.
- The Agent SDK sentence was also checked against the page's Markdown export (`https://code.claude.com/docs/en/agent-sdk/overview.md`, 19:03:58), and the legal page passages against `https://code.claude.com/docs/en/legal-and-compliance.md` (19:03:59); all matched.
- The added text states facts, "text says" summaries, and ambiguities; the only statement on D15 and ADR 0005 decision 2 is the open question for the owner, without a recommendation.
- External links added to the record are dated Wayback snapshots or pages already in its source table, which labels them unversioned with their access dates; repository links are relative within `docs/`, and this change's records link only inside the change directory or root-relative. `npm run verify:links`, part of `make verify`, checks them.
- `git diff 4cbea974 -- docs` touches only the two qualification records.

## Quoted passages

| Passage (exact quote) | Source and retrieval (UTC) | Placed in `docs/qualification/claude-code.md` |
| --- | --- | --- |
| "Resell, proxy, or otherwise provide access to Claude through unauthorized means, including services that route requests through consumer subscriptions or misrepresent the product or client being used" (pass 1 H1) | Live [Usage Policy](https://www.anthropic.com/legal/aup), "Effective Nov 12, 2026", 2026-10-27T19:10:03Z; Wayback [20261020080942](https://web.archive.org/web/20261020080942/https://www.anthropic.com/legal/aup) (19:10:05Z), [20261024120451](https://web.archive.org/web/20261024120451/https://www.anthropic.com/legal/aup) (19:10:06Z), [20261026081456](https://web.archive.org/web/20261026081456/https://www.anthropic.com/legal/aup) (19:10:08Z) | Line 58 in full; parts at 60, 61, 88, 92 |
| "Intentionally bypass or interfere with capabilities, restrictions, or guardrails established within our products, including by circumvention of the account sign-up or log-in process or by instructing the model to produce harmful outputs (e.g., jailbreaking or prompt injection), without prior authorization from Anthropic" (pass 2 M2) | The same live page and three snapshots | Line 58 in full; parts at 60, 61, 88, 92 |
| "Do Not Abuse Our Platform" (section heading of both clauses) | The same live page | Line 58 |
| "Intentionally bypass capabilities, restrictions, or guardrails established within our products for the purposes of instructing the model to produce harmful outputs (e.g., jailbreaking or prompt injection) without prior authorization from Anthropic" (the Sep 15, 2025 clause, for comparison) | [Usage Policy archive page](https://www.anthropic.com/legal/archive/22742366-2ef0-4c7a-a833-6523f10d3944), Sep 15, 2025, 2026-10-27T19:10:04Z | Line 47 |
| "The Claude Code binary must not be modified. Claude Code must be installed and run as published by Anthropic, and customers may not remove, disable, or restrict any authentication method built into it (including methods that permit signing in with a Claude account or the user's own API key)" (pass 2 M3) | Live [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), "Can customers offer Claude Code in their products?", 2026-10-27T19:10:05Z; Wayback [20261020141144](https://web.archive.org/web/20261020141144/https://code.claude.com/docs/en/legal-and-compliance) (19:10:09Z), [20261024042054](https://web.archive.org/web/20261024042054/https://code.claude.com/docs/en/legal-and-compliance) (19:10:11Z) | Line 58 in full, line 90 in two parts; parts at 60, 67, 68 |
| "That usage is billed directly to the end user under their own agreement with Anthropic or, for third-party inference providers, with the applicable provider" (pass 2 M3) | The same live page and two snapshots | Line 58; "billed directly to the end user" at 60, 67, 68, 90, 92 |
| "sign-in to a Claude account must complete through Anthropic's own flow" (pass 2 L1), the end of the sentence that begins "Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens" | The same live page, "Authentication and credential use", and two snapshots | Line 65; parts at 68 and 92, restated without quotes at 67 |
| "This does not restrict how customers provision and manage their own API keys or third-party inference provider credentials — for example, configuring an API key in a development environment, secrets manager, or machine image for use by the customer's own authorized users — provided the resulting usage is billed to the key owner under their agreement with Anthropic (or the applicable provider) and is not resold or intermediated as described above" (pass 1 L1) | The same live page and two snapshots | Line 65; summarized at 67 |
| "Use of the Claude Agent SDK is governed by Anthropic's Commercial Terms of Service, including when you use it to power products and services that you make available to your own customers and end users, except to the extent a specific component or dependency is covered by a different license as indicated in that component's LICENSE file." (pass 1 H2) | Live [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), "License and terms", 2026-10-27T19:10:05Z; Wayback [20261020141633](https://web.archive.org/web/20261020141633/https://code.claude.com/docs/en/agent-sdk/overview) (19:10:13Z), [20261024042705](https://web.archive.org/web/20261024042705/https://code.claude.com/docs/en/agent-sdk/overview) (19:10:15Z) | Line 72; summarized at 76, 77 |
| "Subscription authentication only", "API-key billing is not used" | [ADR 0005](/docs/decisions/0005-harness-subscription-account-pools.md) decision 2, in the repository | Line 92 |

Line numbers are those of the working tree of this change. Shorter quotes in the bullets, such as "the user's own API key", "restrict any authentication method built into it", "through unauthorized means", and "for Free, Pro, and Max users", are substrings of the passages above or of quotes already in the record, checked the same way. The rendered Claude Code docs use typographic apostrophes, which the record writes as ASCII (design D1).

## Declined: pass 1 H3

Pass 1 H3 said that the Codex App Server page no longer carries the authentication statement that `docs/qualification/codex.md` quotes at lines 69 and 92. It is false. The live page, [learn.chatgpt.com/docs/app-server](https://learn.chatgpt.com/docs/app-server), fetched at 2026-10-27T19:10:05Z with HTTP 200 (the earlier address `developers.openai.com/codex/app-server` redirects there, checked at 19:03:50Z), carries both sentences word for word:

- "App-server authentication has never been permitted for commercial or hosted services. We launched Sign in with ChatGPT to support these use cases, and we're excited to see what you build." The record quotes it up to "these use cases".
- "If you've built a local or open-source application using Codex app-server authentication, you can continue using it, though we recommend migrating to Sign in with ChatGPT so users have greater control over and visibility into their usage."

The Wayback snapshot [20261024043009](https://web.archive.org/web/20261024043009/https://learn.chatgpt.com/docs/app-server), fetched at 19:10:18Z, carries both as well. The page renders typographic apostrophes. No change to `codex.md` follows from it.

## OpenAI pages

`https://openai.com/policies/terms-of-use/` answered HTTP 403 at 2026-10-27T19:10:19Z, and the SIWC Terms and the Help article "Using Codex with your ChatGPT plan" answered 403 at 19:06:26Z, so the Codex record keeps its Wayback snapshots; this change quotes no OpenAI page beyond the App Server check above.

## Commands

- `git show 4cbea974:docs/qualification/claude-code.md | sed -n '54p;56p;59p;61p;63,66p;70p;86p;88p'` and `git show 4cbea974:docs/qualification/codex.md | sed -n 3p`: the cited lines.
- `curl -sSL --compressed -A "<browser user agent>" -o <file> -w "%{http_code}" <url>` per source, with `date -u +%FT%TZ` before each request.
- `curl -sS "https://web.archive.org/cdx/search/cdx?url=<page>&from=20261015&to=20261027"`: the snapshot lists; none of the three Anthropic pages has a snapshot dated 2026-10-25.
- A Python check (`python3 -I`) of each quote as a substring of each fetched page, normalized as above.
- `make findings ARGS="checklist --capability harness-qualification,harness-account-pools --files docs/qualification/claude-code.md,docs/qualification/codex.md"`: the output is in [design](design.md#review-checklist).

## Checks

Run on 2026-10-27 on the working tree of this branch's two commits, before these results were written into the table; that was the only later edit.

| Check | Result |
| --- | --- |
| `npm run openspec -- validate recheck-provider-terms-pages --strict` | Passed: "Change 'recheck-provider-terms-pages' is valid", with the note that `skip_specs` accepts zero deltas |
| `make findings ARGS="validate"` | Passed: 40 findings files and 20 pass summary files valid |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | Passed (exit 0), including `verify:links` ("Every checked link conforms.") and `verify:archive` |

## Review

Not yet reviewed. `passes.jsonl` and `findings.jsonl` are empty.

## Open question for the owner

The owner decided D15 (a) on 2026-10-25 from a review that omitted the passages above, although they were on the pages then. Open question for the owner, recorded in `docs/qualification/claude-code.md` line 92 without a recommendation: whether D15 (a) and ADR 0005 decision 2 stand with these passages. This change does not answer it.

## Limitations

- The Consumer Terms, Commercial Terms, Data usage, Authentication, and support pages were not re-read; their quotes stay as of 2026-10-25.
- The Wayback Machine has no snapshot of the three Anthropic pages dated 2026-10-25, so "on the page at the review" rests on the snapshots of 2026-10-24 and, for the Usage Policy, 2026-10-26.
- The raw page copies are outside the repository and were not shared with a reviewer; the reviewers re-read the pages themselves.

## Remaining gates

- Review pass 1 by reviewer A (Claude Code claude-fable-5-1)
- pass 2 by reviewer B (Claude Code claude-opus-5-5, effort high) unless pass 1 is Low-only
- pass 3 by reviewer A
- Archive
- Integration into dev by the coordinator (single pull request)

The coordinator assigned two Claude Code reviewers, of the same harness with different models, because the task needs network access to re-read the provider pages and Codex has none ([External facts](/docs/governance.md#independent-review-process)).
