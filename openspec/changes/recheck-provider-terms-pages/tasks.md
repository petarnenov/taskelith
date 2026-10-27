## 1. Recheck and record

- [x] 1.1 Verify at `4cbea974` the lines that the deferred findings and the coordinator's brief cite in `docs/qualification/claude-code.md` and `docs/qualification/codex.md`.
- [x] 1.2 Fetch the live Usage Policy, its Sep 15, 2025 archive page, Legal and compliance, Agent SDK overview, and Codex App Server pages, and the Wayback snapshots that the record cites, with UTC times, and check every added quote against them.
- [x] 1.3 Add the omitted passages to `docs/qualification/claude-code.md` (pass 1 H1, H2, L1; pass 2 M2, M3, L1), say that the 2026-10-25 review omitted them, and state the open question for the owner without a recommendation.
- [x] 1.4 Remove the provider terms from the open items of the `docs/qualification/codex.md` status line (pass 2 L2).
- [x] 1.5 Record the declined pass 1 H3 with its evidence in `verification.md`.

## 2. Verification and review

- [x] 2.1 Run `make verify`, strict validation of this change, and `make findings ARGS="validate"`.
- [ ] 2.2 Review pass 1 by reviewer A (Claude Code `claude-fable-5-1`), recorded in `verification.md`, `passes.jsonl`, and `findings.jsonl`.
- [ ] 2.3 Review pass 2 by reviewer B (Claude Code `claude-opus-5-5`, effort `high`) unless pass 1 is Low-only.
- [ ] 2.4 Review pass 3 by reviewer A, if pass 2 leaves fixes to confirm.
- [ ] 2.5 Archive the change in the last commit of the branch.
