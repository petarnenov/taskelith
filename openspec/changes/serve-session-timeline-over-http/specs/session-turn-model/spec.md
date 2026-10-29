## ADDED Requirements

### Requirement: Native request source
The native request source SHALL open a permission or input item for each recorded request of its kind and a `delivery-acknowledgement` item for each uncertain delivery, and resolve or close them in the transaction that changes the request.

#### Scenario: Response resolves the item
- **WHEN** a person answers a permission request through `respondToNativeRequest`
- **THEN** its item is resolved in the same transaction with the responder

#### Scenario: Acknowledgement sends nothing
- **WHEN** a person acknowledges a `delivery-acknowledgement` item
- **THEN** the item is resolved and audited, and no response, turn, or delivery is recorded

#### Scenario: Inbox answer races a response
- **WHEN** an inbox answer and `respondToNativeRequest` answer one request at once
- **THEN** one consumes it, the other fails with conflict `already-answered`, and the item is resolved once
