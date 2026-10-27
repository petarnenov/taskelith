## MODIFIED Requirements

### Requirement: Admitted credential deliveries only
A slot's credential SHALL be delivered only through a delivery admitted for the slot's harness and mechanism: the add-slot command SHALL reject a slot whose mechanism has no admitted delivery for its harness with `invalid`, and the delivery SHALL reveal nothing for such a slot. By G3 decision D6, the only delivery admitted for Claude Code, the only harness G3 admits, SHALL be `subscription-token`, with at most one non-removed slot (account pool contract section 7.1).

#### Scenario: Device login slot without an admitted delivery
- **WHEN** an operator adds a slot whose mechanism is `device-login` and its harness has no admitted `device-login` delivery, as Claude Code has none under D6
- **THEN** the command fails with `invalid` and no slot or credential is stored

#### Scenario: Slot beyond its pair's limit
- **WHEN** an operator adds a Claude Code `subscription-token` slot while another Claude Code slot is active or revoked
- **THEN** the command fails with `invalid` and no slot or credential is stored; a removed slot does not count
