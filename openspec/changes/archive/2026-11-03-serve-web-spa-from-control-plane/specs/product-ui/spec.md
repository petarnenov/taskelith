## MODIFIED Requirements

### Requirement: Web SPA development server
The SPA SHALL be built under the base path `/app/`. `make web-dev` SHALL serve it over HTTPS on `localhost` only and proxy every path outside `/app/` to the browser endpoint of the local composition, which serves a certificate of the installation CA, trusting only that CA; the CA copy and the server's TLS key SHALL live outside the repository and the bundle. The docs SHALL state that the control plane serves the built SPA and that the development server is for development.

#### Scenario: Development server reach
- **WHEN** `make web-dev` starts
- **THEN** the server listens on `localhost` only, and a request outside `/app/` reaches the local composition's control plane over TLS verified against the installation CA

## ADDED Requirements

### Requirement: Web SPA style nonce
The built `index.html` SHALL carry the control plane's nonce placeholder in a `csp-nonce` meta tag and hold no inline script, inline style, or event handler attribute, and every script and style sheet it loads SHALL be a file of the build under `/app/assets/`. The SPA SHALL give Mantine the nonce of that tag, so that every style element Mantine adds carries it.

#### Scenario: Mantine style elements
- **WHEN** the SPA starts on a page whose `csp-nonce` meta tag carries a nonce
- **THEN** every style element that Mantine adds carries that nonce

#### Scenario: Built page
- **WHEN** `npm run build` builds the SPA
- **THEN** its `index.html` names the placeholder in the `csp-nonce` meta tag and loads only hashed files of the build, without inline script or style
