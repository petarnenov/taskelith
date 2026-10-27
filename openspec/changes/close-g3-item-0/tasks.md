## 1. Change

- [x] 1.1 Create the change `close-g3-item-0` (documentation only, `skip_specs`), with empty `findings.jsonl` and `passes.jsonl`

## 2. Records

- [x] 2.1 Check each pull request of item 0 on `dev` and its archived change
- [x] 2.2 Mark item 0 done in `docs/g3-plan.md` and add the section "Item 0 closure" with its changes
- [x] 2.3 Resolve the plan's hosted-runner row by `record-hosted-runner-linux-acceptance` (#367)
- [x] 2.4 List the open owner confirmations with their source records
- [x] 2.5 Record item 0 as done and wave 1 as next in `docs/foundation.md`
- [x] 2.6 Run the checks without Docker and record `verification.md`
- [ ] 2.7 Add the review checklist output to `design.md`
- [ ] 2.8 Finalize the `align-product-ports-with-g2-lifecycle` entry and the closure date after it lands, and merge `origin/dev`
- [ ] 2.9 Run `make verify`

## 3. Review and archive

- [ ] 3.1 Independent review, pass 1 (reviewer A, Codex CLI, `gpt-6.1-sol`)
- [ ] 3.2 Independent review, pass 2 (reviewer B, Claude Code, `claude-opus-5-5`, effort high)
- [ ] 3.3 Independent review, pass 3 (reviewer A)
- [ ] 3.4 Archive the change
