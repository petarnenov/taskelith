## ADDED Requirements

### Requirement: Record link check
`make verify` SHALL run `npm run verify:links` before `npm run verify:archive`. It SHALL fail on each Markdown link under `openspec/changes/`, `openspec/specs/`, and `docs/`, outside code and not `http`, `https`, or `mailto`, whose target or GitHub heading anchor is missing, that enters an active change, or that is relative and leaves its change directory, capability directory, or the repository, or sits in a spec delta. Active changes SHALL be checked at their archived path.

#### Scenario: Link out of the change directory
- **WHEN** an active change's `design.md` links `../../../../docs/governance.md`, which resolves once the change is archived
- **THEN** `make verify` fails and prints the file, the line, the target, and that the link must be root-relative

#### Scenario: Link that archiving would break
- **WHEN** an active change links `../../../docs/governance.md`, which resolves only from the change's current directory
- **THEN** the check fails before the change is archived

#### Scenario: Root-relative link
- **WHEN** a record links `/docs/governance.md#independent-review-process` and that heading exists
- **THEN** the check passes

#### Scenario: Missing anchor
- **WHEN** a link names an anchor that no heading of its target produces, counting the `-1` suffix of a repeated heading
- **THEN** the check fails and names the missing anchor

#### Scenario: Link into an active change
- **WHEN** a document or an archived record links into an active change's directory
- **THEN** the check fails, because the target moves when that change is archived

#### Scenario: Code and external links
- **WHEN** a link is inside a fenced code block or inline code, or is an `http`, `https`, or `mailto` link
- **THEN** the check ignores it

### Requirement: Record link baseline
`scripts/record-links-baseline.tsv` SHALL list, sorted and one line per occurrence, each archived link that broke the record link check when it was introduced, as its file and target separated by a tab. The check SHALL accept only those occurrences, SHALL reject an entry outside `openspec/changes/archive/`, SHALL fail on an entry that no longer occurs, and SHALL report how many baselined links remain.

#### Scenario: Known archived link
- **WHEN** an archived record still holds a baselined link
- **THEN** the check passes and counts it among the remaining baselined links

#### Scenario: New problem in an archived record
- **WHEN** an archived record holds a failing link that the baseline does not list
- **THEN** the check fails on it

#### Scenario: Stale entry
- **WHEN** a baselined link no longer occurs, for example because its record was corrected
- **THEN** the check fails and names the entry to remove

#### Scenario: Entry outside the archive
- **WHEN** the baseline lists a file outside `openspec/changes/archive/`
- **THEN** the check fails without suppressing anything
