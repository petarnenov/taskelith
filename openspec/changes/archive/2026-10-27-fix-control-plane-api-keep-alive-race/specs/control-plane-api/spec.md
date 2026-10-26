## ADDED Requirements

### Requirement: Connection closed after each response
The control-plane API SHALL answer every request with `Connection: close` and close the connection after the response, so that no client reuses an idle connection that the server's idle timeout may close while a request is in flight.

#### Scenario: Sequential requests
- **WHEN** a client sends two requests to the API one after the other
- **THEN** each answer carries `Connection: close` and the second request arrives on a new connection
