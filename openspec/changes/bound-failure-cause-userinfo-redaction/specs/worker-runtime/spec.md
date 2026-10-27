## MODIFIED Requirements

### Requirement: Control-plane failure cause
A control-plane request without an answer SHALL fail with `unavailable` and the details `cause`, the first four links of the thrown error's cause chain, each its name, code of under 32 characters, and message, in at most 512 characters, and `causeCode`, the innermost code of the first 16 links. A message, and a server's message, reason, and schema violation, SHALL be one line of at most 160 characters with no URL, bearer or key-value secret, JWT, or run of 32 or more of `[A-Za-z0-9_+=/-]`.

#### Scenario: Reset connection
- **WHEN** `fetch` fails with a cause whose code is `ECONNRESET`
- **THEN** the failure is `unavailable`, `cause` names `fetch failed` and `ECONNRESET`, and `causeCode` is `ECONNRESET`

#### Scenario: Secrets in a cause message
- **WHEN** a cause message holds a URL with user information, a bearer or Basic credential in text or JSON, a quoted `password=` or `password:` value, a JWT, standard base64, or a token, wherever a length limit cuts it
- **THEN** `cause` holds no part of them

#### Scenario: Long cause chain
- **WHEN** the cause chain is longer than four links, cyclic, or holds a message of thousands of characters
- **THEN** `cause` has at most four links and 512 characters, and `causeCode` is still the code of the innermost of the first 16 links

#### Scenario: No cause
- **WHEN** the thrown error has no cause and no code
- **THEN** `cause` names only that error, and there is no `causeCode`

#### Scenario: Throwing thrown value
- **WHEN** reading the name, message, or cause of the thrown value throws
- **THEN** the failure is `unavailable` with `cause` `unknown`, and the request returns it instead of rejecting

#### Scenario: Unbounded server reason
- **WHEN** the control plane answers with a message and a reason of hundreds of characters holding a secret, or with a property name of 2,000 characters that its schema forbids
- **THEN** the failure's message, `reason`, and `violation` hold at most 160 characters of them and no secret

#### Scenario: Pathological cause message
- **WHEN** a cause message is tens of thousands of characters with no end of user information, a URL, or a JWT, such as `a`, `a:`, `a:a`, `a.`, or `eyJ` repeated
- **THEN** every failure-cause redaction rule takes time linear in its length, and user information, a URL, or a JWT of any length is still redacted
