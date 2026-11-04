## ADDED Requirements

### Requirement: Web SPA agent session composer
The agent session screen SHALL keep a composer visible at its end that sends a message through `submitTurn` with its own idempotency key, trimmed, 1 to 65,536 characters, counted near the limit and refused over it, and SHALL take no turn, sent or retried, saying why, while the session loads or could not be read, while it stopped at an account limit, while a turn is being sent, or after a 403 names the role; the CSRF token SHALL reach the request only, never the page, a storage, or a log.

#### Scenario: Message sent
- **WHEN** an operator sends a message
- **THEN** the SPA posts `submitTurn` with a new idempotency key, the trimmed text, and the session's CSRF token, shows the submission as sending, and shows the recorded turn at once, once, when the stream later delivers it

#### Scenario: Message length
- **WHEN** the draft is empty, blank, or longer than 65,536 characters
- **THEN** the send action is disabled, and a draft over the limit says by how much

#### Scenario: Session stopped
- **WHEN** the shown session has an account limit
- **THEN** the composer takes no turn, by send or by retry, and says that the session accepts none

#### Scenario: Turn answered after a move
- **WHEN** a submission is answered after the operator moved to another session
- **THEN** that session's timeline shows no turn of it, and the submission's record still settles

#### Scenario: Worker unreachable
- **WHEN** the session's task shows an unreachable worker or an uncertain process state
- **THEN** the composer still takes a turn, which the control plane queues

### Requirement: Web SPA turn submission states
The composer SHALL show each submission's state honestly: sending; not sent after no answer, a 5xx, an undocumented status, or a refusal without its reason, with a retry of the key; already recorded for a 200 duplicate, naming the turn; key reused for a 409; session stopped for a 422; not found for a 404; refused for a 400; the role for a 403 that names it; and after a 403 for the CSRF token it SHALL read the session once and resend the key only with the renewed token under the same sign-in.

#### Scenario: Retry with the same key
- **WHEN** a submission got no answer and the operator retries it
- **THEN** the SPA sends the same idempotency key and text again, and the control plane records the turn once

#### Scenario: Duplicate
- **WHEN** `submitTurn` answers 200 with `effect` `duplicate`
- **THEN** the composer says which turn the control plane had recorded for the message, sends nothing again, and shows that turn

#### Scenario: Stale CSRF token
- **WHEN** `submitTurn` answers 403 with the reason `csrf-token-invalid`
- **THEN** the SPA reads the session again, sends the same key with the new token, and shows a second such refusal as final for that key, also after other failures, retries, or a reload between the two

#### Scenario: Session read fails after a CSRF refusal
- **WHEN** the session read after a 403 for the CSRF token gets no usable answer
- **THEN** the SPA sends nothing again, shows the submission as not sent with a retry, and keeps its key

#### Scenario: Sign-in changes during the session read
- **WHEN** the session read after a 403 for the CSRF token finds another operator, a signed-out shell, or the composer gone
- **THEN** the SPA sends nothing again under the new state and keeps the key

#### Scenario: Refusal without its reason
- **WHEN** `submitTurn` answers 403, 409, or 422 without the documented reason of that status
- **THEN** the SPA shows the submission as not sent with a retry and keeps its key

#### Scenario: Role refused
- **WHEN** `submitTurn` answers 403 with the reason `role-required`
- **THEN** the composer names the role and takes no turn until the notice is dismissed

#### Scenario: Submission after the session ended
- **WHEN** `submitTurn` answers 401 `unauthenticated`
- **THEN** the SPA shows the sign-in page saying that the session expired, and reads the session again

### Requirement: Web SPA turn retry records
The SPA SHALL keep the key, text, and time of each unconfirmed submission in `sessionStorage` per session address with each identifier encoded, at most 20 per session, so a retry after a reload sends the same key, SHALL drop a record on a 201, a 200, or a refusal that ends the key, SHALL drop the records of every session once the shell is signed out, trying the storage whatever threw before, and SHALL keep the records in memory when the storage throws, so the composer still works.

#### Scenario: Retry after a reload
- **WHEN** the page is reloaded while a submission is unconfirmed
- **THEN** the composer shows it as not confirmed, and its retry sends the same key and text

#### Scenario: Shell signed out
- **WHEN** the operator signs out, or a 401 or the session's expiry shows the sign-in page
- **THEN** no turn record of any session remains in the storage, also after an earlier write threw

#### Scenario: Signed out with a turn unconfirmed
- **WHEN** the shell is signed out while a submission was in flight or had no usable answer
- **THEN** the sign-in page says that the last turn may not have been sent and to check the timeline after signing in, claiming neither that it was sent nor that it was not

#### Scenario: Session addresses that share a text
- **WHEN** records exist for project `a/b` session `c`
- **THEN** the composer of project `a` session `b/c` shows none of them

#### Scenario: Storage throws
- **WHEN** `sessionStorage` throws on any access
- **THEN** the composer keeps its records in memory, and sends and retries as before
