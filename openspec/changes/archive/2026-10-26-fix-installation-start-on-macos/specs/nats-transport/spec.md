## MODIFIED Requirements

### Requirement: Transport bounds
Streams and consumers SHALL take the provisional bounds of the operational targets: 7 days or 10 GiB per stream, 1 MiB per message, `ack_wait` 30 s, `max_deliver` 5, `max_ack_pending` 4 per worker, and 10,000 queued commands per worker subject, rejecting new ones when full. A deployment MAY set a smaller per-stream byte limit. When the broker refuses a stream for lack of file storage, the failure SHALL name the bytes the streams reserve.

#### Scenario: Stream configuration
- **WHEN** the streams are created again
- **THEN** they are updated in place and carry these bounds

#### Scenario: Too little broker storage
- **WHEN** the streams reserve more bytes than the broker's free file storage
- **THEN** creating them fails as `unavailable` with the reserved bytes
