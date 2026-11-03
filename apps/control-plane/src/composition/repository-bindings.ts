import type { ProjectSetupService } from '@taskelith/access';
import {
  RepositoryBindingService,
  type BindableProjects,
  type RepositoryBindings,
  type ScmIntegrations,
  type ScmPlugins,
} from '@taskelith/integrations';
import { ok } from '@taskelith/kernel';

export interface RepositoryBindingPorts {
  readonly bindings: RepositoryBindings;
  readonly integrations: Pick<ScmIntegrations, 'configurationOf'>;
  readonly plugins: ScmPlugins;
  readonly projects: BindableProjects;
}

export function repositoryBindingService(ports: RepositoryBindingPorts): RepositoryBindingService {
  return new RepositoryBindingService(ports);
}

// The Access module's projects as the integrations module asks for them.
export function bindableProjects(projects: Pick<ProjectSetupService, 'readProject'>): BindableProjects {
  return {
    exists: async (projectId) => {
      const read = await projects.readProject(projectId);
      if (read.ok) return ok(true);
      return read.error.code === 'not-found' ? ok(false) : read;
    },
  };
}
