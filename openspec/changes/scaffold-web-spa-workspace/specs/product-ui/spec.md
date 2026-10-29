## ADDED Requirements

### Requirement: Web SPA control-plane client
The SPA SHALL call the control plane through a typed fetch over the types that `openapi-typescript` generates from `control-plane.openapi.json` alone into a committed file, and the fetch SHALL send the session's CSRF token in `X-CSRF-Token` on every request other than GET while it knows the token, and never on GET; `make verify` SHALL fail when the committed types differ from a fresh generation.

#### Scenario: Request other than GET
- **WHEN** the SPA sends a POST, PUT, PATCH, or DELETE request while it knows the session's CSRF token
- **THEN** the request carries the token in `X-CSRF-Token`

#### Scenario: Request other than GET without a known token
- **WHEN** the SPA sends a POST, PUT, PATCH, or DELETE request before it knows the session's CSRF token
- **THEN** the request carries no `X-CSRF-Token`, and the control plane decides on it

#### Scenario: Stale generated types
- **WHEN** `control-plane.openapi.json` changes and the committed types are not generated again
- **THEN** `make verify` fails and names the stale file

### Requirement: Web SPA development server
The SPA SHALL be built under the base path `/app/`. `make web-dev` SHALL serve it over HTTPS on `localhost` only and proxy every path outside `/app/` to the browser endpoint of the local composition, which serves a certificate of the installation CA, trusting only that CA; the CA copy and the server's TLS key SHALL live outside the repository and the bundle. Until the control plane serves the SPA, the docs SHALL state that the development server is its only way to run.

#### Scenario: Development server reach
- **WHEN** `make web-dev` starts
- **THEN** the server listens on `localhost` only, and a request outside `/app/` reaches the local composition's control plane over TLS verified against the installation CA

### Requirement: Web SPA bundle boundary
`make verify` SHALL fail when SPA source under `apps/web/src/` imports a Node built-in, a server SDK, any `@taskelith/` workspace package, or a file outside `apps/web/src/`, or reads `import.meta.env` other than `MODE`, and when the built bundle holds a secret shape, an environment value, or a URL of an external origin other than a fixed list of XML namespace names and error documentation links in its scripts.

#### Scenario: External font
- **WHEN** the built bundle references a font or stylesheet on an external origin
- **THEN** `make verify` fails and names the file and the URL

#### Scenario: Secret in the bundle
- **WHEN** the built bundle holds a PEM block, an issued Taskelith secret, an NKey seed, a JSON Web Token, or another listed secret shape
- **THEN** `make verify` fails and names the file and the shape

#### Scenario: Environment read
- **WHEN** SPA source reads `import.meta.env` other than `import.meta.env.MODE`
- **THEN** the boundary check fails and names the file and the read
