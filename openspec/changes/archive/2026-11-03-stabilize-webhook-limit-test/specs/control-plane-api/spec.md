## ADDED Requirements

### Requirement: Answer before the body ends
The control plane SHALL write a JSON, binary, or empty answer that it gives before its request's body ended, such as a 413 or a 401 before an upload's body, with `Connection: close`, then discard the rest of that body unbuffered. It SHALL close the connection gracefully when the body ends, and by force once more than 32 MiB were discarded or 10 seconds passed since the answer, sent or not. A client that ends its body within both bounds and reads gets the answer.

#### Scenario: Oversized delivery written whole
- **WHEN** a sender writes a whole delivery of 25 MiB and one byte, declared or chunked, within 10 seconds and only then reads
- **THEN** it reads the 413 with reason `body-too-large` and the connection closes gracefully

#### Scenario: Byte bound
- **WHEN** more than 32 MiB of the body follow the answer
- **THEN** the server stops reading and closes the connection by force

#### Scenario: Time bound
- **WHEN** 10 seconds pass after the answer and the connection is still open, also with the body ended and the answer unread
- **THEN** the server closes the connection by force

### Requirement: Bounded discards
The control plane SHALL discard the bodies of at most a fixed number of early answers at once, apart from the body slots of uploads and signed bodies. An early answer beyond that number SHALL close its connection at once, as without a discard; no request SHALL wait for a discard, and a closed connection SHALL free its place.

#### Scenario: Discards saturated
- **WHEN** every discard place is taken and another early answer is given
- **THEN** that answer closes its connection at once

#### Scenario: Delivery during discards
- **WHEN** every discard place is taken and a valid signed delivery arrives
- **THEN** it is read, verified, and answered 202 as usual

## MODIFIED Requirements

### Requirement: SCM webhook receiver served
The control plane SHALL serve `receiveScmWebhook` without a credential: it SHALL read at most 25 MiB of raw body, answering 413 beyond it before any verification and, for a declared length beyond it, before reading, read and handle at most a fixed number of deliveries at once, discards aside, pass the bytes and the lower-case headers to the receiver, and answer 202 without a body for every accepted delivery, a repeat included. Other operations SHALL keep their body limits.

#### Scenario: Oversized delivery
- **WHEN** a delivery's body exceeds 25 MiB
- **THEN** the answer is 413 and no verifier sees the delivery

#### Scenario: Concurrent deliveries
- **WHEN** more deliveries arrive at once than the receiver handles
- **THEN** the others wait, unread, until one is answered

#### Scenario: Redelivery over HTTP
- **WHEN** a signed delivery arrives twice
- **THEN** both answers are 202 and its event is recorded once
