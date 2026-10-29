## ADDED Requirements

### Requirement: Native request source
The native request source SHALL open a permission or input item for each recorded request of its kind and a `delivery-acknowledgement` item for each uncertain delivery, of a delegation request too, and open, resolve, or close them in the transaction that changes the request; an acknowledgement changes no request and SHALL resolve its item with its audit event and idempotency key in one transaction.

#### Scenario: Response resolves the item
- **WHEN** a person answers a permission request through `respondToNativeRequest`
- **THEN** its item is resolved in the same transaction with the responder

#### Scenario: Acknowledgement sends nothing
- **WHEN** a person acknowledges a `delivery-acknowledgement` item
- **THEN** the item is resolved and audited, and no response, turn, or delivery is recorded

#### Scenario: Uncertain delegation result
- **WHEN** the delivery of a host's delegation result becomes `delivery-uncertain`
- **THEN** a `delivery-acknowledgement` item opens for its request

#### Scenario: Item closed by a standing rule
- **WHEN** a standing rule's answer closed a request's item and a person then answers the item through the inbox
- **THEN** the answer fails with `precondition-failed` `item-closed`

#### Scenario: One key in both channels
- **WHEN** a request answered through `respondToNativeRequest` gets an inbox answer under the same idempotency key
- **THEN** the inbox answer fails with conflict `already-answered`, since an inbox key is scoped to its item

#### Scenario: Inbox answer races a response
- **WHEN** an inbox answer and `respondToNativeRequest` answer one request at once
- **THEN** one consumes it, the other fails with conflict `already-answered`, and the item is resolved once
