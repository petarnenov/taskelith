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
- Findings: 0 Critical, 4 High, 7 Medium, 11 Low. The High findings: a Usage Policy quote taken from the version effective 2026-11-12 instead of the version in force, with a wrong claim that the earlier version could not be read; and three omitted clauses more direct than those quoted (OpenAI's statement that app-server authentication was never permitted for commercial or hosted services; Anthropic's conditions that each end user authenticate with their own credentials and that customers may not intermediate Claude usage; the non-commercial clause of Anthropic's EEA consumer terms). The Medium findings: an overstated OpenAI written-permission route, omitted clauses (SIWC local-runtime rules, the open-source program, the Usage Policies intermediary clause, Anthropic's OAuth purpose clause, GitHub's meaningless pull requests and reviews and API suspension clauses), and this file missing before the pass. The Low findings concern quote context, source attribution, the records' source sentences, and the D15 row of the plan. - Resolutions: all 22 findings were addressed before pass 2. The Usage Policy quote now comes from the version of 2025-09-15, with the 2026-11-12 addition noted; the omitted Anthropic, OpenAI, and GitHub clauses are quoted with their sections; the OpenAI routes are described as the open-source program without a client ID and the interest form for paid or remotely hosted apps; quote context, attributions, and source sentences were corrected; the D15 row of the plan points to the reviews and to this change's design without deciding; this file was added. The "Consequences for D15" paragraphs and the D15 options were rewritten to follow the corrected findings. Every quote was checked again against the raw copies.
