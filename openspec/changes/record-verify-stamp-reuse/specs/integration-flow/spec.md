## ADDED Requirements

### Requirement: Integration verify record
After its verify step passes, `make integrate` SHALL print `Integration: tree <tree>; verify <ran|reused stamp of <time>>; profile <profile>; verify seconds <n>; change <archived change directory>; branch <branch>; started <UTC time>`, add it after `BODY` to a pull request it opens, and append it as one JSON line to `integrations.jsonl` in its state directory. A failed append SHALL only warn.

#### Scenario: Stamp reused
- **WHEN** the merged tree already has a full stamp
- **THEN** the line says `reused stamp of` the stamp's verification time, and the verify seconds count only the stamp check, since `make verify` does not run

#### Scenario: Verify ran
- **WHEN** the command runs `make verify` and it passes
- **THEN** the line says `verify ran`, the pull request body ends with the line after `BODY`, and the log gains one JSON object with the line's fields

#### Scenario: Log not writable
- **WHEN** the line cannot be appended to the log
- **THEN** the command warns and integrates as usual
