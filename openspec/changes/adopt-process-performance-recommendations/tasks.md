## 1. Change

- [x] 1.1 Create the change with proposal, design (decisions D1 to D5 and the review checklist), spec deltas, and empty `findings.jsonl` and `passes.jsonl`

## 2. Implementation, one commit per recommendation

- [x] 2.1 Recommendation 1: verified-tree stamp in `make verify` and the `pre-push` hook, with fail-before tests
- [x] 2.2 Recommendation 2: Docker slot lock around `make test`, with fail-before tests
- [x] 2.3 Recommendation 7: docs-only verify profile and the `AGENTS.md` wording, with fail-before tests
- [x] 2.4 Integration script `scripts/integrate.sh` and `make integrate`, with offline tests
- [x] 2.5 Recommendation 4: `make record` and `make record-check`, wired before pass 1, with fail-before tests
- [x] 2.6 Recommendation 3: conditional pass 3 in governance
- [x] 2.7 Recommendations 5 and 6: context practice, the context warning hook with its test, and fresh subagents
- [x] 2.8 Recommendation 9: no owner `/clear` after each task
- [x] 2.9 Recommendation 10: test-authoring rule; recommendation 8 kept consistent

## 3. Evidence

- [x] 3.1 Non-Docker checks and the new tests with coverage of the new scripts
- [ ] 3.2 `make verify` (Docker) by the worker
- [ ] 3.3 Record `verification.md`

## 4. Review and archive

- [ ] 4.1 Independent review
- [ ] 4.2 Archive the change
