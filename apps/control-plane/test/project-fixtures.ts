import type { AccessStore, ProjectDefaults } from '@taskelith/access';
import type { ProjectDirectory } from '@taskelith/control-plane';
import { ok, type Instant } from '@taskelith/kernel';
import type { ProjectId } from '@taskelith/sdlc';
import { value } from '@taskelith/testing';

export const DEFAULTS: ProjectDefaults = Object.freeze({
  frameworkPluginId: 'sdlc-openspec', implementers: Object.freeze(['agent-primary', 'agent-secondary']), reviewer: 'agent-secondary',
  specApprover: 'delegated-reviewer', noEligibleSlot: 'wait',
});

// Projects of any identifier, such as the G2 run projects of a test, as a
// store fixture rather than through `createProject`.
export async function addProjects(store: AccessStore, projectIds: readonly string[], createdAt: Instant): Promise<void> {
  value(await store.transaction(async (tx) => {
    for (const projectId of projectIds) {
      const project = { projectId: projectId as ProjectId, name: `Project ${projectId}`, createdAt, revision: 1 };
      value(await tx.projects.add(project, DEFAULTS));
    }
    return ok(undefined);
  }));
}

// For the run fixtures of tests that need no project store.
export const EVERY_PROJECT_EXISTS: ProjectDirectory = Object.freeze({ exists: async () => ok(true) });

// The defaults of a `createProject` body, for tests that read none.
export const WIRE_DEFAULTS = Object.freeze({
  framework: { pluginId: 'sdlc-openspec' }, implementers: ['agent-primary'], reviewer: 'agent-secondary',
  specApprover: 'project-maintainer', noEligibleSlot: 'wait',
});
