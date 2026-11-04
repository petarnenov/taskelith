## REMOVED Requirements

### Requirement: Temporary G2 bridge
**Reason**: Sub-change 11c makes `createRun` require an existing project, so an `installation-owner` takes a project role like any other principal, and the bridge is retired as the requirement planned.

**Migration**: An operator flow creates a project with `createProject`, assigns the owner `project-operator` with `assignProjectMember`, and creates its runs in that project; the owner keeps the section 3 reads `readAdmission` and `readTaskResult`.
