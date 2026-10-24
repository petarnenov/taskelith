# bootstrap-cli Specification

## Purpose
Provide an installable `taskelith` CLI that exposes help, its version, and the bundled architecture plan, and that clearly identifies the product as an early bootstrap.

## Requirements

### Requirement: Discover bootstrap capabilities

The CLI SHALL show help for no arguments, --help, and -h. Help SHALL identify Taskelith as a bootstrap release and SHALL NOT imply that orchestration is implemented.

#### Scenario: Read help

- **WHEN** the user invokes taskelith without arguments
- **THEN** it prints usage and exits with code 0

### Requirement: Read package version

The CLI SHALL print the package version for --version and -v.

#### Scenario: Inspect version

- **WHEN** the user invokes taskelith --version
- **THEN** it prints the installed manifest version and exits with code 0

### Requirement: Read bundled architecture

The CLI SHALL print the bundled English architecture plan for the plan command without network access or dependence on the working directory.

#### Scenario: Read plan outside the checkout

- **WHEN** the installed CLI is invoked as taskelith plan from an unrelated directory
- **THEN** it prints the Taskelith architecture document and exits with code 0

### Requirement: Reject invalid usage

The CLI SHALL reject unknown commands and extra arguments with an explanatory error and exit code 2.

#### Scenario: Unknown command

- **WHEN** the user invokes taskelith start
- **THEN** the CLI reports unsupported usage and exits with code 2

### Requirement: Publish an executable minimal package

The package SHALL expose the taskelith bin and SHALL include its license and bundled plan without local secrets or development output unrelated to the CLI.

#### Scenario: Inspect the release tarball

- **WHEN** the package is packed for publication
- **THEN** its allowlisted files support execution outside the source checkout
