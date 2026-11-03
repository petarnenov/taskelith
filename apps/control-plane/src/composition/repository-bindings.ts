import type { ProjectSetupService } from '@taskelith/access';
import {
  RepositoryBindingService,
  type BindableProjects,
  type RepositoryBindings,
  type ScmIntegrations,
  type SourceControlPlugin,
} from '@taskelith/integrations';
import { ok } from '@taskelith/kernel';

export interface RepositoryBindingPorts {
  readonly bindings: RepositoryBindings;
  readonly integrations: Pick<ScmIntegrations, 'configurationOf'>;
  readonly plugin: SourceControlPlugin;
  readonly projects: BindableProjects;
}

// The bindings of the installation's SCM plugin, the only one it registers.
export function repositoryBindingService({ bindings, integrations, plugin, projects }: RepositoryBindingPorts): RepositoryBindingService {
  const plugins = { pluginOf: (pluginId: string) => (pluginId === plugin.id ? plugin : undefined) };
  return new RepositoryBindingService({ bindings, integrations, plugins, projects });
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
