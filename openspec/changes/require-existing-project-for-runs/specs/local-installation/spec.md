## MODIFIED Requirements

### Requirement: Opt-in end-to-end smoke
`make installation-smoke` SHALL build, bootstrap, start, and enroll a throwaway installation with random secrets, then create a Taskelith project, assign the owner `project-operator` on it, create a run of a test-only workflow in that project, and submit an admitted task through the API. It SHALL pass only when the Linux worker container executes the test-only scripted process through the supervisor and the control plane stores an ended result that exited with code 0.

#### Scenario: Successful smoke
- **WHEN** `make installation-smoke` runs on a Docker host
- **THEN** the stored task result is ended with exit code 0, and the throwaway project is removed with its volumes and images

#### Scenario: Failed smoke
- **WHEN** a step fails or the task does not end within two minutes
- **THEN** the control-plane and worker logs are printed, the target fails, and the throwaway project is removed
