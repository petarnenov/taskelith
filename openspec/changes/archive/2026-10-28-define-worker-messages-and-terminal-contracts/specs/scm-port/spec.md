## MODIFIED Requirements

### Requirement: Refreshed credential delivery
A refreshed credential SHALL reach its running run, and the run SHALL adopt it. This is G3 work: item 9 defines the notice, which carries no secret, the HTTPS fetch, and the confirmation, item 21 delivers it, item 18 adopts it and confirms, item 21 then ends the previous secret, and item 20 SHALL revise the port so that the previous secret stays valid until that confirmation. Until that revision, the port ends the previous secret when the refresh returns.

#### Scenario: Failed delivery of a refreshed credential
- **WHEN** a credential is refreshed under the revised port and its delivery to the running run fails
- **THEN** the run keeps working with the previous secret, which ends only after the run confirms adoption of the new one
