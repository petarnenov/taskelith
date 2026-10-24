## MODIFIED Requirements

### Requirement: Project board as landing page
The SPA's landing page SHALL be a per-project board whose columns are governance's lifecycle stages under short labels, Propose (Propose and inspect), Specify (Specify and design), Implement, Verify, Review, and Archived (Close), with Accept and integrate shown as the merge gate between Review and Archived.

#### Scenario: Native and platform-managed steps
- **WHEN** a card is shown in a column
- **THEN** it names its framework's native step for that stage, or "platform-managed" where the framework mapping records a gap

#### Scenario: Merge
- **WHEN** a change merges
- **THEN** its card moves to Archived, the change is closed, and its agent session is stopped
