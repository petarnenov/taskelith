## Scope and source

G3 plan item 2, `review-g3-provider-terms` (`docs/g3-plan.md`, row 2, and D15). On 2026-10-25 the owner authorized items 1 and 2 to start ahead of the G3 start; every other G3 item stays not started. The coordinator assigned it on 2026-10-25 with Claude Code (`claude-fable-5-1`, medium effort) as the reviewer, which has network access, and asked that every quoted clause be checked against its source. Scope: the terms reviews in the Claude Code, Codex, and GitHub qualification records, the D15 row of the G3 plan, and this change with its spec deltas. Excluded: a decision on D15, a legal conclusion, and any change to ADR 0005, ADR 0006, or code.

## Revision and environment

Branch `review-g3-provider-terms` from `origin/dev` at `bb79126`; first reviewed head `fec94ff`. macOS 26.6.2 x86_64, Node.js 24.22.1 through nvm, OpenSpec through `npm run openspec`. Retrieval from Bulgaria on 2026-10-25.

## Author self-check and evidence check

- Research passes retrieved the current terms on 2026-10-25 and saved a raw copy of every quoted page, with SHA-256 hashes, in an evidence directory outside the repository. `openai.com/policies` and `help.openai.com` returned HTTP 403 to automated clients, and `anthropic.com/legal/consumer-terms` served the EEA variant from Bulgaria, so those pages were taken from dated Wayback Machine snapshots, which the records name.
- Every quoted string in the records was checked against the raw copies with whitespace and quotation-mark normalization; the quote in `design.md` ("Unless previously approved") was checked against the Agent SDK overview copy.
- The findings keep what the text says apart from where it is ambiguous, and no legal conclusion is stated as certain.
- `git diff origin/dev...HEAD` touches only Markdown under `docs/` and this change.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate review-g3-provider-terms --strict` | Passed before review |
| `make verify` | Passed before review |

## Review

Pass 1 (Claude Code):
- Invocation: `claude -p "$(cat <prompt-file>)" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`, run from the worktree; the prompt and output were kept outside it. The prompt named `AGENTS.md`, ADR 0004, the governance review process, ADR 0005 to 0007, and the two specifications with their deltas, and asked the reviewer to verify every quoted clause against its live or archived source, with the evidence directory shared read-only.
- Model confirmation: `claude-fable-5-1` is the only model in the JSON `modelUsage`. Session ID `4b88281f-1cd5-4764-b0ba-a463a59b98bc`.
- Snapshot: worktree `57a41a08f7b5bd1f9e7bf51bc7d99e3de800c4d30ae888f9944e84da8997da66` and evidence directory `12342d515e5a5cfb59d226f5c4620fbc3fc7edf5c5ccc13d922b9118b84af03a`, both unchanged after the pass.
- Quotes checked: all 29 GitHub, 27 Anthropic, and 33 OpenAI quotes matched their sources verbatim; dates and snapshots were correct.
- Findings: 0 Critical, 4 High, 7 Medium, 11 Low. The High findings: a Usage Policy quote taken from the version effective 2026-11-12 instead of the version in force, with a wrong claim that the earlier version could not be read; and three omitted clauses more direct than those quoted (OpenAI's statement that app-server authentication was never permitted for commercial or hosted services; Anthropic's conditions that each end user authenticate with their own credentials and that customers may not intermediate Claude usage; the non-commercial clause of Anthropic's EEA consumer terms). The Medium findings: an overstated OpenAI written-permission route, omitted clauses (SIWC local-runtime rules, the open-source program, the Usage Policies intermediary clause, Anthropic's OAuth purpose clause, GitHub's meaningless pull requests and reviews and API suspension clauses), and this file missing before the pass. The Low findings concern quote context, source attribution, the records' source sentences, and the D15 row of the plan.
- Resolutions, at head `44b0d68`, as pass 2 confirmed them:
  1. High, Usage Policy version: the quote comes from the 2025-09-15 version and the 2026-11-12 addition is noted (`claude-code.md:41,54`).
  2. High, app-server authentication never permitted for commercial or hosted services: quoted (`codex.md:66,70,89`).
  3. High, end users' own credentials, no intermediation, enforcement without prior notice: quoted (`claude-code.md:54,61,82`).
  4. High, EEA non-commercial clause: quoted (`claude-code.md:68,71,84`).
  5. Medium, OpenAI routes: the open-source program and the interest form are described (`codex.md:91`, `design.md:27`).
  6. Medium, SIWC section 2 local-runtime rules: quoted (`codex.md:59,66`).
  7. Medium, open-source program: quoted, with source rows (`codex.md:46,68`).
  8. Medium, Usage Policies intermediary clause: quoted, with a source row (`codex.md:45,75`).
  9. Medium, OAuth purpose clause: quoted (`claude-code.md:61`).
  10. Medium, GitHub meaningless pull requests and reviews, API suspension, D.1, J.5: quoted (`github.md:45,59`).
  11. Medium, missing record: this file was added.
  12. to 22. Low: "same substance" wording (`claude-code.md:54`); truncated SIWC bullet completed (`codex.md:59,89`); client-ID page title (`codex.md:68`); "Include environments" source (`codex.md:82`); rate-limit clause context (`codex.md:59`); full E.3 and J.3 (`github.md:73`); Synthetic Media source page (`github.md:66`, sources table); ToS H operative text (`github.md:45`); source sentences (`claude-code.md:5`, `codex.md:5`); AUP ban-circumvention clause (`claude-code.md:54,57`); D15 row of the plan (`docs/g3-plan.md:109`).
  The "Consequences for D15" paragraphs and the D15 options were rewritten to follow the corrected findings, and every quote was checked again against the raw copies.

Pass 2 (Claude Code):
- Invocation as in pass 1, at head `44b0d68`; the prompt named pass 1's session and asked the reviewer to confirm each resolution before reviewing the whole change again, verifying every quote, including those added since `fec94ff`.
- Model confirmation: `claude-fable-5-1` only. Session ID `3c01e97f-9b10-4130-80f6-036a360edcac`.
- Snapshot: worktree `1eb074af2693f53f0245129a3796fc3197902561ba57c27176cb1690a3f3881d` and evidence directory `12342d515e5a5cfb59d226f5c4620fbc3fc7edf5c5ccc13d922b9118b84af03a`, both unchanged after the pass.
- Quotes checked: all 212 quoted strings matched their sources; all 22 pass-1 findings were confirmed resolved.
- Findings: 0 Critical, 0 High, 2 Medium, 11 Low.
  1. Medium: an Anthropic quote stopped before "including where a platform hosts Claude Code"; quoted in full and reflected in the consequences and option (b).
  2. Medium: the `harness-qualification` scenario required the options in the record, while the design keeps them in the change's design; the scenario now allows either.
  3. Low: SIWC "Obtain express consent before background use." quoted.
  4. Low: the Usage Policies version effective 2025-10-29 was read from a snapshot and recorded.
  5. Low: the App Server recommendation to migrate to Sign in with ChatGPT quoted, and the consequence corrected.
  6. Low: the AUP multiple-accounts bullet marked as truncated.
  7. Low: the archival note on the 2025-09-15 AUP page recorded, both dates stated as facts.
  8. Low: GitHub's e-mail warning before API suspension quoted.
  9. Low: a fact moved from "Ambiguous" to "The text says" in the GitHub reviewer identity finding.
  10. Low: the unused "What is the Max plan?" source row resolved.
  11. Low: the SIWC section 4 lead-in "You must not enable or encourage:" quoted.
  12. Low: task 2.1 checked.
  13. Low: resolutions listed per finding in this file.
