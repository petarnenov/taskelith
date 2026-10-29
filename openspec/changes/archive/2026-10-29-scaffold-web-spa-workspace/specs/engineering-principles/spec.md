## MODIFIED Requirements

### Requirement: Code coverage threshold
`make verify` SHALL fail when automated tests cover less than 75% of lines, branches, or functions of the compiled product code in `dist/` of the root package and of every workspace package, measured without repository scripts, or of the sources in `src/` of the browser application, or when a product module under `src/` of the root package, of a workspace package, or of the browser application is missing from its coverage report.

#### Scenario: Coverage below the threshold
- **WHEN** a change lowers line, branch, or function coverage below 75%
- **THEN** `make verify` fails locally and in CI

#### Scenario: Untested product module
- **WHEN** a product module under `src/` is not loaded by any test
- **THEN** the coverage scope check names the module and `make verify` fails

#### Scenario: Untested workspace package module
- **WHEN** a module under a workspace package's `src/` is not loaded by any test
- **THEN** the coverage scope check names the module and `make verify` fails

#### Scenario: Untested browser application module
- **WHEN** a module under the browser application's `src/`, a `.tsx` module included, emits code and is missing from the application's Vitest coverage report
- **THEN** the coverage scope check names the module and `make verify` fails
