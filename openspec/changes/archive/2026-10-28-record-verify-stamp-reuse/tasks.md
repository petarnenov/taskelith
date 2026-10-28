## 1. Change

- [x] 1.1 Create the change `record-verify-stamp-reuse` and save the checklist
- [x] 1.2 Design: the line, where it goes, one line per passing verify step, and the risk of a failed log write

## 2. Implementation

- [x] 2.1 Spec delta of `integration-flow`: add "Integration verify record"
- [x] 2.2 `scripts/integrate.sh`: print the integration line, add it to the pull request body, and append it to `integrations.jsonl`, warning on a failed append
- [x] 2.3 Tests that fail before the change: the ran path, the reused path, the pull request body, the resume that appends to an open pull request's body, the JSON line, and the failed append
- [x] 2.4 `docs/agent-task-protocol.md`: the line and the log in coordinator step 2

## 3. Verification

- [x] 3.1 `route.json` from `make findings ARGS="route --change record-verify-stamp-reuse"`, committed unedited
- [x] 3.2 `npm run openspec -- validate record-verify-stamp-reuse --strict` and `make verify`
- [x] 3.3 Record `verification.md`

## 4. Review and archive

- [x] 4.1 Independent review passes, assigned by the coordinator
- [x] 4.2 Archive the change
