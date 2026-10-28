## 1. Change

- [x] 1.1 Create the change `improve-jev-route-request` and save the checklist
- [x] 1.2 Design: data consent, threshold, reference rates, re-evaluation gate

## 2. Contract first

- [x] 2.1 Spec delta of `review-process`: modify "Shadow routing" and "Shadow router failure", add "Shadow request content" and "Shadow third pass score"
- [x] 2.2 `docs/review-findings/route.schema.json`: the third pass answer beside the earlier answer shape
- [x] 2.3 `docs/agent-task-protocol.md`: the route record and the routing part of the checklist effect

## 3. Implementation

- [x] 3.1 One `noul` question with criteria from governance "Conditional third pass"; the tier and passes questions dropped
- [x] 3.2 `context` with leave-one-out reference rates from the archived review records
- [x] 3.3 `content`: the redacted and clipped proposal sections and the task and requirement counts
- [x] 3.4 The `touches` flags removed from the request; rule v1 unchanged
- [x] 3.5 `THIRD_PASS_THRESHOLD` 0.4 maps P(third) to the shadow tier; `route.json` records both
- [x] 3.6 Brier score and AUC of P(third) in the effect and the evaluation; the shadow tier checked in validation
- [x] 3.7 Tests: request shape, leave-one-out rates, threshold, redaction, no `touches` (fails before), network stubbed
- [x] 3.8 The shadow input built after the credential check; a build failure recorded as `input-unavailable`

## 4. Verification

- [x] 4.1 `route.json` from `make findings ARGS="route --change improve-jev-route-request"`, committed unedited
- [x] 4.2 The credential's value absent from `route.json` and every log
- [x] 4.3 `npm run openspec -- validate improve-jev-route-request --strict` and `make verify`
- [x] 4.4 Record `verification.md`

## 5. Review and archive

- [x] 5.1 Independent review passes assigned by the coordinator
- [x] 5.2 Archive the change
