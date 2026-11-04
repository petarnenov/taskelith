import type { ProjectSetupService } from '@taskelith/access';
import {
  RepositoryBindingService,
  type BindableProjects,
  type RepositoryBindingServicePorts,
  type ScmPluginDefects,
} from '@taskelith/integrations';
import { ok } from '@taskelith/kernel';
import type { Logger } from '@taskelith/observability';

export type RepositoryBindingPorts = Omit<RepositoryBindingServicePorts, 'defects'>;

// The service whose plugin defects become one sanitized error record each.
export function repositoryBindingService(ports: RepositoryBindingPorts, logger: Logger): RepositoryBindingService {
  return new RepositoryBindingService({ ...ports, defects: pluginDefectLog(logger) });
}

// One sanitized error record per plugin defect, of any SCM plugin call.
export function pluginDefectLog(logger: Logger): ScmPluginDefects {
  return {
    defect: ({ integrationId, pluginId, operation, kind }) => logger.error('scm.plugin.defect', { integrationId, pluginId, operation, kind }),
  };
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
