## MODIFIED Requirements

### Requirement: Logs without secrets

The logger SHALL replace the value of every field whose name may hold a secret with `[redacted]`, and SHALL remove URL user information, bearer tokens, `key=value` secrets, issued bearer secrets, GitHub App installation tokens, NKey seeds, NATS JWTs, `.creds` blocks, and PEM private keys from text in fields and correlation, in time linear in the text, before any sink receives the record. Adapters SHALL NOT log message bodies or payloads.

#### Scenario: A failure message quotes a connection URL

- **WHEN** a field holds a message with a PostgreSQL URL that carries a user and password, and a bearer token
- **THEN** the record holds the URL without its user information, and the token is replaced

#### Scenario: A field named for a secret

- **WHEN** a field named like a password, token, API key, credential, or authorization is logged
- **THEN** its value is `[redacted]`

#### Scenario: A secret of a known shape in text

- **WHEN** a field or correlation value holds an issued Taskelith secret, a GitHub App installation token in its stateful or stateless format, an NKey seed, a NATS JWT, a `.creds` block, or a PEM private key, even glued to other text
- **THEN** the record holds `[redacted]` in its place

#### Scenario: Near miss of a GitHub installation token

- **WHEN** a field or correlation value holds `ghs_` followed by fewer than 36 token characters, or 36 such characters after another prefix such as `ghx_`, `GHS_`, or `ghs-`
- **THEN** the record holds that text unchanged

#### Scenario: Pathological log text

- **WHEN** a field or correlation value holds tens of thousands of characters such as `a.`, `proxy-`, `ghs_`, or `eyJ` repeated, or `.creds` or PEM private-key begin markers without an end
- **THEN** redacting it takes time linear in its length
