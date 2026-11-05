## MODIFIED Requirements

### Requirement: Logs without secrets

The logger SHALL replace the value of every field whose name may hold a secret with `[redacted]`, and SHALL remove URL user information, bearer tokens, `key=value` secrets, issued bearer secrets, GitHub App installation tokens, `Authorization: Basic` credentials, NKey seeds, NATS JWTs, `.creds` blocks, and PEM private keys from text in fields and correlation, in time linear in any scannable text, before any sink receives the record. Adapters SHALL NOT log message bodies or payloads.

#### Scenario: A failure message quotes a connection URL

- **WHEN** a field holds a message with a PostgreSQL URL that carries a user and password, and a bearer token
- **THEN** the record holds the URL without its user information, and the token is replaced

#### Scenario: A field named for a secret

- **WHEN** a field named like a password, token, API key, credential, or authorization is logged
- **THEN** its value is `[redacted]`

#### Scenario: A secret of a known shape in text

- **WHEN** a field or correlation value holds an issued Taskelith secret, a GitHub App installation token in its stateful or stateless format, also inside a longer word or after an escape such as a literal `\n`, an NKey seed, a NATS JWT, a `.creds` block, or a PEM private key, even glued to other text
- **THEN** the record holds `[redacted]` in its place

#### Scenario: Near miss of a GitHub installation token

- **WHEN** a field or correlation value holds `ghs_` followed by fewer than 36 token characters, or 36 such characters after another prefix such as `ghx_`, `GHS_`, or `ghs-`
- **THEN** the record holds that text unchanged

#### Scenario: Pathological log text

- **WHEN** a field or correlation value holds tens of thousands of characters such as `a.`, `proxy-`, `ghs_`, `eyJ`, or `authorization: basic ` repeated, or `.creds` or PEM private-key begin markers without an end
- **THEN** redacting it takes time linear in its length

#### Scenario: Basic credentials in a Git configuration form
- **WHEN** a field or correlation value holds `Authorization: Basic` and credentials, alone, as a `-c http.extraHeader=` value, as a `GIT_CONFIG_VALUE_<n>` value, or in JSON, also with a token shape glued inside the credentials
- **THEN** the record holds `[redacted]` in place of the whole credentials and keeps the header name

#### Scenario: Near miss of Basic credentials
- **WHEN** a field or correlation value holds `Basic` and credentials without an `Authorization` header name, `Authorizations:`, `WWW-Authenticate: Basic realm=`, or `Authorization: Basically`
- **THEN** the record holds that text unchanged

## ADDED Requirements

### Requirement: Redaction of text of any length
Redacting text, in log records and in the secrets adapter's redaction of failures and output, SHALL NOT throw for a text of any length. A text on which a rule throws a `RangeError`, of any cause, as the regular expression engine does when a text overflows its backtrack stack, SHALL be replaced whole with `[redacted]`, since a secret may span words; any other rule error SHALL propagate.

#### Scenario: A logged field too long to scan
- **WHEN** a logged field holds `ghs_` repeated 1,400,000 times
- **THEN** the logger writes the record without throwing, and the field holds `[redacted]`

#### Scenario: A failure message too long to scan
- **WHEN** a failure's message is `a` repeated 2^23 + 1 times
- **THEN** redacting the failure does not throw, its message is `[redacted]`, and its details stay

#### Scenario: A rule's RangeError of another cause
- **WHEN** a redaction rule that uses no regular expression throws `RangeError('invalid array length')` on the text `keep`
- **THEN** redacting with that rule returns `[redacted]`

#### Scenario: Another rule failure
- **WHEN** a redaction rule throws a `TypeError`
- **THEN** redacting with that rule throws the same error
