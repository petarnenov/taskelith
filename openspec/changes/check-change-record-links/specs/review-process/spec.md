## ADDED Requirements

### Requirement: Record links in the evidence check
The evidence check before the first pass SHALL include that every repository link of the change's records follows the record link rule and resolves, as `npm run verify:links` checks.

#### Scenario: Evidence check recorded
- **WHEN** the author runs the evidence check before the first pass
- **THEN** `verification.md` records the result of `npm run verify:links` with it
