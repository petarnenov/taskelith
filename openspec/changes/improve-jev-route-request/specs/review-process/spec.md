## MODIFIED Requirements

### Requirement: Shadow routing
The shadow router SHALL ask TypeSafe AI's Jev model one `noul` question, whether the change will need review pass 3, with criteria taken from the conditional third pass rule, never from the rule router's triggers. Its probability P(third), the threshold 0.4, the tier that P(third) maps to, `elevated` at or above the threshold and `standard` below it, and that tier's pass plans SHALL be recorded beside the rule's and SHALL NOT change the rule's recommendation.

#### Scenario: Disagreement
- **WHEN** the rule decides `standard` and the shadow router answers P(third) 0.8
- **THEN** `route.json` records both, the shadow tier is `elevated`, and the rule's pass plans stay the recommendation

#### Scenario: Below the threshold
- **WHEN** the shadow router answers P(third) 0.39
- **THEN** the shadow tier is `standard`

#### Scenario: Request content
- **WHEN** the shadow router sends a request
- **THEN** its `state` holds exactly the allowlisted keys and none of the rule's path flags

## ADDED Requirements

### Requirement: Shadow request content
The request SHALL hold only the changed lines and files, capability identifiers, the external facts flag, the size, the capability history, a context that explains the fields, the review process, and the third pass share of the other archived reviewed changes, overall and by lines changed, and the proposal's Why and What Changes, redacted, then clipped at 1,200 and 1,500 characters, with its task and requirement counts. It SHALL send no other path, commit, diff, or finding text.

#### Scenario: Routed change left out
- **WHEN** the reference rates are computed for a change whose own review records are archived
- **THEN** that change counts in neither the overall nor the lines changed rates

#### Scenario: Secret in the proposal
- **WHEN** the proposal's Why holds a GitHub token
- **THEN** the request holds `[redacted]` in its place and not the token

### Requirement: Shadow third pass score
`make findings ARGS="effect"` and the route evaluation SHALL report, over the shadow answers to the third pass question, the Brier score and the AUC of P(third) against whether pass 3 ran, and SHALL score answers to the earlier tier question apart. Validation SHALL report a `route.json` whose shadow tier is not the one that its P(third) and threshold give.

#### Scenario: Score of P(third)
- **WHEN** three archived changes answered P(third) 0.8, 0.3, and 0.5 and only the first needed pass 3
- **THEN** the effect reports a Brier score of 0.13 and an AUC of 1.00 over three changes

#### Scenario: Inconsistent shadow tier
- **WHEN** a `route.json` records P(third) 0.39, threshold 0.4, and the shadow tier `elevated`
- **THEN** validation reports the file and fails
