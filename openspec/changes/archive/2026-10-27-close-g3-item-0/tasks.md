## 1. Change

- [x] 1.1 Create the change `close-g3-item-0` (documentation only, `skip_specs`), with empty `findings.jsonl` and `passes.jsonl`

## 2. Records

- [x] 2.1 Check each pull request of item 0 on `dev` and its archived change
- [x] 2.2 Mark item 0 done in `docs/g3-plan.md` and add the section "Item 0 closure" with its changes
- [x] 2.3 Resolve the plan's hosted-runner row by `record-hosted-runner-linux-acceptance` (#367)
- [x] 2.4 List the delegate decisions with their source records as confirmed by the owner (coordinator message of 2026-10-27)
- [x] 2.5 Record item 0 as done and wave 1 as next in `docs/foundation.md`
- [x] 2.6 Run the checks without Docker and record `verification.md`
- [x] 2.7 Add the review checklist output to `design.md` and save `checklist.json`
- [x] 2.8 Merge `origin/dev` at `579c227d` and finalize the `align-product-ports-with-g2-lifecycle` entry (#372) and the closure date
- [x] 2.9 Run `make verify`

## 3. Review and archive

- [x] 3.1 Independent review, pass 1 (reviewer A, Codex CLI, `gpt-6.1-sol`)
- [x] 3.2 Independent review, pass 2 (reviewer B, Claude Code, `claude-opus-5-5`, effort high); its six Low findings fixed and recorded `fixed-unreviewed`
- [x] 3.3 Pass 3 not needed: pass 2 was Low-only (governance, "Low findings are fixed")
- [x] 3.4 Archive the change
