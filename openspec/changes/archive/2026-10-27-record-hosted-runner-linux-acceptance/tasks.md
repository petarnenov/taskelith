## 1. Change

- [x] 1.1 Create the change `record-hosted-runner-linux-acceptance` (evidence only, `skip_specs`), with empty `findings.jsonl` and `passes.jsonl`

## 2. Evidence and records

- [x] 2.1 Check the run metadata and the artifact of run 40534340382, and that commit `4fe09456` is on `dev`
- [x] 2.2 Copy the artifact's `results.jsonl` byte for byte and record its SHA-256
- [x] 2.3 Write `acceptance.md`, the acceptance table of the hosted-runner run
- [x] 2.4 Record the hosted-runner check as resolved in `docs/foundation.md` and list the other documents that still call it open
- [x] 2.5 Run `npm run openspec -- validate record-hosted-runner-linux-acceptance --strict` and `make verify`
- [x] 2.6 Record `verification.md`

## 3. Review and archive

- [x] 3.1 Independent review, pass 1 (reviewer A, Codex CLI, `gpt-6.1-sol`): Low only, fixed unreviewed
- [x] 3.2 Independent review, pass 2 (reviewer B, Claude Code, `claude-opus-5-5`, effort high): not run, because pass 1 was Low only
- [x] 3.3 Independent review, pass 3 (reviewer A): not run, because pass 1 was Low only
- [x] 3.4 Archive the change
