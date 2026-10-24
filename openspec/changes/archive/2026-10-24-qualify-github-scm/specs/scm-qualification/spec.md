## ADDED Requirements

### Requirement: SCM credential scoping
An SCM qualification SHALL show that the plugin's per-run credential can mutate, and read non-public data of, only the project's repositories and only with the requested permissions, by recording a refused write to another repository and an operation that a narrowed credential is refused while the broad credential succeeds; reads of public repositories are expected to succeed.

#### Scenario: Write to another repository
- **WHEN** the qualification attempts a write to a repository outside the project with a per-run credential
- **THEN** the service refuses it, and the record shows the refusal status

### Requirement: Merge blocking with the plugin's own identity
An SCM qualification SHALL show that a required verification status blocks merging even for the plugin's own credential, and SHALL record any protection setting needed to prevent a bypass.

#### Scenario: Pending required status
- **WHEN** a pull request's required status is pending and the plugin attempts the merge
- **THEN** the merge is refused, and after the status succeeds the merge is allowed

### Requirement: Verified webhook deliveries and cleanup
An SCM qualification SHALL verify, with the shared secret, the signature of every webhook delivery it attributes to its run within a recorded inspection window, state which later deliveries fall outside that window, record redelivery behaviour, delete every branch and protection rule it created, close every pull request it opened, and disclose the records that remain, such as closed pull requests, reviews, and statuses.

#### Scenario: Qualification ends
- **WHEN** the qualification run finishes, with or without an error
- **THEN** its temporary branches and protection rules no longer exist, its pull requests are closed or merged, and the record lists each cleanup step's status
