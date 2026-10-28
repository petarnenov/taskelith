## ADDED Requirements

### Requirement: Code-head identity
The SDLC module SHALL define `CodeHeadIdentity` as a repository identifier and the object names of a commit and its tree, which it compares exactly and never parses, and `isSameCodeHead` SHALL hold exactly when all three parts are equal. The workspace module's `CodeHeadIdentity` SHALL extend it, so that a workspace head is an SDLC code head without a conversion.

#### Scenario: Same tree, other commit
- **WHEN** two code heads have the same repository and tree but different commits
- **THEN** `isSameCodeHead` is false
