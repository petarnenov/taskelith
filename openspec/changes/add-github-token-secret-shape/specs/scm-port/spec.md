## MODIFIED Requirements

### Requirement: Run credential secret
A run credential's secret SHALL be delivered only to its run and SHALL NOT be logged or stored. The shared `SECRET_SHAPE_RULES`, which log redaction and `@taskelith/secrets` use, SHALL match the GitHub plugin's secret, a GitHub App installation token, in its stateful and stateless formats. Item 21, which delivers the credential to a run in G3, SHALL scrub it on that path.

#### Scenario: Secret on the delivery path
- **WHEN** the delivery path hands a run credential to its run, and a log line, an error payload, or a child process environment on that path holds the secret
- **THEN** the secret is redacted or scrubbed there and reaches only its run

#### Scenario: GitHub installation token in text
- **WHEN** a log line or an error payload holds a GitHub App installation token, stateful or stateless, wherever it starts, also inside a longer word
- **THEN** it holds `[redacted]` in the token's place
